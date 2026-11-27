/**
 * Engineering console: the build, inspectable.
 *
 * Everything shown here is measured at runtime, not claimed:
 *  - security checks send real requests to this server and read its real response headers;
 *  - the GenAI trace is the latest real plan request, stage by stage, with its prompt;
 *  - the accessibility audit inspects the live DOM;
 *  - test, lint and coverage numbers come from `npm run report`.
 */
import { api, probe } from './api.js';
import { el } from './ui.js';
import { runAudit } from './a11yAudit.js';

const fmt = (n, d = 0) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: d });
const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour12: false });

const badge = (pass, yes = 'pass', no = 'fail') =>
  el('span', { class: `badge ${pass ? 'ok' : 'bad'}`, text: pass ? yes : no });

function section(id, title, lede, ...children) {
  return el(
    'section',
    { class: 'panel eng-section', attrs: { id, 'aria-labelledby': `${id}-h` } },
    el('h2', { class: 'panel-h', text: title, attrs: { id: `${id}-h` } }),
    lede ? el('p', { class: 'lede', text: lede }) : null,
    ...children,
  );
}

function kv(rows) {
  return el(
    'dl',
    { class: 'kv' },
    ...rows.map(([k, v]) =>
      el('div', { class: 'kv-row' }, el('dt', { text: k }), el('dd', { text: String(v) })),
    ),
  );
}

function table(head, rows) {
  const thead = el(
    'thead',
    null,
    el('tr', null, ...head.map((h) => el('th', { text: h, attrs: { scope: 'col' } }))),
  );
  const tbody = el(
    'tbody',
    null,
    ...rows.map((row) =>
      el(
        'tr',
        null,
        ...row.map((cell) =>
          el('td', null, cell instanceof Node ? cell : document.createTextNode(String(cell))),
        ),
      ),
    ),
  );
  return el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, thead, tbody));
}

/* ---------- live checks ---------- */

/** Run every security control against this server. */
export async function runSecurityChecks(controls) {
  const base = await probe('/api/health');
  const results = [];
  for (const control of controls) {
    const spec = control.verify;
    try {
      if (spec.type === 'header') {
        const value = base.headers.get(spec.name);
        let pass = true;
        if (spec.contains) pass = Boolean(value) && value.includes(spec.contains);
        if (spec.equals) pass = value === spec.equals;
        if (spec.absent) pass = value === null;
        if (spec.present) pass = value !== null;
        results.push({
          control,
          pass,
          detail: spec.absent
            ? value === null
              ? 'header absent'
              : value
            : value || 'header missing',
        });
      } else {
        const hasBody = spec.body !== undefined;
        const res = await probe(spec.path, {
          method: spec.method,
          body: hasBody ? JSON.stringify(spec.body) : undefined,
          headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
        });
        results.push({
          control,
          pass: res.status === spec.expectStatus,
          detail: `${spec.method} ${spec.path} → ${res.status} (expected ${spec.expectStatus})`,
        });
      }
    } catch (error) {
      results.push({ control, pass: false, detail: error.message });
    }
  }
  return results;
}

/* ---------- renderers ---------- */

function renderScorecard(card) {
  const items = [
    ['quality', 'Code quality', card.quality],
    ['security', 'Security', card.security],
    ['efficiency', 'Efficiency', card.efficiency],
    ['testing', 'Testing', card.testing],
    ['access', 'Accessibility', card.access],
    ['align', 'Alignment', card.align],
  ];
  return el(
    'ul',
    { class: 'score-grid' },
    ...items.map(([target, title, data]) => {
      const button = el(
        'button',
        { class: 'score', attrs: { type: 'button', 'data-target': `eng-${target}` } },
        el('span', { class: 'score-title', text: title }),
        el('span', { class: `score-value ${data.ok === false ? 'bad' : ''}`, text: data.value }),
        el('span', { class: 'score-sub', text: data.sub }),
      );
      button.addEventListener('click', () => {
        const node = document.getElementById(`eng-${target}`);
        if (node) {
          node.scrollIntoView({ behavior: 'smooth', block: 'start' });
          node.focus({ preventScroll: true });
        }
      });
      return el('li', null, button);
    }),
  );
}

