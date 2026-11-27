# AirSense AI

A live, location-aware GenAI assistant that helps families and communities cope with severe
winter smog and urban air pollution.

It reads the real air quality for any place, asks a language model for **low-emission daily
routines**, **indoor air-quality hacks** and **sustainable alternatives** tailored to the person's
location and lifestyle, and **explains the direct impact of each choice** with numbers.

The interface is a living skyline, not a static screen: the sky, sun, haze, traffic and day/night
all follow the real air and weather, and "what if" choices visibly clear the smog.

## Challenge 6 checklist

| Requirement                                   | Where it lives                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| GenAI-powered assistant                       | `src/services/aiClient.js` (Gemini or Claude), `src/services/advice.js`                                          |
| Low-emission daily routines                   | `dailyRoutine` in the AI output, rendered as a timeline                                                          |
| Indoor air quality hacks                      | `indoorTips` in the AI output                                                                                    |
| Sustainable alternatives                      | `sustainableAlternatives` in the AI output                                                                       |
| Tailored to location and lifestyle            | Live data for the chosen coordinates, plus commute, home, cooking fuel, household and purifier inputs            |
| Clearly explains the direct impact of choices | `src/utils/impact.js` computes CO₂, PM2.5 exposure, cigarette-equivalents and community effect; AI explains them |
| Real-time data                                | Open-Meteo air quality, forecast and weather; refreshed every 5 minutes and when the tab regains focus           |
| System instruction first                      | `src/services/systemInstruction.js`, sent as the system role on every request                                    |

## Run it

```bash
npm install
cp .env.example .env     # add a key, see below
npm start                # http://localhost:3000
```

AirSense works without a key: it falls back to rule-based advice and says so on screen. Add one key
to switch on the GenAI plan.

```bash
AI_PROVIDER=gemini        # or: anthropic
GEMINI_API_KEY=...        # https://aistudio.google.com/apikey
ANTHROPIC_API_KEY=...     # only if AI_PROVIDER=anthropic
```

Other commands: `npm test`, `npm run test:coverage`, `npm run lint`, `npm run format:check`.

## How the evaluation criteria are met

**Code quality**
Small modules with one job each (`routes/`, `services/`, `middleware/`, `utils/`), JSDoc on public
functions, ESLint (flat config) and Prettier, a single immutable config object, and no duplicated
business rules. The browser code is plain ES modules with no build step.

**Security**

- API keys exist only in server environment variables; nothing is sent to the browser.
- `helmet` with a strict CSP: scripts and connections are same-origin only; framing is denied.
- Every input is validated with `zod` (strict schemas, enums and ranges); unknown keys are rejected.
- Rate limiting: a general limiter plus a tight one on the AI endpoint.
- Prompt-injection defence: the only free text is a place name and a short note. Names are
  character-whitelisted, notes are scanned for instruction-hijacking phrases and dropped if flagged,
  and everything user-written is placed under an `untrusted` key that the system instruction
  declares as data only.
- Live air data is fetched on the server, so a client cannot spoof AQI to steer the model.
- AI output is validated against a schema before use; anything else falls back to rules.
- The browser renders all dynamic text with `textContent`, never `innerHTML`.
- Request bodies are capped at 10 KB, upstream timeouts are enforced, and errors never leak internals.

**Efficiency**

- TTL cache with in-flight de-duplication for air data (about 1 km buckets), geocoding and AI advice.
- Gzip compression, static caching in production, and a debounced "what if" endpoint.
- Weather and air requests run in parallel; weather failure never blocks air data.
- The canvas caps device pixel ratio, avoids per-frame allocation in hot paths and pauses with the tab.

**Testing**
`npm test` runs 125 Jest and Supertest tests covering the AQI bands, the impact model, input
sanitising, the cache, JSON parsing, request validation, every API route, security headers, upstream
failure handling, AI success, AI failure, invalid AI output, and injection handling. External APIs
are mocked, so tests are fast and offline.

**Accessibility**

