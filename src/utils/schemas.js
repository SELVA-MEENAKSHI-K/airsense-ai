'use strict';

const { z } = require('zod');

const COMMUTE_MODES = ['car', 'motorcycle', 'auto', 'bus', 'metro', 'bicycle', 'walk', 'wfh'];

const coordinatesQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

const geocodeQuery = z.object({
  q: z.string().trim().min(2).max(80),
  // Optional ISO country code that narrows the search (used by the country, state, city picker).
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((code) => code.toUpperCase())
    .optional(),
});

const profileSchema = z
  .object({
    commuteMode: z.enum(COMMUTE_MODES).default('motorcycle'),
    commuteKm: z.number().min(0).max(100).default(8),
    homeType: z.enum(['apartment', 'house']).default('apartment'),
    cooking: z.enum(['lpg', 'induction', 'biomass']).default('lpg'),
    vulnerable: z
      .array(z.enum(['children', 'elderly', 'respiratory']))
      .max(3)
      .default([]),
    hasPurifier: z.boolean().default(false),
  })
  .strict();

const choicesSchema = z
  .object({
    switchCommute: z.enum(COMMUTE_MODES).nullable().default(null),
    usePurifier: z.boolean().default(false),
    wearMask: z.boolean().default(false),
    cleanCooking: z.boolean().default(false),
    avoidPeakHours: z.boolean().default(false),
    households: z.number().int().min(1).max(100000).default(1),
  })
  .strict();

const impactBody = z
  .object({
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    pm25: z.number().min(0).max(2000),
    profile: profileSchema.prefault({}),
    choices: choicesSchema.prefault({}),
  })
  .strict();

const adviceBody = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    locationName: z.string().trim().max(80).optional(),
    lang: z.enum(['en', 'ta']).default('en'),
    profile: profileSchema.prefault({}),
    choices: choicesSchema.prefault({}),
    notes: z.string().trim().max(200).optional(),
    // 'rules' asks for the deterministic AirSense plan only; 'auto' tries the language model.
    engine: z.enum(['auto', 'rules']).default('auto'),
  })
  .strict();

/** Shape that the language model must return. Unknown keys are stripped. */
const adviceSchema = z.object({
  summary: z.string().min(1).max(400),
  riskLevel: z.enum(['low', 'moderate', 'high', 'severe']),
  dailyRoutine: z
    .array(
      z.object({
        when: z.string().min(1).max(40),
        action: z.string().min(1).max(260),
        why: z.string().min(1).max(260),
      }),
    )
    .min(2)
    .max(6),
  indoorTips: z
    .array(z.object({ tip: z.string().min(1).max(220), why: z.string().min(1).max(260) }))
    .min(2)
    .max(6),
  sustainableAlternatives: z
    .array(z.object({ swap: z.string().min(1).max(220), why: z.string().min(1).max(260) }))
    .min(2)
    .max(5),
  impactExplanation: z.string().min(1).max(700),
  healthNote: z.string().max(320).optional().default(''),
});

module.exports = {
  COMMUTE_MODES,
  coordinatesQuery,
  geocodeQuery,
  profileSchema,
  choicesSchema,
  impactBody,
  adviceBody,
  adviceSchema,
};

const LIFESTYLES = ['student', 'professional', 'elder', 'parent'];
const TOPICS = ['general', 'indoor', 'sustainability', 'planner'];

const chatBody = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    locationName: z.string().trim().max(80).optional(),
    lang: z.enum(['en', 'ta']).default('en'),
    topic: z.enum(TOPICS).default('general'),
    lifestyle: z.enum(LIFESTYLES).optional(),
    profile: profileSchema.prefault({}),
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict()
  .refine(
    (body) => body.messages.length === 0 || body.messages[body.messages.length - 1].role === 'user',
    {
      message: 'The last message must come from the user',
      path: ['messages'],
    },
  );

/** Shape the chat model must return. */
const chatReplySchema = z.object({
  reply: z.string().min(1).max(1200),
  followUps: z.array(z.string().min(1).max(100)).max(3).default([]),
});

const plannerBody = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    lang: z.enum(['en', 'ta']).default('en'),
    lifestyle: z.enum(LIFESTYLES).default('professional'),
    prefs: z
      .object({
        activities: z
          .array(z.enum(['walking', 'jogging', 'exercise']))
          .max(3)
          .default(['walking']),
        sensitivity: z.enum(['normal', 'high']).default('normal'),
        period: z.enum(['morning', 'afternoon', 'evening']).default('morning'),
        respiratory: z.boolean().default(false),
      })
      .strict()
      .prefault({}),
  })
  .strict();

const lifestyleBody = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lon: z.coerce.number().min(-180).max(180),
    lang: z.enum(['en', 'ta']).default('en'),
    lifestyle: z.enum(LIFESTYLES).default('professional'),
  })
  .strict();

const localQuery = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lon: z.coerce.number().min(-180).max(180),
    lang: z.enum(['en', 'ta']).default('en'),
    place: z.string().trim().max(80).optional(),
    groups: z
      .string()
      .max(60)
      .default('')
      .transform((v) => v.split(',').filter(Boolean))
      .pipe(z.array(z.enum(['children', 'elderly', 'sensitive'])).max(3)),
  })
  .strict();

module.exports.localQuery = localQuery;
module.exports.LIFESTYLES = LIFESTYLES;
module.exports.TOPICS = TOPICS;
module.exports.chatBody = chatBody;
module.exports.chatReplySchema = chatReplySchema;
module.exports.plannerBody = plannerBody;
module.exports.lifestyleBody = lifestyleBody;

const compareBody = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    lang: z.enum(['en', 'ta']).default('en'),
    profile: profileSchema.prefault({}),
  })
  .strict();

module.exports.compareBody = compareBody;
