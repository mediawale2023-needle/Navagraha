/**
 * Golden-chart inputs. Fictional births (no real people). `expectedOffset` is
 * the civil UTC offset in force at that place and moment according to the
 * IANA tz database rules, written by hand for each case — the resolver must
 * reproduce it independently.
 */
export interface GoldenCase {
  id: string;
  note: string;
  date: string;
  time: string;
  place: string;
  latitude: number;
  longitude: number;
  expectedTimezone: string;
  expectedOffset: string;
  timeAccuracy: 'exact' | 'approximate';
}

const c = (id: string, note: string, date: string, time: string, place: string, latitude: number, longitude: number,
  expectedTimezone: string, expectedOffset: string, timeAccuracy: 'exact' | 'approximate' = 'exact'): GoldenCase =>
  ({ id, note, date, time, place, latitude, longitude, expectedTimezone, expectedOffset, timeAccuracy });

export const BASE_CASES: GoldenCase[] = [
  c('in-blr-1990', 'India, modern IST', '1990-08-15', '06:30:00', 'Bengaluru', 12.9716, 77.5946, 'Asia/Kolkata', '+05:30'),
  c('in-bom-1975', 'India, 1970s', '1975-03-21', '14:20:00', 'Mumbai', 19.076, 72.8777, 'Asia/Kolkata', '+05:30'),
  c('in-del-2003', 'India, late evening', '2003-11-02', '23:45:00', 'New Delhi', 28.6139, 77.209, 'Asia/Kolkata', '+05:30'),
  c('in-maa-1962', 'India, 1960s pre-dawn', '1962-01-26', '04:10:00', 'Chennai', 13.0827, 80.2707, 'Asia/Kolkata', '+05:30'),
  c('in-ccu-1943', 'India, 1942–45 war time (+06:30)', '1943-06-01', '12:00:00', 'Kolkata', 22.5726, 88.3639, 'Asia/Kolkata', '+06:30'),
  c('in-ccu-1946', 'India, after war time', '1946-02-10', '08:00:00', 'Kolkata', 22.5726, 88.3639, 'Asia/Kolkata', '+05:30'),
  c('in-bom-2021-sec', 'India, seconds preserved', '2021-03-14', '23:59:59', 'Mumbai', 19.076, 72.8777, 'Asia/Kolkata', '+05:30'),
  c('in-blr-approx', 'India, approximate time placeholder', '1988-02-14', '06:00:00', 'Bengaluru', 12.9716, 77.5946, 'Asia/Kolkata', '+05:30', 'approximate'),
  c('np-ktm-1995', 'Nepal after 1986 (+05:45)', '1995-01-01', '05:45:00', 'Kathmandu', 27.7172, 85.324, 'Asia/Kathmandu', '+05:45'),
  c('np-ktm-1980', 'Nepal before 1986 (+05:30)', '1980-07-01', '10:00:00', 'Kathmandu', 27.7172, 85.324, 'Asia/Kathmandu', '+05:30'),
  c('ae-dxb-2010', 'UAE, no DST', '2010-06-01', '09:00:00', 'Dubai', 25.2048, 55.2708, 'Asia/Dubai', '+04:00'),
  c('gb-lon-1985', 'UK summer time', '1985-07-01', '09:15:00', 'London', 51.5074, -0.1278, 'Europe/London', '+01:00'),
  c('gb-lon-1999', 'UK winter, year end', '1999-12-31', '23:30:00', 'London', 51.5074, -0.1278, 'Europe/London', '+00:00'),
  c('us-nyc-1990', 'US Eastern daylight time', '1990-07-04', '12:00:00', 'New York', 40.7128, -74.006, 'America/New_York', '-04:00'),
  c('us-nyc-1969', 'US Eastern standard time', '1969-01-20', '05:00:00', 'New York', 40.7128, -74.006, 'America/New_York', '-05:00'),
  c('us-lax-2015', 'US Pacific daylight time', '2015-08-01', '18:00:00', 'Los Angeles', 34.0522, -118.2437, 'America/Los_Angeles', '-07:00'),
  c('us-chi-1955', 'US Central standard time, 1950s', '1955-03-03', '03:03:00', 'Chicago', 41.8781, -87.6298, 'America/Chicago', '-06:00'),
  c('ca-yyz-1980', 'Canada Eastern, winter', '1980-12-25', '07:30:00', 'Toronto', 43.6532, -79.3832, 'America/Toronto', '-05:00'),
  c('au-syd-2001', 'Australia, southern-summer DST', '2001-01-10', '20:00:00', 'Sydney', -33.8688, 151.2093, 'Australia/Sydney', '+11:00'),
  c('au-syd-1988', 'Australia, winter', '1988-06-15', '12:00:00', 'Sydney', -33.8688, 151.2093, 'Australia/Sydney', '+10:00'),
  c('nz-akl-1972', 'New Zealand before DST (1974)', '1972-03-20', '09:00:00', 'Auckland', -36.8485, 174.7633, 'Pacific/Auckland', '+12:00'),
  c('jp-tyo-1964', 'Japan', '1964-10-10', '14:00:00', 'Tokyo', 35.6762, 139.6503, 'Asia/Tokyo', '+09:00'),
  c('sg-sin-1985', 'Singapore after 1982 (+08:00)', '1985-06-01', '10:00:00', 'Singapore', 1.3521, 103.8198, 'Asia/Singapore', '+08:00'),
  c('za-jnb-1977', 'South Africa', '1977-09-09', '16:00:00', 'Johannesburg', -26.2041, 28.0473, 'Africa/Johannesburg', '+02:00'),
  c('ke-nbo-2008', 'Kenya, leap day', '2008-02-29', '06:15:00', 'Nairobi', -1.2921, 36.8219, 'Africa/Nairobi', '+03:00'),
  c('ec-uio-1999', 'Ecuador, near equator', '1999-06-21', '12:00:00', 'Quito', -0.1807, -78.4678, 'America/Guayaquil', '-05:00'),
  c('is-rey-1993', 'Iceland, high latitude', '1993-04-04', '03:00:00', 'Reykjavik', 64.1466, -21.9426, 'Atlantic/Reykjavik', '+00:00'),
  c('us-anc-2012', 'Alaska, high latitude', '2012-11-15', '22:00:00', 'Anchorage', 61.2181, -149.9003, 'America/Anchorage', '-09:00'),
  c('ru-mow-2012', 'Russia 2011–14 permanent +04:00', '2012-06-12', '12:00:00', 'Moscow', 55.7558, 37.6173, 'Europe/Moscow', '+04:00'),
  c('fr-par-2005', 'Central European summer time', '2005-09-01', '08:00:00', 'Paris', 48.8566, 2.3522, 'Europe/Paris', '+02:00'),
  c('br-sao-2020', 'Brazil after DST abolition (2019)', '2020-01-15', '10:00:00', 'São Paulo', -23.5505, -46.6333, 'America/Sao_Paulo', '-03:00'),
  c('us-hnl-1994', 'Hawaii, no DST', '1994-03-03', '08:00:00', 'Honolulu', 21.3069, -157.8583, 'Pacific/Honolulu', '-10:00'),
];
