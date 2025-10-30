/**
 * VedicAstroAPI Integration Service
 * Handles all API calls to VedicAstroAPI for real Vedic astrology calculations
 */

const VEDIC_ASTRO_BASE_URL = 'https://api.vedicastroapi.com/v3-json';
const API_KEY = process.env.VEDIC_ASTRO_API_KEY;

export interface BirthDetails {
  date: string; // DD/MM/YYYY
  time: string; // HH:MM
  lat: number;
  lon: number;
  tz: number;
}

/**
 * Convert our date format (YYYY-MM-DD) to VedicAstroAPI format (DD/MM/YYYY)
 */
function formatDateForAPI(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Make a GET request to VedicAstroAPI
 */
async function makeAPIRequest(endpoint: string, params: Record<string, any>): Promise<any> {
  const queryParams = new URLSearchParams({
    api_key: API_KEY || '',
    ...params,
  });

  const url = `${VEDIC_ASTRO_BASE_URL}/${endpoint}?${queryParams.toString()}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`VedicAstroAPI error: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.status !== 200) {
    throw new Error(`VedicAstroAPI returned error status: ${data.status}`);
  }

  return data.response;
}

/**
 * Get planetary positions and details
 */
export async function getPlanetDetails(birthDetails: BirthDetails, lang: string = 'en') {
  return await makeAPIRequest('horoscope/planet-details', {
    dob: birthDetails.date,
    tob: birthDetails.time,
    lat: birthDetails.lat,
    lon: birthDetails.lon,
    tz: birthDetails.tz,
    lang,
  });
}

/**
 * Get chart details (houses, signs, etc.)
 */
export async function getChartDetails(birthDetails: BirthDetails, lang: string = 'en') {
  return await makeAPIRequest('horoscope/chart-details', {
    dob: birthDetails.date,
    tob: birthDetails.time,
    lat: birthDetails.lat,
    lon: birthDetails.lon,
    tz: birthDetails.tz,
    lang,
  });
}

/**
 * Get Vimshottari Dasha details
 */
export async function getVimshottariDasha(birthDetails: BirthDetails, lang: string = 'en') {
  return await makeAPIRequest('dashas/vimshottari-dasha', {
    dob: birthDetails.date,
    tob: birthDetails.time,
    lat: birthDetails.lat,
    lon: birthDetails.lon,
    tz: birthDetails.tz,
    lang,
  });
}

/**
 * Get current Mahadasha
 */
export async function getCurrentMahadasha(birthDetails: BirthDetails, lang: string = 'en') {
  return await makeAPIRequest('dashas/current-mahadasha', {
    dob: birthDetails.date,
    tob: birthDetails.time,
    lat: birthDetails.lat,
    lon: birthDetails.lon,
    tz: birthDetails.tz,
    lang,
  });
}

/**
 * Get Mangal Dosha details
 */
export async function getMangalDosha(birthDetails: BirthDetails, lang: string = 'en') {
  return await makeAPIRequest('dosha/mangal-dosh', {
    dob: birthDetails.date,
    tob: birthDetails.time,
    lat: birthDetails.lat,
    lon: birthDetails.lon,
    tz: birthDetails.tz,
    lang,
  });
}

/**
 * Get Kaal Sarp Dosha details
 */
export async function getKaalSarpDosha(birthDetails: BirthDetails, lang: string = 'en') {
  return await makeAPIRequest('dosha/kaalsarp-dosh', {
    dob: birthDetails.date,
    tob: birthDetails.time,
    lat: birthDetails.lat,
    lon: birthDetails.lon,
    tz: birthDetails.tz,
    lang,
  });
}

/**
 * Get Pitra Dosha details
 */
export async function getPitraDosha(birthDetails: BirthDetails, lang: string = 'en') {
  return await makeAPIRequest('dosha/pitra-dosh', {
    dob: birthDetails.date,
    tob: birthDetails.time,
    lat: birthDetails.lat,
    lon: birthDetails.lon,
    tz: birthDetails.tz,
    lang,
  });
}

/**
 * Get ascendant and basic astrological info
 */
export async function getBasicDetails(birthDetails: BirthDetails, lang: string = 'en') {
  return await makeAPIRequest('horoscope/basic-details', {
    dob: birthDetails.date,
    tob: birthDetails.time,
    lat: birthDetails.lat,
    lon: birthDetails.lon,
    tz: birthDetails.tz,
    lang,
  });
}

/**
 * Get daily horoscope for a zodiac sign
 */
export async function getDailyHoroscope(sign: string, lang: string = 'en') {
  return await makeAPIRequest('predictions/daily-prediction', {
    zodiac: sign.toLowerCase(),
    lang,
  });
}

/**
 * Get compatibility/matching score
 */
export async function getMatchingScore(
  person1: BirthDetails,
  person2: BirthDetails,
  lang: string = 'en'
) {
  return await makeAPIRequest('matching/ashtakoot-score', {
    m_dob: person1.date,
    m_tob: person1.time,
    m_lat: person1.lat,
    m_lon: person1.lon,
    m_tz: person1.tz,
    f_dob: person2.date,
    f_tob: person2.time,
    f_lat: person2.lat,
    f_lon: person2.lon,
    f_tz: person2.tz,
    lang,
  });
}

/**
 * Generate complete kundli data by combining multiple API calls
 */
export async function generateKundli(
  name: string,
  date: string,
  time: string,
  place: string,
  lat: number,
  lon: number,
  tz: number
) {
  const birthDetails: BirthDetails = {
    date: formatDateForAPI(date),
    time,
    lat,
    lon,
    tz,
  };

  try {
    // Make parallel API calls to get all kundli data
    const [basicDetails, planetDetails, chartDetails, dashaDetails, currentDasha, mangalDosha, kaalSarpDosha, pitraDosha] = await Promise.all([
      getBasicDetails(birthDetails),
      getPlanetDetails(birthDetails),
      getChartDetails(birthDetails),
      getVimshottariDasha(birthDetails),
      getCurrentMahadasha(birthDetails),
      getMangalDosha(birthDetails).catch(() => ({ is_dosha_present: false })),
      getKaalSarpDosha(birthDetails).catch(() => ({ is_dosha_present: false })),
      getPitraDosha(birthDetails).catch(() => ({ is_dosha_present: false })),
    ]);

    return {
      name,
      date,
      time,
      place,
      latitude: lat,
      longitude: lon,
      timezone: tz,
      ascendant: basicDetails.ascendant || 'N/A',
      moonSign: basicDetails.moon_sign || 'N/A',
      sunSign: basicDetails.sun_sign || 'N/A',
      planets: planetDetails || [],
      houses: chartDetails?.houses || [],
      dashas: dashaDetails || [],
      currentDasha: currentDasha || {},
      doshas: {
        mangal: mangalDosha,
        kaalSarp: kaalSarpDosha,
        pitra: pitraDosha,
      },
    };
  } catch (error) {
    console.error('Error generating kundli from VedicAstroAPI:', error);
    throw error;
  }
}
