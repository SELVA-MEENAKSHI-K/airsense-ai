'use strict';

/**
 * Editorial content for the Indoor air and Green living pages. Static advice lives here; the
 * live parts (ventilation status, gates, impact numbers) are computed by the services from the
 * real AQI. Each text has English and Tamil.
 */

const INDOOR_SECTIONS = [
  {
    key: 'ventilation',
    title: { en: 'Ventilation', ta: 'காற்றோட்டம்' },
    items: [
      {
        cost: 'free',
        title: {
          en: 'Air the home in the cleanest slot only',
          ta: 'தூய்மையான நேரத்தில் மட்டும் காற்றோட்டம்',
        },
        body: {
          en: 'Open windows on opposite sides for 10 to 15 minutes when outdoor AQI is lowest. Short and deliberate beats leaving windows open all day.',
          ta: 'வெளியில் AQI குறைவாக இருக்கும்போது எதிர்ப்பக்க ஜன்னல்களை 10-15 நிமிடம் திறங்கள். நாள் முழுவதும் திறந்து வைப்பதைவிட இது நல்லது.',
        },
      },
      {
        cost: 'free',
        title: { en: 'Close up before dusk', ta: 'அந்திக்கு முன் மூடுங்கள்' },
        body: {
          en: 'Winter smog usually thickens as the air cools in the evening. Shut windows before sunset and keep them shut overnight.',
          ta: 'குளிர்காலத்தில் மாலையில் காற்று குளிர்ந்ததும் புகைமூட்டம் அடர்த்தியாகும். சூரியன் மறையும் முன் ஜன்னல்களை மூடி இரவு முழுவதும் மூடியே வையுங்கள்.',
        },
      },
      {
        cost: 'low',
        title: { en: 'Seal the leaks', ta: 'இடைவெளிகளை அடையுங்கள்' },
        body: {
          en: 'Draught strips on doors and windows cut the dust that seeps in, and make a purifier work better.',
          ta: 'கதவு, ஜன்னல்களில் டிராஃப்ட் ஸ்ட்ரிப் ஒட்டினால் உள்ளே வரும் தூசி குறையும்; சுத்திகரிப்பானும் நன்றாக வேலை செய்யும்.',
        },
      },
    ],
  },
  {
    key: 'dust',
    title: { en: 'Dust, smoke and household pollutants', ta: 'தூசி, புகை, வீட்டு மாசுகள்' },
    items: [
      {
        cost: 'free',
        title: { en: 'Damp-mop and wipe, do not dry-sweep', ta: 'உலர் பெருக்க வேண்டாம், ஈரத் துடைப்பு' },
        body: {
          en: 'Dry sweeping lifts settled dust back into the air. A damp mop and a damp cloth trap it.',
          ta: 'உலர் பெருக்கல் படிந்த தூசியை மீண்டும் காற்றில் கிளப்பும். ஈரத் துணி அதைப் பிடித்துக்கொள்ளும்.',
        },
      },
      {
        cost: 'free',
        title: {
          en: 'Skip incense, mosquito coils and candles indoors',
          ta: 'வீட்டுக்குள் ஊதுபத்தி, கொசுச் சுருள், மெழுகுவர்த்தி வேண்டாம்',
        },
        body: {
          en: 'They release a lot of fine particles. Use a net or repellent patch for mosquitoes, and keep prayer smoke near an open door or a ventilated spot. Never smoke indoors.',
          ta: 'இவை நிறைய நுண்துகள்களை வெளியிடும். கொசுவுக்கு வலை அல்லது ரிப்பெல்லன்ட் பயன்படுத்துங்கள். வீட்டுக்குள் புகைபிடிக்க வேண்டாம்.',
        },
      },
      {
        cost: 'free',
        title: {
          en: 'Shoes off, bedsheets weekly',
          ta: 'காலணிகளை வெளியே விடுங்கள், படுக்கை விரிப்பை வாரம் ஒருமுறை துவையுங்கள்',
        },
        body: {
          en: 'A doormat and a shoe rack at the entrance stop outdoor dust at the door. Hot-wash bedding weekly to reduce dust mites.',
          ta: 'நுழைவாயிலில் கால் மிதியடி, காலணி அடுக்கு தூசியைத் தடுக்கும். படுக்கை விரிப்பை சூடான நீரில் வாரம் ஒருமுறை துவையுங்கள்.',
        },
      },
      {
        cost: 'low',
        title: { en: 'Vacuum with a HEPA filter', ta: 'HEPA வடிகட்டியுடன் வெற்றிடம்' },
        body: {
          en: 'A vacuum without a good filter blows fine dust back out. If you do not have one, damp wiping is the better choice.',
          ta: 'நல்ல வடிகட்டி இல்லாத வெற்றிட இயந்திரம் நுண்தூசியை வெளியே ஊதும். இல்லையென்றால் ஈரத் துடைப்பு சிறந்தது.',
        },
      },
    ],
  },
  {
    key: 'kitchen',
    title: { en: 'Kitchen', ta: 'சமையலறை' },
    items: [
      {
        cost: 'free',
        title: {
          en: 'Run the chimney or exhaust fan while cooking and for 10 minutes after',
          ta: 'சமைக்கும்போதும் பின் 10 நிமிடமும் சிம்னி/எக்ஸாஸ்ட் ஃபேன் ஓட்டுங்கள்',
        },
        body: {
          en: 'Cooking, especially frying, makes fine particles and gases. Pulling them straight outside keeps them out of living and sleeping rooms.',
          ta: 'சமையல், குறிப்பாக பொரித்தல், நுண்துகள், வாயுக்களை உருவாக்கும். அவற்றை நேராக வெளியே இழுப்பது படுக்கை, வரவேற்பறைக்குப் பரவாமல் காக்கும்.',
        },
      },
      {
        cost: 'free',
        title: { en: 'Cook with lids on, at medium heat', ta: 'மூடி போட்டு, மிதமான தீயில் சமையுங்கள்' },
        body: {
          en: 'Lower heat and covered pots make less smoke and save fuel too.',
          ta: 'குறைவான தீயும் மூடிய பாத்திரமும் குறைவான புகை தரும்; எரிபொருளும் மிச்சம்.',
        },
      },
      {
        cost: 'low',
        title: {
          en: 'Clean burners and chimney filters monthly',
          ta: 'பர்னர், சிம்னி வடிகட்டியை மாதம் ஒருமுறை சுத்தம் செய்யுங்கள்',
        },
        body: {
          en: 'Clogged burners give a yellow, sooty flame. A steady blue flame burns cleaner. A greasy filter pulls less air.',
          ta: 'அடைபட்ட பர்னர் மஞ்சள், கரிப்படிந்த சுடரைத் தரும். நிலையான நீலச் சுடர் தூய்மையாக எரியும். எண்ணெய்ப் பிசுக்கான வடிகட்டி குறைவான காற்றையே இழுக்கும்.',
        },
      },
      {
        cost: 'medium',
        title: {
          en: 'Move toward induction or cleaner fuel when you can',
          ta: 'முடிந்தால் இண்டக்ஷன் அல்லது தூய எரிபொருளுக்கு மாறுங்கள்',
        },
        body: {
          en: 'Induction makes no combustion smoke indoors. LPG is much cleaner than firewood, dung cakes or coal.',
          ta: 'இண்டக்ஷன் வீட்டுக்குள் எரிப்புப் புகையை உருவாக்காது. விறகு, சாணம், நிலக்கரியைவிட LPG மிகவும் தூய்மை.',
        },
      },
    ],
  },
  {
    key: 'budget',
    title: { en: 'Practical and affordable', ta: 'நடைமுறை, குறைந்த செலவு' },
    items: [
      {
        cost: 'low',
        title: { en: 'Build a Corsi-Rosenthal box', ta: 'கார்சி-ரோசென்தால் பெட்டி அமையுங்கள்' },
        body: {
          en: 'A box fan with four high-grade furnace filters (MERV 13 or better) taped into a cube is a well-tested low-cost way to clean a room. Keep the fan on a low setting for quiet.',
          ta: 'நான்கு உயர்தர ஃபர்னஸ் வடிகட்டிகளை (MERV 13 அல்லது மேல்) கனசதுரமாக ஒட்டி, பெட்டி மின்விசிறியில் பொருத்தினால் குறைந்த செலவில் அறையைச் சுத்தப்படுத்தலாம். குறைந்த வேகத்தில் ஓடவிடுங்கள்.',
        },
      },
      {
        cost: 'medium',
        title: {
          en: 'Pick a purifier by room size, run it in the bedroom',
          ta: 'அறை அளவுக்கேற்ற சுத்திகரிப்பான், படுக்கையறையில் இயக்குங்கள்',
        },
        body: {
          en: 'Choose a HEPA purifier whose rated clean-air delivery suits your room, keep the door closed, and replace filters on schedule. Bedroom at night is where it matters most.',
          ta: 'அறைக்குப் பொருந்தும் HEPA சுத்திகரிப்பானைத் தேர்வு செய்யுங்கள்; கதவை மூடி, வடிகட்டியை நேரத்துக்கு மாற்றுங்கள். இரவில் படுக்கையறையில் இதன் பலன் அதிகம்.',
        },
      },
      {
        cost: 'low',
        title: { en: 'Wear an N95 for dusty chores', ta: 'தூசி வேலைகளுக்கு N95 அணியுங்கள்' },
        body: {
          en: 'Sweeping outside, clearing storerooms and renovation dust are worth a mask.',
          ta: 'வெளியில் பெருக்குதல், அறையைச் சுத்தம் செய்தல், புதுப்பிப்புத் தூசிக்கு முகக்கவசம் அணியுங்கள்.',
        },
      },
      {
        cost: 'free',
        title: { en: 'Fix damp, stop mould', ta: 'ஈரத்தைச் சரிசெய்யுங்கள், பூஞ்சையைத் தடுங்கள்' },
        body: {
          en: 'Leaks and damp walls grow mould, which irritates lungs. Dry bathrooms after use and repair seepage.',
          ta: 'கசிவு, ஈரச் சுவர்களில் பூஞ்சை வளர்ந்து நுரையீரலை எரிச்சலூட்டும். குளியலறையை உலர வைத்து, கசிவைச் சரிசெய்யுங்கள்.',
        },
      },
    ],
  },
];