function renderPipeline(diag, trace) {
  const byKey = new Map((trace ? trace.steps : []).map((step) => [step.key, step]));
  const list = el('ol', { class: 'pipe' });
  for (const stage of diag.pipeline) {
    const step = byKey.get(stage.key);
    const status = step ? step.status : 'idle';
    list.append(
      el(
        'li',
        { class: `pipe-step ${status}` },
        el(
          'div',
          { class: 'pipe-head' },
          el('strong', { text: stage.title }),
          el('span', { class: `badge ${status}`, text: status === 'ok' ? 'done' : status }),
          el('span', {
            class: 'pipe-ms',
            text: step && step.status !== 'skipped' ? `${fmt(step.ms, 1)} ms` : '',
          }),
        ),
        el('p', { class: 'pipe-detail', text: (step && step.detail) || stage.detail }),
        el('code', { class: 'where', text: stage.where }),
      ),
    );
  }
  return list;
}

function codeBlock(label, text) {
  return el(
    'details',
    { class: 'code-details' },
    el('summary', { text: label }),
    el('pre', { class: 'code', text }),
  );
}

function prettyJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function renderGenAi(diag, trace, instruction) {
  const ai = diag.ai;
  const status = el(
    'p',
    { class: `ai-state ${ai.configured ? 'live' : 'dry'}` },
    el('span', { class: 'ai-dot', attrs: { 'aria-hidden': 'true' } }),
    document.createTextNode(
      ai.configured
        ? `Live: ${ai.provider} · ${ai.model} is answering plan requests.`
        : `Dry run: no API key is set, so the model is skipped and the rule engine answers. The prompt below is exactly what would be sent once ${ai.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY'} is added.`,
    ),
  );

  const parts = [status];
  parts.push(
    kv([
      ['Provider and model', `${ai.provider} · ${ai.model}`],
      ['Output contract', ai.outputContract],
      ['Temperature', ai.temperature],
      ['Timeout', `${fmt(ai.timeoutMs)} ms`],
      [
        'System instruction',
        `${ai.systemInstruction.sha} · ${ai.systemInstruction.lines} lines · ${fmt(ai.systemInstruction.characters)} chars`,
      ],
      ['Instruction sections', ai.systemInstruction.sections.join(' · ')],
    ]),
  );

  if (trace) {
    parts.push(
      el('h3', { class: 'sub', text: 'Latest plan request' }),
      kv([
        ['Trace id', trace.id],
        ['Started', clock(trace.startedAt)],
        ['Total time', `${fmt(trace.totalMs, 0)} ms`],
        ['Answered by', trace.source === 'ai' ? `${ai.provider} model` : 'rule engine'],
        ['Fallback reason', trace.fallbackReason || 'none'],
        ['Cache', trace.cacheHit ? 'hit (model not called)' : 'miss'],
        [
          'Validation',
          trace.validation
            ? trace.validation.ok
              ? 'schema passed'
              : `failed: ${trace.validation.issues.join('; ')}`
            : 'not reached',
        ],
      ]),
    );
  } else {
    parts.push(
      el('p', {
        class: 'hint',
        text: 'No plan has been requested yet. Open the Assistant page, or run a sample below.',
      }),
    );
  }

  parts.push(renderPipeline(diag, trace));
  if (trace && trace.prompt)
    parts.push(
      codeBlock(
        'Prompt sent as the user message (untrusted text isolated)',
        prettyJson(trace.prompt),
      ),
    );
  if (trace && trace.rawOutput)
    parts.push(codeBlock('Raw model output', prettyJson(trace.rawOutput)));
  if (instruction)
    parts.push(codeBlock(`System instruction (sha ${instruction.sha})`, instruction.text));
  return parts;
}

function renderSecurity(results) {
  const passed = results.filter((r) => r.pass).length;
  return [
    el('p', {
      class: 'verdict',
      text: `${passed} of ${results.length} controls verified against this server just now.`,
    }),
    table(
      ['Control', 'Result', 'Evidence'],
      results.map((r) => [r.control.label, badge(r.pass), r.detail]),
    ),
  ];
}

