'use strict';

/**
 * Generates src/data/quality-report.json: real results from the test runner, linter and
 * formatter, plus a code map. The Engineering page reads this file, so every number it shows
 * about code quality and testing comes from an actual run, not from a hand-written claim.
 *
 *   npm run report
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'data', 'quality-report.json');

/** Role of each file and the evaluation criteria it serves. */
const MODULES = {
  'src/server.js': ['Process entry, graceful shutdown', ['quality']],
  'src/app.js': ['Express app factory, middleware order', ['quality', 'security', 'efficiency']],
  'src/config/index.js': [
    'Immutable config from environment, no hard-coded secrets',
    ['security', 'quality'],
  ],
  'src/middleware/security.js': ['helmet CSP, CORS, rate limiters', ['security']],
  'src/middleware/validate.js': ['zod validation middleware', ['security', 'quality']],
  'src/middleware/errorHandler.js': ['Safe, uniform error responses', ['security', 'quality']],
  'src/middleware/metrics.js': ['Per-route latency and status metrics', ['efficiency']],
  'src/routes/api.js': ['HTTP routes', ['quality']],
  'src/services/environment.js': ['Live air and weather, cached', ['alignment', 'efficiency']],
  'src/services/geocoding.js': ['Place search, cached', ['alignment', 'efficiency']],
  'src/services/windows.js': [
    'Clean-air windows planner (deterministic)',
    ['alignment', 'efficiency'],
  ],
  'src/services/systemInstruction.js': ['The GenAI system instruction', ['alignment', 'security']],
  'src/services/aiClient.js': [
    'Gemini and Claude clients, timeouts, JSON parsing',
    ['alignment', 'security'],
  ],
  'src/services/advice.js': [
    'Traced GenAI pipeline with validation and fallback',
    ['alignment', 'security'],
  ],
  'src/services/fallbackAdvice.js': [
    'Rule-based advice in English and Tamil',
    ['alignment', 'quality'],
  ],
  'src/services/chat.js': [
    'Grounded chat pipeline: sanitise, prompt, model, grounding check, fallback',
    ['alignment', 'security'],
  ],
  'src/services/chatInstruction.js': ['Chat system instruction', ['alignment', 'security']],
  'src/services/chatFallback.js': ['Rule-based chat answers (EN, TA)', ['alignment', 'quality']],
  'public/js/placeSearch.js': [
    'Accessible type-ahead place search (ARIA combobox)',
    ['accessibility', 'efficiency'],
  ],
  'src/services/aiContext.js': [
    'Shared GenAI run context (plan and chat)',
    ['quality', 'efficiency'],
  ],
  'public/js/mathUtil.js': ['Shared numeric helpers for the 3D city and skyline', ['quality']],
  'public/js/gate.js': [
    'First-run location dialog (detect, search, popular cities; page behind is inert)',
    ['accessibility', 'alignment'],
  ],
  'public/js/regions.js': [
    'Country, state and city lists for the location picker (EN and TA)',
    ['quality'],
  ],
  'public/js/cities.js': ['Known cities, nearest-city naming, Tamil place names', ['quality']],
  'public/js/cursor.js': [
    'Coloured cursor (fine pointers only, reduced-motion aware)',
    ['accessibility'],
  ],
  'public/js/wizard.js': ['Step-by-step plan wizard and plan tabs', ['accessibility', 'quality']],
  'public/js/localView.js': [
    'Dashboard place module: activities, group advice, AI plan',
    ['alignment'],
  ],
  'src/services/local.js': ['Location-based activity safety and group advice', ['alignment']],
  'src/services/planner.js': ['Daily planner and alert level', ['alignment', 'efficiency']],
  'src/services/comparison.js': ['Your plan vs AirSense plan comparison', ['alignment', 'testing']],
  'src/services/indoor.js': ['Indoor air advisor (ventilation verdict, tips)', ['alignment']],
  'src/services/sustainability.js': ['Sustainable actions and weekly challenge', ['alignment']],
  'src/data/lifestyleContent.js': ['Bilingual indoor and sustainability content', ['alignment']],
  'src/services/telemetry.js': ['Request metrics and GenAI traces', ['efficiency', 'quality']],
  'src/services/diagnostics.js': [
    'Engineering page data and live verification specs',
    ['quality', 'security'],
  ],
  'src/utils/aqi.js': ['AQI bands and cigarette equivalents', ['alignment']],
  'src/utils/impact.js': ['Deterministic impact model', ['alignment']],
  'src/utils/sanitize.js': ['Prompt-injection guard', ['security']],
  'src/utils/schemas.js': ['Request and AI-output schemas', ['security', 'quality']],
  'src/utils/cache.js': ['TTL cache with in-flight de-duplication', ['efficiency']],
  'src/utils/http.js': ['Fetch with timeout and safe errors', ['security', 'efficiency']],
  'src/utils/errors.js': ['AppError type', ['quality']],
  'src/utils/logger.js': ['Structured logger', ['quality']],
  'public/js/main.js': ['App controller and live refresh', ['alignment', 'efficiency']],
  'public/js/router.js': ['Hash router and nav bar state', ['accessibility', 'quality']],
  'public/js/world3d.js': [
    'WebGL 3D city driven by live AQI, wind and day/night',
    ['alignment', 'efficiency'],
  ],
  'public/js/backdrop.js': ['3D backdrop with 2D fallback', ['quality', 'accessibility']],
  'public/js/motion.js': [
    'Tilt, scroll reveal, count-up (off for reduced motion)',
    ['accessibility'],
  ],
  'public/js/skyline.js': ['2D canvas skyline fallback', ['alignment']],
  'public/js/ui.js': ['Safe DOM rendering (textContent only)', ['security', 'accessibility']],
  'public/js/i18n.js': ['English and Tamil strings', ['accessibility']],
  'public/js/api.js': ['API client with timeouts', ['quality']],
  'public/js/engineering.js': ['Engineering console: live checks and GenAI trace', ['quality']],
  'public/js/a11yAudit.js': ['Live accessibility self-audit', ['accessibility']],
  'public/css/styles.css': ['Design system and layout', ['accessibility']],
  'public/index.html': ['Semantic page shell', ['accessibility']],
};