const PLANTS = {
  intro: {
    en: 'Plants are lovely, but be realistic.',
    ta: 'செடிகள் அழகானவை; ஆனால் உண்மையாக யோசியுங்கள்.',
  },
  honest: {
    en: 'The often-quoted claim comes from sealed lab chambers. In a real home, fresh air coming in dilutes pollutants far more than leaves can remove them, so you would need an impractical number of plants to match one purifier or an open window at the right time. Treat plants as a mood and greenery boost, not an air cleaner.',
    ta: 'பலரும் சொல்லும் கூற்று மூடிய ஆய்வகப் பெட்டிகளிலிருந்து வந்தது. உண்மையான வீட்டில், உள்ளே வரும் புதிய காற்று இலைகள் நீக்குவதைவிட மிக அதிகமாக மாசைக் கரைக்கும்; ஒரு சுத்திகரிப்பானுக்கு நிகராக நடைமுறையில் சாத்தியமற்ற எண்ணிக்கையில் செடிகள் வேண்டும். செடிகளை மனநிறைவுக்காக வளருங்கள், காற்றுச் சுத்திகரிப்புக்காக அல்ல.',
  },
  items: [
    {
      name: { en: 'Snake plant', ta: 'பாம்புச் செடி' },
      note: {
        en: 'Very hardy, needs little light and water. Good first plant.',
        ta: 'மிகவும் உறுதியானது; குறைந்த ஒளி, நீர் போதும்.',
      },
      caution: { en: 'Mildly toxic to pets if chewed.', ta: 'செல்லப்பிராணிகள் மென்றால் லேசான நச்சு.' },
    },
    {
      name: { en: 'Areca palm', ta: 'அரிக்கா பனை' },
      note: {
        en: 'Likes bright indirect light. Adds greenery and some humidity.',
        ta: 'பிரகாசமான மறைமுக ஒளி விரும்பும்; பசுமையும் சிறிது ஈரப்பதமும் தரும்.',
      },
      caution: {
        en: 'Needs regular watering; wet soil can grow mould.',
        ta: 'தொடர்ந்து நீர் வேண்டும்; ஈர மண்ணில் பூஞ்சை வளரலாம்.',
      },
    },
    {
      name: { en: 'Money plant (pothos)', ta: 'மணி பிளாண்ட்' },
      note: {
        en: 'Easy to grow in a pot or a bottle of water.',
        ta: 'தொட்டியிலோ நீர்ப் புட்டியிலோ எளிதாக வளரும்.',
      },
      caution: { en: 'Toxic to pets if chewed.', ta: 'செல்லப்பிராணிகள் மென்றால் நச்சு.' },
    },
    {
      name: { en: 'Peace lily', ta: 'பீஸ் லில்லி' },
      note: {
        en: 'Flowers in shade. Droops when it needs water.',
        ta: 'நிழலிலும் பூக்கும்; நீர் தேவைப்பட்டால் வாடும்.',
      },
      caution: {
        en: 'Toxic to pets; skip it if someone has asthma, as damp soil and pollen can irritate.',
        ta: 'செல்லப்பிராணிகளுக்கு நச்சு; ஆஸ்துமா உள்ளவர்கள் இருந்தால் தவிர்க்கவும்.',
      },
    },
  ],
};

