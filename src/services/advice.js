'use strict';

const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const { TtlCache } = require('../utils/cache');
const { computeImpact } = require('../utils/impact');
const { sanitizeName, sanitizeNote } = require('../utils/sanitize');
const { adviceSchema } = require('../utils/schemas');
const { SYSTEM_INSTRUCTION, INSTRUCTION_SHA } = require('./systemInstruction');
const { telemetry } = require('./telemetry');
const { buildFallbackAdvice } = require('./fallbackAdvice');
const { resolveRunDeps, fetchEnvironmentStage, liveDataBlock } = require('./aiContext');

const cache = new TtlCache({ ttlMs: config.cache.adviceTtlMs, maxEntries: 300 });
telemetry.registerCache('advice', cache);

/**
 * Build the user message for the model. User-written text is isolated under "untrusted".
 * @returns {string}
 */
function buildUserPrompt({ environment, impact, profile, choices, lang, locationName, note }) {
  const { cleanestHour } = environment.air;
  return JSON.stringify(
    {
      language: lang,
      ...liveDataBlock(environment),
      cleanestHour: cleanestHour && { time: cleanestHour.time, aqi: cleanestHour.aqi },
      profile,
      whatIfChoices: choices,
      computedImpact: {
        baseline: impact.baseline,
        scenario: impact.scenario,
        savings: impact.savings,
        community: impact.community,
      },
      untrusted: { locationName, personalNote: note },
    },
    null,
    2,
  );
}

/** Cache key: AQI is bucketed to 10-point steps so near-identical inputs share one AI answer.
 * @returns {string} sha256 hex digest */
function cacheKey({ environment, profile, choices, lang, locationName, note }) {
  const bucket = Math.round(environment.air.current.aqi / 10);
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ bucket, profile, choices, lang, locationName, note }))
    .digest('hex');
}

/**
 * Produce personalised advice for a place and lifestyle.
 * Live air data is always fetched server-side, so a client cannot spoof it.
 *
 * Every call is traced stage by stage (see telemetry.js) so the Engineering page can show
 * exactly how the plan was made: which stages ran, how long they took, what was sent to the
 * model, what came back and whether it passed validation.
 *
 * @param {object} input Validated request body.
 * @param {{getEnvironment?: Function, aiClient?: object, telemetry?: object}} [deps] Test hooks.
 * @returns {Promise<object>}
 */
async function getAdvice(input, deps = {}) {
  const { getEnvironment, aiClient, tel, provider, model } = resolveRunDeps(deps);
  const run = tel.startTrace({
    provider,
    model,
    lang: input.lang,
    aiConfigured: aiClient.isConfigured(),
    systemInstructionSha: INSTRUCTION_SHA,
  });

  try {
    const environment = await fetchEnvironmentStage(run, getEnvironment, input);
    const impact = await run.stage(
      'impact',
      'Compute impact numbers (deterministic)',
      () =>
        computeImpact({
          profile: input.profile,
          choices: input.choices,
          pm25: environment.air.current.pm25,
        }),
      (result) => `CO₂ saved ${result.savings.co2KgPerDay} kg/day`,
    );
    const clean = await run.stage(
      'sanitize',
      'Sanitise free text',
      () => ({ locationName: sanitizeName(input.locationName), note: sanitizeNote(input.notes) }),
      (result) => (result.note.flagged ? 'note dropped: looked like instructions' : 'clean'),
    );

    const context = {
      environment,
      impact,
      profile: input.profile,
      choices: input.choices,
      lang: input.lang,
      locationName: clean.locationName,
      note: clean.note.value,
    };
    const prompt = await run.stage(
      'prompt',
      'Build grounded prompt',
      () => buildUserPrompt(context),
      (text) => `${text.length} characters, user text isolated under "untrusted"`,
    );
    run.setPrompt(prompt);

    const base = {
      impact,
      air: environment.air.current,
      cleanestHour: environment.air.cleanestHour,
      noteIgnored: clean.note.flagged,
      generatedAt: new Date().toISOString(),
    };

    let advice = null;
    let source = 'fallback';
    let fallbackReason = null;

    if (input.engine === 'rules') {
      source = 'rules';
      fallbackReason = 'rules-requested';
      run.skip('ai', 'Call language model', 'the AirSense rule plan was requested, no model used');
      run.skip('validate', 'Validate against schema', 'nothing to validate');
    } else if (!aiClient.isConfigured()) {
      fallbackReason = 'no-api-key';
      run.skip('ai', 'Call language model', 'no API key configured (dry run: prompt shown above)');
      run.skip('validate', 'Validate against schema', 'nothing to validate');
    } else {
      const key = cacheKey(context);
      const cacheHit = cache.get(key) !== undefined;
      run.trace.cacheHit = cacheHit;
      try {
        advice = await cache.wrap(key, async () => {
          const raw = await run.stage(
            'ai',
            'Call language model',
            () => aiClient.generateJson({ system: SYSTEM_INSTRUCTION, user: prompt }),
            () => `${provider} / ${model}`,
          );
          run.setRaw(raw);
          return run.stage(
            'validate',
            'Validate against schema',
            () => adviceSchema.parse(raw),
            () => 'schema ok, unknown keys stripped',
          );
        });
        source = 'ai';
        run.trace.validation = { ok: true, issues: [] };
        if (cacheHit) {
          run.skip('ai', 'Call language model', 'served from advice cache');
          run.skip('validate', 'Validate against schema', 'validated when first cached');
        }
      } catch (error) {
        const isSchemaError = error && error.name === 'ZodError';
        fallbackReason = isSchemaError ? 'invalid-output' : (error && error.code) || 'ai-error';
        run.trace.validation = {
          ok: false,
          issues: isSchemaError
            ? error.issues.slice(0, 5).map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            : [],
        };
        logger.warn('AI advice failed, using rule-based fallback', {
          code: error && error.code,
          name: error && error.name,
        });
      }
    }

    if (!advice) {
      advice = await run.stage(
        'fallback',
        'Build rule-based advice',
        () =>
          buildFallbackAdvice({
            environment,
            impact,
            profile: input.profile,
            choices: input.choices,
            lang: input.lang,
          }),
        () => `reason: ${fallbackReason}`,
      );
    }

    const trace = run.finish({
      source,
      fallbackReason,
      outcome: { ai: 'ai-plan', rules: 'rules-plan' }[source] || 'fallback-plan',
    });
    return { ...base, advice, source, fallbackReason, traceId: trace.id };
  } catch (error) {
    run.finish({ outcome: 'error', fallbackReason: (error && error.code) || 'error' });
    throw error;
  }
}

module.exports = { getAdvice, buildUserPrompt, clearCache: () => cache.clear() };