const lineCount = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').length;

/** Run a Node-based CLI through the current Node binary, so it works on Windows too. */
function runNode(script, args) {
  return spawnSync(process.execPath, [path.join(ROOT, 'node_modules', script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function runJest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'airsense-report-'));
  const results = path.join(dir, 'jest.json');
  runNode('jest/bin/jest.js', [
    '--runInBand',
    '--json',
    `--outputFile=${results}`,
    '--coverage',
    '--coverageReporters=json-summary',
    `--coverageDirectory=${dir}`,
  ]);
  const data = JSON.parse(fs.readFileSync(results, 'utf8'));
  const summary = JSON.parse(fs.readFileSync(path.join(dir, 'coverage-summary.json'), 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });

  const pct = (key) => Math.round(summary.total[key].pct * 10) / 10;
  return {
    total: data.numTotalTests,
    passed: data.numPassedTests,
    failed: data.numFailedTests,
    suites: data.testResults
      .map((suite) => ({
        file: path.relative(ROOT, suite.name).split(path.sep).join('/'),
        tests: suite.assertionResults.length,
        passed: suite.assertionResults.filter((a) => a.status === 'passed').length,
        names: suite.assertionResults.map((a) => a.title),
      }))
      .sort((a, b) => a.file.localeCompare(b.file)),
    coverage: {
      lines: pct('lines'),
      statements: pct('statements'),
      functions: pct('functions'),
      branches: pct('branches'),
    },
  };
}

function runLint() {
  const run = runNode('eslint/bin/eslint.js', ['.', '-f', 'json']);
  const files = JSON.parse(run.stdout || '[]');
  return {
    files: files.length,
    errors: files.reduce((sum, file) => sum + file.errorCount, 0),
    warnings: files.reduce((sum, file) => sum + file.warningCount, 0),
  };
}

function runFormat() {
  return { passed: runNode('prettier/bin/prettier.cjs', ['--check', '.']).status === 0 };
}

function buildCodeMap() {
  const files = Object.entries(MODULES)
    .filter(([file]) => fs.existsSync(path.join(ROOT, file)))
    .map(([file, [role, criteria]]) => ({ file, role, criteria, lines: lineCount(file) }));
  const sum = (list) => list.reduce((total, item) => total + item.lines, 0);
  const tests = fs
    .readdirSync(path.join(ROOT, 'tests'))
    .filter((name) => name.endsWith('.test.js'))
    .map((name) => ({ lines: lineCount(`tests/${name}`) }));
  return { files, sourceLines: sum(files), testLines: sum(tests) };
}

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  tests: runJest(),
  lint: runLint(),
  format: runFormat(),
  codeMap: buildCodeMap(),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

const { tests, lint, format } = report;
console.log(
  `tests ${tests.passed}/${tests.total}, coverage ${tests.coverage.lines}% lines, ` +
    `lint ${lint.errors} errors, format ${format.passed ? 'ok' : 'FAILED'}`,
);
process.exitCode = tests.failed || lint.errors || !format.passed ? 1 : 0;