- Skip link, semantic landmarks, real labels and fieldsets, 44 px touch targets, visible focus.
- Polite live region announces air and plan updates; loading and error messages use `role="status"`.
- The canvas has a text alternative that updates with the live AQI; the forecast chart has a summary label.
- Colour is never the only signal: AQI is also stated in words.
- `prefers-reduced-motion` stops all animation and draws a still frame.
- English and Tamil, with the document language switched and a Tamil-capable font.

**Problem statement alignment**
The checklist above maps each phrase of the challenge to code. The impact numbers are computed
deterministically and the AI is instructed to use only those numbers, so the "direct impact" claims
cannot be hallucinated.

## GenAI design

1. `SYSTEM_INSTRUCTION` defines role, scope, grounding rules, impact explanation, style, language and a strict JSON schema.
2. The user message is one JSON document: live air, weather, cleanest hour, lifestyle profile, chosen
   what-if changes, computed impact numbers, and an `untrusted` block.
3. The reply is parsed, validated with `zod`, cached, and rendered. If the provider is missing, slow,
   or returns bad output, `fallbackAdvice.js` produces advice in the same shape (English and Tamil).

## API

| Method and path                     | Purpose                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                   | Status and whether an AI key is configured                                                                                      |
| `GET /api/geocode?q=`               | Place search                                                                                                                    |
| `GET /api/reverse?lat=&lon=`        | Street, area and city for a position (OpenStreetMap, cached, English and Tamil)                                                 |
| `GET /api/environment?lat=&lon=`    | Live AQI, pollutants, 24 h forecast, cleanest daytime hour, weather                                                             |
| `POST /api/impact`                  | Deterministic impact for a profile and choices                                                                                  |
| `POST /api/advice`                  | AI (or fallback) plan with live data and impact, plus a `traceId`                                                               |
| `POST /api/chat`                    | Gemini (or Claude) chat grounded in live data; answers are checked and fall back to rules if they quote numbers not in the data |
| `GET /api/local?lat=&lon=&groups=`  | Safer outdoor activities and advice for children, older adults, sensitive people, from live AQI                                 |
| `POST /api/planner`                 | Morning/afternoon/evening plan, activity slots, checklist, alert level, by lifestyle                                            |
| `POST /api/compare`                 | Your current habits against the AirSense plan, with PM2.5, cigarette and CO₂ numbers for both                                   |
| `GET /api/indoor?lat=&lon=`         | Ventilation verdict from live AQI, indoor tips, honest plant advice                                                             |
| `GET /api/sustainability?lat=&lon=` | Swaps with computed CO₂ impact (omitted when unreliable), weekly challenge                                                      |
| `GET /api/diagnostics`              | AI config, pipeline, security specs, runtime metrics, quality report                                                            |
| `GET /api/diagnostics/traces/:id`   | One GenAI request: stages, timings, prompt, raw output, validation                                                              |
| `GET /api/system-instruction`       | The system instruction text and its hash                                                                                        |

## 3D experience

The background is a real WebGL city (Three.js, vendored in `public/vendor`, so the strict CSP stays
`script-src 'self'`). Its weather is the live air: fog and sky colour follow AQI and day/night, PM2.5
particles drift with real wind and thicken with pollution, traffic turns teal as "what if" choices
clean the air, and each page flies the camera to a new rig. Cards tilt toward the pointer and rise in
on scroll. With `prefers-reduced-motion`, or without WebGL, it falls back to a still frame or the 2D
skyline, and every motion effect is off.

The sky has a **morning** and a **night** look. It follows the local time of the chosen place by default;
the sun/moon button in the header cycles automatic, morning and night (your choice is remembered).
A colourful cursor (a dot and a trailing ring) is used only with a mouse or trackpad, and is plain
with reduced motion.

## Site map (nav bar)

Home, Dashboard (place search, live gauge, forecast, breathing windows, group advice), My plan (wizard, AirSense plan and AI plan), Impact lab
(what-if), Engineering (live evidence for every evaluation criterion), About. Hash routing, so no
server config is needed.