const SUSTAIN_ACTIONS = {
  transit: {
    title: { en: 'Take the metro, train or bus', ta: 'மெட்ரோ, ரயில் அல்லது பேருந்தில் செல்லுங்கள்' },
    body: {
      en: 'One bus or train carries dozens of people for the exhaust of a few vehicles. It is the single biggest change for most commuters.',
      ta: 'ஒரு பேருந்து அல்லது ரயில் சில வாகனங்களின் புகையில் பல பேரைக் கொண்டுசெல்லும். பெரும்பாலோருக்கு இதுவே மிகப் பெரிய மாற்றம்.',
    },
  },
  carpool: {
    title: { en: 'Carpool with three people', ta: 'மூன்று பேர் சேர்ந்து காரில் செல்லுங்கள்' },
    body: {
      en: 'Share the same car with colleagues, neighbours or other school parents. The same trip, a third of the emissions per person.',
      ta: 'சக ஊழியர்கள், அண்டை வீட்டார், மற்ற பெற்றோருடன் ஒரே காரைப் பகிருங்கள். அதே பயணம், ஒருவருக்கு மூன்றில் ஒரு பங்கு புகை.',
    },
  },
  cycleWalk: {
    title: { en: 'Cycle or walk short trips', ta: 'குறுகிய பயணங்களுக்கு சைக்கிள் அல்லது நடை' },
    body: {
      en: 'For trips under about four kilometres, pedal or walk. Choose quieter lanes, and only when the air is good.',
      ta: 'சுமார் நான்கு கி.மீ.க்குள் இருந்தால் சைக்கிள் அல்லது நடை. அமைதியான தெருக்கள், காற்று நன்றாக இருக்கும்போது மட்டும்.',
    },
  },
  wfh: {
    title: {
      en: 'Work or study from home one day a week',
      ta: 'வாரத்தில் ஒரு நாள் வீட்டிலிருந்து வேலை/படிப்பு',
    },
    body: {
      en: 'If your job allows it, one fewer trip a week is a cut you can count.',
      ta: 'வேலை அனுமதித்தால், வாரம் ஒரு பயணம் குறைவது கணக்கிடக்கூடிய குறைப்பு.',
    },
  },
  led: {
    title: { en: 'Swap an old bulb for an LED', ta: 'பழைய பல்பை LED-ஆக மாற்றுங்கள்' },
    body: {
      en: 'A 9 W LED gives about the same light as a 60 W incandescent bulb. Less electricity means less fuel burned at the power plant.',
      ta: '9 W LED, 60 W சாதாரண பல்புக்கு ஈடான ஒளி தரும். குறைவான மின்சாரம் என்றால் மின் நிலையத்தில் குறைவான எரிபொருள்.',
    },
  },
  ac: {
    title: {
      en: 'Set the AC to 24-26 °C and use a fan with it',
      ta: 'ஏசியை 24-26 °C-ல் வைத்து, மின்விசிறியுடன் பயன்படுத்துங்கள்',
    },
    body: {
      en: 'Every degree you raise the thermostat trims the electricity the AC uses.',
      ta: 'ஒவ்வொரு டிகிரி உயர்த்தினாலும் ஏசி பயன்படுத்தும் மின்சாரம் குறையும்.',
    },
  },
  standby: {
    title: {
      en: 'Switch off standby devices at the plug',
      ta: 'ஸ்டாண்ட்பை சாதனங்களைப் பிளக்கில் அணையுங்கள்',
    },
    body: {
      en: 'TVs, chargers and set-top boxes draw power even when idle. A power strip with a switch makes it easy.',
      ta: 'டிவி, சார்ஜர், செட்-டாப் பாக்ஸ் ஓய்வில் இருக்கும்போதும் மின்சாரம் இழுக்கும். சுவிட்ச் உள்ள பவர் ஸ்ட்ரிப் எளிதாக்கும்.',
    },
  },
  stars: {
    title: {
      en: 'Choose star-rated appliances when you replace old ones',
      ta: 'பழையதை மாற்றும்போது ஸ்டார் ரேட்டிங் சாதனங்களைத் தேர்ந்தெடுங்கள்',
    },
    body: {
      en: 'A higher star rating on a fridge, fan or AC means less electricity for the same work.',
      ta: 'ஃப்ரிட்ஜ், மின்விசிறி, ஏசியில் அதிக ஸ்டார், அதே வேலைக்கு குறைவான மின்சாரம்.',
    },
  },
  burn: {
    title: { en: 'Never burn waste or leaves', ta: 'குப்பை, இலைகளை எரிக்க வேண்டாம்' },
    body: {
      en: 'Open burning is a big source of smoke and toxic fumes. Compost leaves and kitchen scraps, and hand the rest to the collection service.',
      ta: 'திறந்தவெளி எரிப்பு புகை, நச்சு வாயுக்களின் பெரிய ஆதாரம். இலை, சமையல் கழிவை உரமாக்குங்கள்; மற்றவற்றை சேகரிப்பாளரிடம் கொடுங்கள்.',
    },
  },
  idle: {
    title: {
      en: 'Switch the engine off at long red lights and at pick-up points',
      ta: 'நீண்ட சிவப்பு சிக்னல், பிக்-அப் இடங்களில் என்ஜினை அணையுங்கள்',
    },
    body: {
      en: 'An idling engine burns fuel and puffs exhaust while going nowhere. Turn it off if you will wait more than about a minute.',
      ta: 'ஓடிக்கொண்டிருக்கும் என்ஜின் எங்கும் செல்லாமல் எரிபொருளையும் புகையையும் வீணாக்கும். ஒரு நிமிடத்துக்கு மேல் காத்திருந்தால் அணையுங்கள்.',
    },
  },
  local: {
    title: {
      en: 'Buy local and seasonal, carry a cloth bag',
      ta: 'உள்ளூர், பருவகால பொருட்களை வாங்குங்கள்; துணிப்பை எடுத்துச் செல்லுங்கள்',
    },
    body: {
      en: 'Fewer miles and less packaging means less fuel and less waste to burn.',
      ta: 'குறைவான தூரம், குறைவான பேக்கேஜிங் என்றால் குறைவான எரிபொருள், எரிக்க வேண்டிய குறைவான கழிவு.',
    },
  },
};

