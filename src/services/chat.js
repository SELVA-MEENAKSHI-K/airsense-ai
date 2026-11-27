'use strict';

const logger = require('../utils/logger');
const { sanitizeName, collapse, looksLikeInjection } = require('../utils/sanitize');
const { chatReplySchema } = require('../utils/schemas');
const { CHAT_INSTRUCTION, CHAT_INSTRUCTION_SHA } = require('./chatInstruction');
const { buildChatFallback } = require('./chatFallback');
const { resolveRunDeps, fetchEnvironmentStage, liveDataBlock } = require('./aiContext');

const AQI_THRESHOLDS = [0, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301, 500];

const SCOPE_REFUSAL = {
  en: 'I can only help with air quality, pollution, indoor air and greener daily habits. Try asking about today’s air, a mask, or when to exercise.',
  ta: 'காற்றுத் தரம், மாசு, வீட்டுக்குள் காற்று, பசுமைப் பழக்கங்கள் பற்றி மட்டுமே என்னால் உதவ முடியும். இன்றைய காற்று, முகக்கவசம், உடற்பயிற்சி நேரம் பற்றிக் கேளுங்கள்.',
};

/**
 * Reject model replies that quote an AQI or PM2.5 value which is not in the live data.
 * This is the guard behind "never invent current AQI values": a reply that states a wrong
 * reading is discarded and replaced by the rule-based, data-only answer.
 *
 * @param {string} reply
 * @param {{air: {current: object, forecast: Array<{aqi: number, pm25: number|null}>}}} environment
 * @returns {{ok: boolean, issues: string[]}}
 */