The **Engineering** page measures rather than claims: your browser runs the security checks against
the real server, the GenAI trace shows each stage of the latest plan with its prompt and raw reply,
the accessibility audit inspects the live DOM, and test/lint/coverage numbers come from
`npm run report` (run it once before showing the page; it writes `src/data/quality-report.json`).

## Project layout

```
src/
  config/        environment configuration
  middleware/    security, validation, error handling
  routes/        HTTP routes
  services/      environment data, geocoding, AI client, advice, fallback, system instruction
  utils/         AQI bands, impact model, sanitising, schemas, cache, HTTP, logging
public/          multi-page app: router, skyline canvas, UI, i18n, Engineering console, styles
scripts/         quality-report.js (real test, lint, format run)
tests/           Jest and Supertest suites
```

## Honest limits

- Impact figures are rounded approximations for awareness (see "How we calculate" in the app), not medical or regulatory values.
- The clearer skyline when many households act together is an illustration, not a forecast.
- The advice is general guidance, not medical advice.
- Air data comes from Open-Meteo (modelled, not a local sensor), so it can differ from a nearby monitor.

## Planner, Indoor air, Green living and chat

- **Location gate**: on the first visit a dialog asks where you are (detect with permission, choose country, state and city from lists, type a place, or pick a popular city; India has every state and union territory, other countries use a country-limited search). The page behind it is inert until you choose. The choice is saved, shown in a bar on every page, and every module (dashboard, planner, indoor, green, plan, chat, 3D sky) reads from it. "Change location" reopens it. Tamil mode shows place names in Tamil (`/api/geocode` returns `nameTa` and `labelTa`).
- **Dashboard** (`#/dashboard`): one module for place and air. Type-ahead search (suggestions appear while you type), "Use my location" (browser permission, high accuracy GPS, street and area named through `/api/reverse`), quick city picks, the live gauge and 24 h forecast, breathing windows on the right, safer outdoor activities and advice for children, older adults and sensitive people (ticking a group tightens the limits), and a Gemini personalised plan via `/api/advice`.
- **My plan** (`#/assistant`): a four-step wizard (travel, home, people, review), then two plans in tabs: the **AirSense plan** (deterministic rule engine, `engine: "rules"`, same answer for the same air) and the **AI plan** (Gemini with the system instruction, validated; if no key is set the tab says so instead of copying the rule plan).
- **Impact lab** (`#/lab`): live controls (commute mode, distance slider, cooking fuel, presets, choices) recompute CO₂, PM2.5 exposure and cigarette-equivalents from the live PM2.5, plus a 24 h exposure chart built from the hourly forecast.
- **Planner** (`#/planner`): Student, Working professional, Elderly person or Parent/family; picks walking, jogging or exercise slots, outdoor vs indoor per period, a daily precaution checklist, and an alert level. Alerts are checked in the browser against live data (in-page banner, optional Notification API); they fire only while a tab is open.
- **Indoor air** (`#/indoor`): live "should I open the windows" verdict with a 24 h strip, affordable fixes with cost badges, kitchen, dust and plant advice with realistic limits.
- **Green living** (`#/green`): transport, energy and habit swaps with estimated CO₂ per year when a reliable figure exists, plus a weekly challenge.
- **Chat** (floating button): the model only sees live readings, and any AQI/PM value in its reply that is not in that data is rejected. Without an API key, rule-based answers use the same live numbers. Every chat shows in the Engineering traces.

## Code health

`npm run dupes` runs jscpd over `src`, `public/js` and `scripts` (currently about 0.15% duplicated lines, all repeated zod field definitions). Shared code lives in one place: `src/services/aiContext.js` (what every GenAI request shares), `src/utils/time.js`, `src/utils/text.js`, `public/js/mathUtil.js`, and the render helpers in `public/js/ui.js` and `public/js/lifestyle.js`.

## Location accuracy

The position is read with high-accuracy GPS and rounded to about 11 m. The street and area come from OpenStreetMap. Air-quality and weather data (Open-Meteo, CAMS model) cover a grid of roughly 10 km, so the reading is for the wider area, not for the exact street; the app says this on the location bar.
