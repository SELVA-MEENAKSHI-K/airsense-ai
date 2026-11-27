'use strict';

/** Hour (0-23) and "HH:MM" of an Open-Meteo local timestamp such as "2026-11-23T14:00". */
const hourOf = (time) => Number(String(time).slice(11, 13));
const clock = (time) => String(time).slice(11, 16);

module.exports = { hourOf, clock };
