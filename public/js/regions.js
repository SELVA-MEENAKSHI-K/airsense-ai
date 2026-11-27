/**
 * Country, state and city lists for the first-run picker. Names are searched through
 * /api/geocode (limited to the country) so coordinates are never hard-coded here.
 * India has every state and union territory with its main cities; other countries go straight
 * from country to a city search.
 */

export const COUNTRIES = [
  { code: 'IN', name: 'India', ta: 'இந்தியா' },
  { code: 'LK', name: 'Sri Lanka', ta: 'இலங்கை' },
  { code: 'SG', name: 'Singapore', ta: 'சிங்கப்பூர்' },
  { code: 'MY', name: 'Malaysia', ta: 'மலேசியா' },
  { code: 'AE', name: 'United Arab Emirates', ta: 'ஐக்கிய அரபு அமீரகம்' },
  { code: 'NP', name: 'Nepal', ta: 'நேபாளம்' },
  { code: 'BD', name: 'Bangladesh', ta: 'வங்கதேசம்' },
  { code: 'PK', name: 'Pakistan', ta: 'பாகிஸ்தான்' },
  { code: 'CN', name: 'China', ta: 'சீனா' },
  { code: 'JP', name: 'Japan', ta: 'ஜப்பான்' },
  { code: 'GB', name: 'United Kingdom', ta: 'ஐக்கிய இராச்சியம்' },
  { code: 'DE', name: 'Germany', ta: 'ஜெர்மனி' },
  { code: 'FR', name: 'France', ta: 'பிரான்ஸ்' },
  { code: 'US', name: 'United States', ta: 'அமெரிக்கா' },
  { code: 'CA', name: 'Canada', ta: 'கனடா' },
  { code: 'AU', name: 'Australia', ta: 'ஆஸ்திரேலியா' },
];

