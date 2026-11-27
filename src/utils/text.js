'use strict';

/** Text for a language from an { en, ta } pair, falling back to English. */
const localized = (text, lang) => (text && (text[lang] || text.en)) || '';

module.exports = { localized };
