// The twelve Moon signs (Rashi) in order, with the Hindi names the horoscope uses in URLs and labels.

export interface ZodiacSign { id: string; name: string; englishName: string }

export const ZODIAC_SIGNS: ZodiacSign[] = [
  { id: "aries", name: "Mesh", englishName: "Aries" },
  { id: "taurus", name: "Vrishabh", englishName: "Taurus" },
  { id: "gemini", name: "Mithun", englishName: "Gemini" },
  { id: "cancer", name: "Kark", englishName: "Cancer" },
  { id: "leo", name: "Simha", englishName: "Leo" },
  { id: "virgo", name: "Kanya", englishName: "Virgo" },
  { id: "libra", name: "Tula", englishName: "Libra" },
  { id: "scorpio", name: "Vrishchik", englishName: "Scorpio" },
  { id: "sagittarius", name: "Dhanu", englishName: "Sagittarius" },
  { id: "capricorn", name: "Makar", englishName: "Capricorn" },
  { id: "aquarius", name: "Kumbh", englishName: "Aquarius" },
  { id: "pisces", name: "Meen", englishName: "Pisces" },
];

export const signById = (id: string) => ZODIAC_SIGNS.find((s) => s.id === id.toLowerCase());
