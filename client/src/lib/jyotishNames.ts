// Devanagari and Sanskrit names for the terms the engine returns in English transliteration.
// Keys are exactly the engine's spellings (server/astroEngine/vedic.ts, panchang.ts).

export const NAKSHATRA_ORDER = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha',
  'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishtha', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
] as const;

const NAKSHATRA_HI = [
  'अश्विनी', 'भरणी', 'कृत्तिका', 'रोहिणी', 'मृगशिरा', 'आर्द्रा', 'पुनर्वसु', 'पुष्य', 'आश्लेषा',
  'मघा', 'पूर्व फाल्गुनी', 'उत्तर फाल्गुनी', 'हस्त', 'चित्रा', 'स्वाति', 'विशाखा', 'अनुराधा', 'ज्येष्ठा',
  'मूल', 'पूर्वाषाढ़ा', 'उत्तराषाढ़ा', 'श्रवण', 'धनिष्ठा', 'शतभिषा', 'पूर्व भाद्रपद', 'उत्तर भाद्रपद', 'रेवती',
];

/** 0-based position in the 27-nakshatra cycle, or -1 for an unknown name. */
export const nakshatraIndex = (name: string | null | undefined) => (name ? NAKSHATRA_ORDER.indexOf(name as typeof NAKSHATRA_ORDER[number]) : -1);
export const nakshatraHi = (name: string) => NAKSHATRA_HI[nakshatraIndex(name)] ?? null;

const TITHI_HI: Record<string, string> = {
  Pratipada: 'प्रतिपदा', Dwitiya: 'द्वितीया', Tritiya: 'तृतीया', Chaturthi: 'चतुर्थी', Panchami: 'पञ्चमी',
  Shashthi: 'षष्ठी', Saptami: 'सप्तमी', Ashtami: 'अष्टमी', Navami: 'नवमी', Dashami: 'दशमी', Ekadashi: 'एकादशी',
  Dwadashi: 'द्वादशी', Trayodashi: 'त्रयोदशी', Chaturdashi: 'चतुर्दशी', Purnima: 'पूर्णिमा', Amavasya: 'अमावस्या',
};

/** The engine names the 15th and 30th tithi "Purnima/Amavasya"; its number (1–30) says which. */
export function tithiName(name: string, number: number): string {
  if (number === 15) return 'Purnima';
  if (number === 30) return 'Amavasya';
  return name;
}
export const tithiHi = (name: string) => TITHI_HI[name] ?? null;

const YOGA_HI: Record<string, string> = {
  Vishkambha: 'विष्कम्भ', Priti: 'प्रीति', Ayushman: 'आयुष्मान्', Saubhagya: 'सौभाग्य', Shobhana: 'शोभन',
  Atiganda: 'अतिगण्ड', Sukarma: 'सुकर्मा', Dhriti: 'धृति', Shoola: 'शूल', Ganda: 'गण्ड', Vriddhi: 'वृद्धि',
  Dhruva: 'ध्रुव', Vyaghata: 'व्याघात', Harshana: 'हर्षण', Vajra: 'वज्र', Siddhi: 'सिद्धि', Vyatipata: 'व्यतीपात',
  Variyana: 'वरीयान्', Parigha: 'परिघ', Shiva: 'शिव', Siddha: 'सिद्ध', Sadhya: 'साध्य', Shubha: 'शुभ',
  Shukla: 'शुक्ल', Brahma: 'ब्रह्म', Indra: 'इन्द्र', Vaidhriti: 'वैधृति',
};
export const yogaHi = (name: string) => YOGA_HI[name] ?? null;

const KARANA_HI: Record<string, string> = {
  Bava: 'बव', Balava: 'बालव', Kaulava: 'कौलव', Taitila: 'तैतिल', Garaja: 'गर', Vanija: 'वणिज', Vishti: 'विष्टि',
  Shakuni: 'शकुनि', Chatushpada: 'चतुष्पाद', Naga: 'नाग', Kimstughna: 'किंस्तुघ्न',
};
export const karanaHi = (name: string) => KARANA_HI[name] ?? null;

export const VARA_HI = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];

const GRAHA_SANSKRIT: Record<string, string> = {
  Sun: 'Surya', Moon: 'Chandra', Mars: 'Mangala', Mercury: 'Budha', Jupiter: 'Guru',
  Venus: 'Shukra', Saturn: 'Shani', Rahu: 'Rahu', Ketu: 'Ketu',
};
export const grahaSanskrit = (planet: string) => GRAHA_SANSKRIT[planet] ?? planet;

/** Chip labels for the Gochara strip: the mockups' short names (desktop) and two-letter names (mobile). */
export const GRAHA_SHORT: Record<string, string> = {
  Sun: 'Sun', Moon: 'Moon', Mars: 'Mars', Mercury: 'Merc', Jupiter: 'Jup', Venus: 'Ven', Saturn: 'Sat', Rahu: 'Rahu', Ketu: 'Ketu',
};
export const GRAHA_ABBR: Record<string, string> = {
  Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me', Jupiter: 'Ju', Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke',
};

export const SIGN_ORDER = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'] as const;
export const signAbbr = (sign: string) => sign.slice(0, 3);

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;

export const SIGN_HI: Record<string, string> = {
  Aries: 'मेष', Taurus: 'वृषभ', Gemini: 'मिथुन', Cancer: 'कर्क', Leo: 'सिंह', Virgo: 'कन्या',
  Libra: 'तुला', Scorpio: 'वृश्चिक', Sagittarius: 'धनु', Capricorn: 'मकर', Aquarius: 'कुम्भ', Pisces: 'मीन',
};

export const GRAHA_HI: Record<string, string> = {
  Sun: 'सूर्य', Moon: 'चन्द्र', Mars: 'मंगल', Mercury: 'बुध', Jupiter: 'गुरु', Venus: 'शुक्र', Saturn: 'शनि', Rahu: 'राहु', Ketu: 'केतु',
};

/** The one- and two-syllable labels a North Indian chart is written with. */
export const GRAHA_HI_ABBR: Record<string, string> = {
  Sun: 'सू', Moon: 'चं', Mars: 'मं', Mercury: 'बु', Jupiter: 'गु', Venus: 'शु', Saturn: 'श', Rahu: 'रा', Ketu: 'के',
};

export const GRAHA_ORDER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'] as const;