/** Four weekly themes, rotated by ISO week number. Task ids are stable within a week. */
const CHALLENGE_THEMES = [
  {
    key: 'move',
    title: { en: 'Move cleaner', ta: 'தூய்மையாகப் பயணியுங்கள்' },
    tasks: [
      {
        en: 'Use the metro, train or bus on three days.',
        ta: 'மூன்று நாட்கள் மெட்ரோ, ரயில் அல்லது பேருந்தைப் பயன்படுத்துங்கள்.',
      },
      {
        en: 'Walk or cycle one short trip, on a day the air is good.',
        ta: 'காற்று நன்றாக இருக்கும் ஒரு நாள், ஒரு குறுகிய பயணத்தை நடை/சைக்கிளில் செய்யுங்கள்.',
      },
      {
        en: 'Share one ride with a colleague, neighbour or school parent.',
        ta: 'ஒரு சக ஊழியர், அண்டை வீட்டார் அல்லது பெற்றோருடன் ஒரு பயணத்தைப் பகிருங்கள்.',
      },
      {
        en: 'Switch your engine off at every red light for a week.',
        ta: 'ஒரு வாரம் ஒவ்வொரு சிவப்பு சிக்னலிலும் என்ஜினை அணையுங்கள்.',
      },
      { en: 'Combine errands into one trip.', ta: 'வேலைகளை ஒரே பயணத்தில் சேர்த்து முடியுங்கள்.' },
    ],
  },
  {
    key: 'energy',
    title: { en: 'Save energy', ta: 'மின்சாரம் சேமியுங்கள்' },
    tasks: [
      { en: 'Replace one old bulb with an LED.', ta: 'ஒரு பழைய பல்பை LED-ஆக மாற்றுங்கள்.' },
      {
        en: 'Switch off all standby devices at night.',
        ta: 'இரவில் எல்லா ஸ்டாண்ட்பை சாதனங்களையும் அணையுங்கள்.',
      },
      {
        en: 'Set the AC to 24-26 °C, or use only a fan, for the week.',
        ta: 'ஒரு வாரம் ஏசியை 24-26 °C-ல் வையுங்கள் அல்லது மின்விசிறி மட்டும்.',
      },
      {
        en: 'Dry clothes in the cleaner-air afternoon slot, not in a dryer.',
        ta: 'துணிகளை உலர்த்தியில் அல்ல, தூய்மையான மதிய நேரத்தில் உலர்த்துங்கள்.',
      },
      { en: 'Unplug chargers when the phone is full.', ta: 'போன் நிரம்பியதும் சார்ஜரைப் பிடுங்குங்கள்.' },
    ],
  },
  {
    key: 'home',
    title: { en: 'Clean home air', ta: 'வீட்டுக்குள் தூய காற்று' },
    tasks: [
      {
        en: 'Damp-mop every floor instead of dry sweeping.',
        ta: 'எல்லாத் தரைகளையும் உலர் பெருக்காமல் ஈரத் துடையுங்கள்.',
      },
      {
        en: 'Run the kitchen chimney or fan during and after every cooking session.',
        ta: 'ஒவ்வொரு சமையலின்போதும் பின்னும் சிம்னி/ஃபேன் ஓட்டுங்கள்.',
      },
      {
        en: 'Clean the chimney filter and stove burners.',
        ta: 'சிம்னி வடிகட்டியையும் அடுப்பு பர்னர்களையும் சுத்தம் செய்யுங்கள்.',
      },
      {
        en: 'Wash bedsheets in hot water and air the room in the best slot.',
        ta: 'படுக்கை விரிப்புகளை சூடான நீரில் துவைத்து, சிறந்த நேரத்தில் காற்றோட்டம் விடுங்கள்.',
      },
      {
        en: 'Go a week with no incense, coils or candles indoors.',
        ta: 'ஒரு வாரம் வீட்டுக்குள் ஊதுபத்தி, சுருள், மெழுகுவர்த்தி வேண்டாம்.',
      },
    ],
  },
  {
    key: 'waste',
    title: { en: 'Waste less, burn nothing', ta: 'குறைவாக வீணாக்குங்கள், எரிக்காதீர்கள்' },
    tasks: [
      {
        en: 'Start a small compost for kitchen scraps and leaves.',
        ta: 'சமையல் கழிவு, இலைகளுக்கு சிறிய உரக்குழி தொடங்குங்கள்.',
      },
      {
        en: 'Carry a cloth bag for every shopping trip.',
        ta: 'ஒவ்வொரு கடைப் பயணத்துக்கும் துணிப்பை எடுத்துச் செல்லுங்கள்.',
      },
      {
        en: 'Tell one neighbour why open burning hurts everyone’s lungs.',
        ta: 'திறந்தவெளி எரிப்பு எல்லோரின் நுரையீரலையும் எப்படிப் பாதிக்கிறது என்று ஒரு அண்டை வீட்டாரிடம் சொல்லுங்கள்.',
      },
      {
        en: 'Buy one local, seasonal item in place of a packaged one.',
        ta: 'பேக் செய்த பொருளுக்குப் பதிலாக ஓர் உள்ளூர், பருவகாலப் பொருளை வாங்குங்கள்.',
      },
      {
        en: 'Repair or reuse one thing instead of throwing it away.',
        ta: 'ஒரு பொருளைத் தூக்கி எறியாமல் பழுது பார்த்து அல்லது மீண்டும் பயன்படுத்துங்கள்.',
      },
    ],
  },
];

/** Which actions to show first for each lifestyle. */
const LIFESTYLE_ORDER = {
  student: [
    'cycleWalk',
    'transit',
    'led',
    'standby',
    'carpool',
    'burn',
    'idle',
    'local',
    'ac',
    'stars',
    'wfh',
  ],
  professional: [
    'transit',
    'carpool',
    'wfh',
    'idle',
    'led',
    'ac',
    'standby',
    'stars',
    'cycleWalk',
    'local',
    'burn',
  ],
  elder: [
    'transit',
    'led',
    'ac',
    'standby',
    'stars',
    'burn',
    'local',
    'carpool',
    'idle',
    'cycleWalk',
    'wfh',
  ],
  parent: [
    'carpool',
    'transit',
    'idle',
    'led',
    'ac',
    'standby',
    'cycleWalk',
    'burn',
    'local',
    'stars',
    'wfh',
  ],
};

const COMMUTE_KM = { student: 6, professional: 12, elder: 4, parent: 8 };

module.exports = {
  INDOOR_SECTIONS,
  PLANTS,
  SUSTAIN_ACTIONS,
  CHALLENGE_THEMES,
  LIFESTYLE_ORDER,
  COMMUTE_KM,
};