/** state name (as OpenStreetMap and Open-Meteo spell it) -> Tamil name and main cities [en, ta] */
export const INDIA_STATES = {
  'Andhra Pradesh': {
    ta: 'ஆந்திரப் பிரதேசம்',
    cities: [
      ['Visakhapatnam', 'விசாகப்பட்டினம்'],
      ['Vijayawada', 'விஜயவாடா'],
      ['Guntur', 'குண்டூர்'],
      ['Tirupati', 'திருப்பதி'],
      ['Nellore', 'நெல்லூர்'],
    ],
  },
  'Arunachal Pradesh': {
    ta: 'அருணாசலப் பிரதேசம்',
    cities: [
      ['Itanagar', 'இட்டாநகர்'],
      ['Naharlagun', 'நஹர்லகுன்'],
    ],
  },
  Assam: {
    ta: 'அசாம்',
    cities: [
      ['Guwahati', 'கவுகாத்தி'],
      ['Dibrugarh', 'திப்ருகர்'],
      ['Silchar', 'சில்சார்'],
      ['Jorhat', 'ஜோர்ஹாட்'],
    ],
  },
  Bihar: {
    ta: 'பீகார்',
    cities: [
      ['Patna', 'பாட்னா'],
      ['Gaya', 'கயா'],
      ['Bhagalpur', 'பாகல்பூர்'],
      ['Muzaffarpur', 'முசாபர்பூர்'],
    ],
  },
  Chhattisgarh: {
    ta: 'சத்தீஸ்கர்',
    cities: [
      ['Raipur', 'ராய்ப்பூர்'],
      ['Bhilai', 'பிலாய்'],
      ['Bilaspur', 'பிலாஸ்பூர்'],
    ],
  },
  Goa: {
    ta: 'கோவா',
    cities: [
      ['Panaji', 'பனாஜி'],
      ['Margao', 'மார்காவ்'],
      ['Vasco da Gama', 'வாஸ்கோ ட காமா'],
    ],
  },
  Gujarat: {
    ta: 'குஜராத்',
    cities: [
      ['Ahmedabad', 'அகமதாபாத்'],
      ['Surat', 'சூரத்'],
      ['Vadodara', 'வதோதரா'],
      ['Rajkot', 'ராஜ்கோட்'],
      ['Gandhinagar', 'காந்திநகர்'],
    ],
  },
  Haryana: {
    ta: 'ஹரியானா',
    cities: [
      ['Gurugram', 'குருகிராம்'],
      ['Faridabad', 'ஃபரிதாபாத்'],
      ['Panipat', 'பானிபட்'],
      ['Ambala', 'அம்பாலா'],
      ['Rohtak', 'ரோத்தக்'],
    ],
  },
  'Himachal Pradesh': {
    ta: 'இமாசலப் பிரதேசம்',
    cities: [
      ['Shimla', 'சிம்லா'],
      ['Dharamshala', 'தர்மசாலா'],
      ['Solan', 'சோலன்'],
      ['Mandi', 'மண்டி'],
    ],
  },
  Jharkhand: {
    ta: 'ஜார்கண்ட்',
    cities: [
      ['Ranchi', 'ராஞ்சி'],
      ['Jamshedpur', 'ஜாம்ஷெட்பூர்'],
      ['Dhanbad', 'தன்பாத்'],
      ['Bokaro', 'போகாரோ'],
    ],
  },
  Karnataka: {
    ta: 'கர்நாடகம்',
    cities: [
      ['Bengaluru', 'பெங்களூரு'],
      ['Mysuru', 'மைசூரு'],
      ['Mangaluru', 'மங்களூரு'],
      ['Hubballi', 'ஹுப்பள்ளி'],
      ['Belagavi', 'பெலகாவி'],
    ],
  },
  Kerala: {
    ta: 'கேரளம்',
    cities: [
      ['Thiruvananthapuram', 'திருவனந்தபுரம்'],
      ['Kochi', 'கொச்சி'],
      ['Kozhikode', 'கோழிக்கோடு'],
      ['Thrissur', 'திருச்சூர்'],
      ['Kollam', 'கொல்லம்'],
    ],
  },
  'Madhya Pradesh': {
    ta: 'மத்தியப் பிரதேசம்',
    cities: [
      ['Bhopal', 'போபால்'],
      ['Indore', 'இந்தூர்'],
      ['Gwalior', 'குவாலியர்'],
      ['Jabalpur', 'ஜபல்பூர்'],
      ['Ujjain', 'உஜ்ஜைன்'],
    ],
  },
  Maharashtra: {
    ta: 'மகாராஷ்டிரம்',
    cities: [
      ['Mumbai', 'மும்பை'],
      ['Pune', 'புனே'],
      ['Nagpur', 'நாக்பூர்'],
      ['Nashik', 'நாசிக்'],
      ['Aurangabad', 'அவுரங்காபாத்'],
      ['Thane', 'தானே'],
    ],
  },
  Manipur: {
    ta: 'மணிப்பூர்',
    cities: [
      ['Imphal', 'இம்பால்'],
      ['Thoubal', 'தவுபால்'],
    ],
  },
  Meghalaya: {
    ta: 'மேகாலயா',
    cities: [
      ['Shillong', 'ஷில்லாங்'],
      ['Tura', 'துரா'],
    ],
  },
  Mizoram: {
    ta: 'மிசோரம்',
    cities: [
      ['Aizawl', 'ஐஸ்வால்'],
      ['Lunglei', 'லுங்லே'],
    ],
  },
  Nagaland: {
    ta: 'நாகாலாந்து',
    cities: [
      ['Kohima', 'கோஹிமா'],
      ['Dimapur', 'திமாப்பூர்'],
    ],
  },
  Odisha: {
    ta: 'ஒடிசா',
    cities: [
      ['Bhubaneswar', 'புவனேஸ்வர்'],
      ['Cuttack', 'கட்டாக்'],
      ['Rourkela', 'ரூர்கேலா'],
      ['Puri', 'பூரி'],
    ],
  },
  Punjab: {
    ta: 'பஞ்சாப்',
    cities: [
      ['Ludhiana', 'லூதியானா'],
      ['Amritsar', 'அமிர்தசரஸ்'],
      ['Jalandhar', 'ஜலந்தர்'],
      ['Patiala', 'பாட்டியாலா'],
    ],
  },
  Rajasthan: {
    ta: 'ராஜஸ்தான்',
    cities: [
      ['Jaipur', 'ஜெய்ப்பூர்'],
      ['Jodhpur', 'ஜோத்பூர்'],
      ['Udaipur', 'உதய்ப்பூர்'],
      ['Kota', 'கோட்டா'],
      ['Ajmer', 'அஜ்மீர்'],
    ],
  },
  Sikkim: {
    ta: 'சிக்கிம்',
    cities: [
      ['Gangtok', 'காங்டாக்'],
      ['Namchi', 'நாம்சி'],
    ],
  },
  'Tamil Nadu': {
    ta: 'தமிழ்நாடு',
    cities: [
      ['Chennai', 'சென்னை'],
      ['Madurai', 'மதுரை'],
      ['Coimbatore', 'கோயம்புத்தூர்'],
      ['Tiruchirappalli', 'திருச்சிராப்பள்ளி'],
      ['Salem', 'சேலம்'],
      ['Tirunelveli', 'திருநெல்வேலி'],
      ['Erode', 'ஈரோடு'],
      ['Vellore', 'வேலூர்'],
      ['Thanjavur', 'தஞ்சாவூர்'],
      ['Thoothukudi', 'தூத்துக்குடி'],
      ['Tiruppur', 'திருப்பூர்'],
      ['Dindigul', 'திண்டுக்கல்'],
      ['Kanyakumari', 'கன்னியாகுமரி'],
      ['Nagercoil', 'நாகர்கோவில்'],
      ['Karur', 'கரூர்'],
      ['Hosur', 'ஓசூர்'],
      ['Kanchipuram', 'காஞ்சிபுரம்'],
      ['Cuddalore', 'கடலூர்'],
      ['Virudhunagar', 'விருதுநகர்'],
      ['Sivakasi', 'சிவகாசி'],
      ['Rameswaram', 'இராமேசுவரம்'],
    ],
  },
  Telangana: {
    ta: 'தெலங்கானா',
    cities: [
      ['Hyderabad', 'ஹைதராபாத்'],
      ['Warangal', 'வாரங்கல்'],
      ['Nizamabad', 'நிசாமாபாத்'],
      ['Karimnagar', 'கரீம்நகர்'],
    ],
  },
  Tripura: {
    ta: 'திரிபுரா',
    cities: [
      ['Agartala', 'அகர்தலா'],
      ['Udaipur', 'உதய்ப்பூர்'],
    ],
  },
  'Uttar Pradesh': {
    ta: 'உத்தரப் பிரதேசம்',
    cities: [
      ['Lucknow', 'லக்னோ'],
      ['Kanpur', 'கான்பூர்'],
      ['Varanasi', 'வாரணாசி'],
      ['Agra', 'ஆக்ரா'],
      ['Noida', 'நொய்டா'],
      ['Ghaziabad', 'காசியாபாத்'],
      ['Prayagraj', 'பிரயாக்ராஜ்'],
    ],
  },
  Uttarakhand: {
    ta: 'உத்தராகண்ட்',
    cities: [
      ['Dehradun', 'டேராடூன்'],
      ['Haridwar', 'ஹரித்வார்'],
      ['Rishikesh', 'ரிஷிகேஷ்'],
      ['Nainital', 'நைனிடால்'],
    ],
  },
  'West Bengal': {
    ta: 'மேற்கு வங்காளம்',
    cities: [
      ['Kolkata', 'கொல்கத்தா'],
      ['Howrah', 'ஹவுரா'],
      ['Durgapur', 'துர்காபூர்'],
      ['Siliguri', 'சிலிகுரி'],
      ['Asansol', 'அசன்சோல்'],
    ],
  },
  'Andaman and Nicobar Islands': {
    ta: 'அந்தமான் நிகோபார் தீவுகள்',
    cities: [['Port Blair', 'போர்ட் பிளேர்']],
  },
  Chandigarh: { ta: 'சண்டிகர்', cities: [['Chandigarh', 'சண்டிகர்']] },
  'Dadra and Nagar Haveli and Daman and Diu': {
    ta: 'தாத்ரா நகர் ஹவேலி, டாமன் டியு',
    cities: [
      ['Daman', 'டாமன்'],
      ['Silvassa', 'சில்வாசா'],
    ],
  },
  Delhi: {
    ta: 'தில்லி',
    cities: [
      ['New Delhi', 'புது தில்லி'],
      ['Delhi', 'தில்லி'],
    ],
  },
  'Jammu and Kashmir': {
    ta: 'ஜம்மு காஷ்மீர்',
    cities: [
      ['Srinagar', 'ஸ்ரீநகர்'],
      ['Jammu', 'ஜம்மு'],
    ],
  },
  Ladakh: { ta: 'லடாக்', cities: [['Leh', 'லே']] },
  Lakshadweep: { ta: 'லட்சத்தீவு', cities: [['Kavaratti', 'கவரத்தி']] },
  Puducherry: {
    ta: 'புதுச்சேரி',
    cities: [
      ['Puducherry', 'புதுச்சேரி'],
      ['Karaikal', 'காரைக்கால்'],
    ],
  },
};
