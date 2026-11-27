'use strict';

/**
 * Pieces shared by every GenAI request (plan and chat): the dependencies a request runs with,
 * the traced "fetch live data" stage, and the live-data block of the model prompt. Keeping them
 * here means plan and chat can never drift apart on what "live data" means.
 */

const config = require('../config');
const { telemetry } = require('./telemetry');
const { summarizeForPrompt, computeWindows } = require('./windows');
const defaultEnvironment = require('./environment');
const defaultAiClient = require('./aiClient');

/** Resolve injectable dependencies and the active model once per request. */
function resolveRunDeps(deps = {}) {
  const { provider } = config.ai;
  return {
    getEnvironment: deps.getEnvironment || defaultEnvironment.getEnvironment,
    aiClient: deps.aiClient || defaultAiClient,
    tel: deps.telemetry || telemetry,
    provider,
    model: provider === 'anthropic' ? config.ai.anthropicModel : config.ai.geminiModel,
  };
}

/** The traced first stage of every request. */
function fetchEnvironmentStage(run, getEnvironment, { lat, lon }) {
  return run.stage(
    'environment',
    'Fetch live air and weather',
    () => getEnvironment(lat, lon),
    (env) => `AQI ${env.air.current.aqi}, PM2.5 ${env.air.current.pm25} µg/m³`,
  );
}

/** The live-data part of a model prompt. Numbers here are the only ones a reply may quote. */
function liveDataBlock(environment) {
  const { current } = environment.air;
  return {
    liveAirQuality: {
      aqi: current.aqi,
      category: current.category,
      pm25: current.pm25,
      pm10: current.pm10,
      no2: current.no2,
      o3: current.o3,
      observedAt: environment.air.updatedAt,
    },
    weather: environment.weather,
    cleanAirWindows: summarizeForPrompt(
      environment.windows || computeWindows(environment.air.forecast),
    ),
  };
}

module.exports = { resolveRunDeps, fetchEnvironmentStage, liveDataBlock };