function checkGrounding(reply, environment) {
  const { current, forecast = [] } = environment.air;
  const allowedAqi = new Set([current.aqi, ...forecast.map((p) => p.aqi), ...AQI_THRESHOLDS]);
  const allowedPm = [
    current.pm25,
    current.pm10,
    current.no2,
    current.o3,
    ...forecast.map((p) => p.pm25),
  ].filter((value) => Number.isFinite(value));
  const issues = [];

  for (const match of String(reply).matchAll(/AQI[^\d\n]{0,14}(\d{1,3})(?!\d)/gi)) {
    const value = Number(match[1]);
    if (!allowedAqi.has(value)) issues.push(`AQI ${value} is not in the live data`);
  }
  for (const match of String(reply).matchAll(/PM\s?(?:2\.5|10)[^\d\n]{0,14}(\d+(?:\.\d+)?)/gi)) {
    const value = Number(match[1]);
    const known = allowedPm.some((candidate) => Math.abs(candidate - value) <= 0.6);
    // Guideline limits (5, 15, 25, 35, 45, 50, 100) are well-known constants, not readings.
    if (!known && ![5, 15, 25, 35, 45, 50, 100].includes(value)) {
      issues.push(`PM value ${value} is not in the live data`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/** Builds the JSON user prompt: live air data, forecast summary and recent turns.
 * @returns {string} */
function buildChatPrompt({ environment, input, conversation, locationName }) {
  const { forecast } = environment.air;
  const aqis = forecast.map((point) => point.aqi);
  return JSON.stringify(
    {
      language: input.lang,
      topic: input.topic,
      lifestyle: input.lifestyle || null,
      ...liveDataBlock(environment),
      forecastSummary: aqis.length
        ? { next24hMinAqi: Math.min(...aqis), next24hMaxAqi: Math.max(...aqis) }
        : null,
      profile: input.profile,
      untrusted: { locationName, conversation },
    },
    null,
    2,
  );
}

/**
 * Answer one chat turn using live data. Traced stage by stage like plan requests.
 *
 * @param {object} input Validated chat body.
 * @param {{getEnvironment?: Function, aiClient?: object, telemetry?: object}} [deps]
 */
async function getChatReply(input, deps = {}) {
  const { getEnvironment, aiClient, tel, provider, model } = resolveRunDeps(deps);
  const run = tel.startTrace({
    kind: 'chat',
    provider,
    model,
    lang: input.lang,
    topic: input.topic,
    aiConfigured: aiClient.isConfigured(),
    systemInstructionSha: CHAT_INSTRUCTION_SHA,
  });

  try {
    const environment = await fetchEnvironmentStage(run, getEnvironment, input);

    const clean = await run.stage(
      'sanitize',
      'Sanitise conversation',
      () => {
        const conversation = input.messages.map((message) => ({
          role: message.role,
          content: looksLikeInjection(collapse(message.content))
            ? '[removed: looked like instructions]'
            : collapse(message.content),
        }));
        const last = input.messages[input.messages.length - 1];
        return {
          conversation,
          locationName: sanitizeName(input.locationName),
          flagged: looksLikeInjection(collapse(last.content)),
          lastMessage: collapse(last.content),
        };
      },
      (result) =>
        result.flagged ? 'last message looked like instructions: not sent to model' : 'clean',
    );

    const prompt = await run.stage(
      'prompt',
      'Build grounded prompt',
      () =>
        buildChatPrompt({
          environment,
          input,
          conversation: clean.conversation,
          locationName: clean.locationName,
        }),
      (text) => `${text.length} characters, conversation isolated under "untrusted"`,
    );
    run.setPrompt(prompt);

    const fallbackFor = (reason) => {
      const built = buildChatFallback({
        message: clean.lastMessage,
        environment,
        lang: input.lang,
        topic: input.topic,
        lifestyle: input.lifestyle,
      });
      return { ...built, reason };
    };

    let result = null;
    let fallbackReason = null;

    if (clean.flagged) {
      fallbackReason = 'flagged';
      run.skip('ai', 'Call language model', 'skipped: message looked like instructions');
      run.skip('validate', 'Validate and ground-check', 'nothing to validate');
      result = { ...fallbackFor('flagged'), reply: SCOPE_REFUSAL[input.lang] };
    } else if (!aiClient.isConfigured()) {
      fallbackReason = 'no-api-key';
      run.skip('ai', 'Call language model', 'no API key configured (dry run: prompt shown above)');
      run.skip('validate', 'Validate and ground-check', 'nothing to validate');
    } else {
      try {
        const raw = await run.stage(
          'ai',
          'Call language model',
          () => aiClient.generateJson({ system: CHAT_INSTRUCTION, user: prompt }),
          () => `${provider} / ${model}`,
        );
        run.setRaw(raw);
        const parsed = await run.stage(
          'validate',
          'Validate and ground-check',
          () => {
            const value = chatReplySchema.parse(raw);
            const grounding = checkGrounding(value.reply, environment);
            if (!grounding.ok) {
              const error = new Error(grounding.issues.join('; '));
              error.code = 'UNGROUNDED';
              error.issues = grounding.issues;
              throw error;
            }
            return value;
          },
          () => 'schema ok, every AQI and PM value found in live data',
        );
        result = { reply: parsed.reply, followUps: parsed.followUps, intent: 'ai' };
        run.trace.validation = { ok: true, issues: [] };
      } catch (error) {
        const isSchema = error && error.name === 'ZodError';
        fallbackReason = isSchema ? 'invalid-output' : (error && error.code) || 'ai-error';
        run.trace.validation = {
          ok: false,
          issues: isSchema
            ? error.issues.slice(0, 5).map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            : (error && error.issues) || [],
        };
        logger.warn('AI chat failed, using rule-based reply', { code: error && error.code });
      }
    }

    if (!result) {
      result = await run.stage(
        'fallback',
        'Build rule-based reply from live data',
        () => fallbackFor(fallbackReason),
        () => `reason: ${fallbackReason}`,
      );
    }

    const source = fallbackReason ? 'fallback' : 'ai';
    const trace = run.finish({
      source,
      fallbackReason,
      outcome: source === 'ai' ? 'ai-chat' : 'fallback-chat',
    });
    return {
      reply: result.reply,
      followUps: result.followUps,
      source,
      provider,
      fallbackReason,
      air: { aqi: environment.air.current.aqi, category: environment.air.current.category },
      traceId: trace.id,
    };
  } catch (error) {
    run.finish({ outcome: 'error', fallbackReason: (error && error.code) || 'error' });
    throw error;
  }
}

module.exports = { getChatReply, checkGrounding, buildChatPrompt };