function renderRuntime(runtime, gzip) {
  const routes = Object.entries(runtime.byRoute).sort((a, b) => b[1].count - a[1].count);
  const caches = Object.entries(runtime.caches);
  return [
    kv([
      ['Uptime', `${fmt(runtime.uptimeSec)} s`],
      ['Requests served', fmt(runtime.totalRequests)],
      ['Response compression', gzip || 'none'],
      ['Rate limit', `${runtime.limits.apiMax}/min API, ${runtime.limits.adviceMax}/min advice`],
      ['Upstream timeout', `${fmt(runtime.limits.upstreamTimeoutMs)} ms`],
    ]),
    el('h3', { class: 'sub', text: 'Cache hit rates (fewer upstream calls)' }),
    caches.length
      ? table(
          ['Cache', 'Hits', 'Misses', 'Hit rate', 'TTL'],
          caches.map(([name, c]) => [name, c.hits, c.misses, `${c.hitRate}%`, `${c.ttlSec}s`]),
        )
      : el('p', { class: 'hint', text: 'No cache activity yet.' }),
    el('h3', { class: 'sub', text: 'Latency by route' }),
    routes.length
      ? table(
          ['Route', 'Calls', 'p50', 'p95', '5xx'],
          routes.map(([name, r]) => [
            name,
            r.count,
            `${fmt(r.p50Ms, 1)} ms`,
            `${fmt(r.p95Ms, 1)} ms`,
            r.errors,
          ]),
        )
      : el('p', { class: 'hint', text: 'No requests recorded yet.' }),
  ];
}

function renderTesting(quality) {
  if (!quality) {
    return [
      el('p', {
        class: 'hint',
        text: 'Run "npm run report" to record real test, lint and coverage results here.',
      }),
    ];
  }
  const { tests, lint, format } = quality;
  return [
    kv([
      ['Tests', `${tests.passed} passed of ${tests.total}`],
      [
        'Coverage',
        `${tests.coverage.lines}% lines · ${tests.coverage.functions}% functions · ${tests.coverage.branches}% branches`,
      ],
      ['ESLint', `${lint.errors} errors, ${lint.warnings} warnings in ${lint.files} files`],
      ['Prettier', format.passed ? 'all files formatted' : 'needs formatting'],
      [
        'Recorded',
        `${new Date(quality.generatedAt).toLocaleString('en-IN')} on Node ${quality.node}`,
      ],
    ]),
    table(
      ['Suite', 'Passed', 'What it proves'],
      tests.suites.map((suite) => [
        suite.file,
        `${suite.passed}/${suite.tests}`,
        el(
          'details',
          null,
          el('summary', { text: `${suite.tests} cases` }),
          el('ul', { class: 'case-list' }, ...suite.names.map((n) => el('li', { text: n }))),
        ),
      ]),
    ),
  ];
}

function renderCodeMap(quality, controls, alignment) {
  const out = [];
  out.push(
    table(
      ['Requirement', 'Implemented in'],
      alignment.map((row) => [
        row.requirement,
        el(
          'span',
          null,
          ...row.files
            .flatMap((f, i) => [i ? document.createTextNode(' · ') : null, el('code', { text: f })])
            .filter(Boolean),
        ),
      ]),
    ),
  );
  if (quality) {
    out.push(
      el('h3', {
        class: 'sub',
        text: `Code map · ${fmt(quality.codeMap.sourceLines)} source lines, ${fmt(quality.codeMap.testLines)} test lines`,
      }),
      table(
        ['File', 'Role', 'Serves', 'Lines'],
        quality.codeMap.files.map((f) => [
          el('code', { text: f.file }),
          f.role,
          f.criteria.join(', '),
          f.lines,
        ]),
      ),
    );
  }
  return out;
}

function renderAccess(results) {
  const passed = results.filter((r) => r.pass).length;
  return [
    el('p', {
      class: 'verdict',
      text: `${passed} of ${results.length} checks pass on the page you are viewing now.`,
    }),
    table(
      ['Check', 'Result', 'Evidence'],
      results.map((r) => [r.label, badge(r.pass), r.detail]),
    ),
  ];
}

/* ---------- mount ---------- */

/**
 * @param {HTMLElement} root
 * @param {{getTraceId: () => string|null}} options
 */
export function mountEngineering(root, { getTraceId }) {
  let busy = false;

  async function refresh() {
    if (busy) return;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    try {
      const [diag, instruction] = await Promise.all([
        api.diagnostics(),
        api.systemInstruction().catch(() => null),
      ]);
      const gzip =
        (await probe('/api/diagnostics')
          .then((r) => r.headers.get('content-encoding'))
          .catch(() => null)) || null;

      const traceId = getTraceId() || (diag.traces[0] && diag.traces[0].id);
      let trace = null;
      if (traceId) {
        trace = await api
          .trace(traceId)
          .then((r) => r.trace)
          .catch(() => null);
      }

      const security = await runSecurityChecks(diag.controls);
      const access = runAudit(document);
      const secPass = security.filter((r) => r.pass).length;
      const accPass = access.filter((r) => r.pass).length;
      const q = diag.quality;
      const caches = Object.values(diag.runtime.caches);
      const lookups = caches.reduce((n, c) => n + c.hits + c.misses, 0);
      const hits = caches.reduce((n, c) => n + c.hits, 0);
      const planRoute = diag.runtime.byRoute['GET /api/environment'];

      const scorecard = renderScorecard({
        quality: q
          ? {
              value: q.lint.errors === 0 && q.format.passed ? 'Clean' : 'Issues',
              ok: q.lint.errors === 0 && q.format.passed,
              sub: `${q.lint.errors} lint errors · ${fmt(q.codeMap.sourceLines)} lines`,
            }
          : { value: 'n/a', sub: 'run npm run report' },
        security: {
          value: `${secPass}/${security.length}`,
          ok: secPass === security.length,
          sub: 'verified live',
        },
        efficiency: {
          value: planRoute ? `${fmt(planRoute.p95Ms, 0)} ms` : '—',
          sub: `p95 live data · cache ${lookups ? Math.round((hits / lookups) * 100) : 0}% hit`,
        },
        testing: q
          ? {
              value: `${q.tests.passed}/${q.tests.total}`,
              ok: q.tests.failed === 0,
              sub: `${q.tests.coverage.lines}% line coverage`,
            }
          : { value: 'n/a', sub: 'run npm run report' },
        access: {
          value: `${accPass}/${access.length}`,
          ok: accPass === access.length,
          sub: 'live DOM audit',
        },
        align: {
          value: `${diag.alignment.length}/${diag.alignment.length}`,
          sub: 'requirements mapped to code',
        },
      });

      root.replaceChildren(
        el('h1', { class: 'page-h', text: 'Engineering', attrs: { id: 'eng-h' } }),
        el(
          'div',
          { class: 'eng-bar' },
          el('p', {
            class: 'lede',
            text: `Measured live from this server at ${clock(diag.generatedAt)} · ${diag.environment} · Node ${diag.node}`,
          }),
          (() => {
            const button = el('button', {
              class: 'btn btn-quiet',
              text: 'Re-run everything',
              attrs: { type: 'button' },
            });
            button.addEventListener('click', refresh);
            return button;
          })(),
        ),
        scorecard,
        section(
          'eng-genai',
          'GenAI, working live',
          'How the assistant turns live data into a plan, stage by stage, with the exact prompt and the model’s raw reply.',
          ...renderGenAi(diag, trace, instruction),
        ),
        section(
          'eng-security',
          'Security, verified live',
          'Each control below is tested against this running server by your browser. Nothing here is a screenshot.',
          ...renderSecurity(security),
        ),
        section(
          'eng-efficiency',
          'Efficiency',
          'Request latency, caching and limits recorded since the server started.',
          ...renderRuntime(diag.runtime, gzip),
        ),
        section(
          'eng-testing',
          'Testing and code quality',
          'Results of a real run of Jest, ESLint and Prettier.',
          ...renderTesting(q),
        ),
        section(
          'eng-access',
          'Accessibility, audited live',
          'The checks run against the DOM of this page, right now.',
          ...renderAccess(access),
        ),
        section(
          'eng-align',
          'Problem-statement alignment and code map',
          'Each requirement of the challenge, and the files that deliver it.',
          ...renderCodeMap(q, diag.controls, diag.alignment),
        ),
      );
      for (const node of root.querySelectorAll('.eng-section')) node.setAttribute('tabindex', '-1');
    } catch {
      root.replaceChildren(
        el('h1', { class: 'page-h', text: 'Engineering' }),
        el('p', { class: 'message error', text: 'Could not read diagnostics from the server.' }),
      );
    } finally {
      root.setAttribute('aria-busy', 'false');
      busy = false;
    }
  }

  return { refresh };
}
