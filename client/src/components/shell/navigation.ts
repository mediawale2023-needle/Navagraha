import { isMarketplacePath } from '@/lib/marketplace';

export type NavId = 'today' | 'kundli' | 'ask' | 'dasha' | 'panchang' | 'reports';

export interface NavItem {
  id: NavId;
  label: string;
  href: string;
  /** Shown in the mobile tab bar (Direction 3 keeps it to four). */
  tab: boolean;
}

// Direction 3 primary navigation, in the mockups' order.
export const PRIMARY_NAV: NavItem[] = [
  { id: 'today', label: 'Today', href: '/', tab: true },
  { id: 'kundli', label: 'Kundli', href: '/kundli', tab: true },
  { id: 'ask', label: 'Ask', href: '/ai-astrologer', tab: true },
  // Until a chart is designated as the user's own, Dasha asks which chart to open.
  { id: 'dasha', label: 'Dasha', href: '/kundli?for=dasha', tab: true },
  { id: 'panchang', label: 'Panchang', href: '/panchang', tab: false },
  { id: 'reports', label: 'Reports', href: '/reports', tab: false },
];

export interface MoreItem {
  label: string;
  href: string;
  /** Desktop already shows it in the navy band. */
  inPrimaryOnDesktop?: boolean;
}

// Everything else a signed-in user can reach, listed in the account menu.
const MORE: MoreItem[] = [
  { label: 'Panchang', href: '/panchang', inPrimaryOnDesktop: true },
  { label: 'Reports', href: '/reports', inPrimaryOnDesktop: true },
  { label: 'Horoscope', href: '/horoscope' },
  { label: 'Matchmaking', href: '/kundli/matchmaking' },
  { label: 'Remedies', href: '/remedies' },
  { label: 'Prashna', href: '/prashna' },
  { label: 'Numerology', href: '/numerology' },
  { label: 'Astrologers', href: '/astrologers' },
  { label: 'Live', href: '/live' },
  { label: 'Astromall', href: '/store' },
  { label: 'Pooja', href: '/pooja' },
  { label: 'Wallet', href: '/wallet' },
  { label: 'Profile', href: '/profile' },
];

export function moreItems(marketplace: boolean, desktop: boolean): MoreItem[] {
  return MORE.filter((m) => (marketplace || !isMarketplacePath(m.href)) && !(desktop && m.inPrimaryOnDesktop));
}

/** Which primary item a location belongs to; null for pages outside the primary set. */
export function activeNav(path: string, search: string): NavId | null {
  const params = new URLSearchParams(search);
  if (path === '/') return 'today';
  if (path === '/ai-astrologer') return 'ask';
  if (path === '/panchang') return 'panchang';
  if (path === '/reports') return 'reports';
  if (path === '/kundli' && params.get('for') === 'dasha') return 'dasha';
  if (/^\/kundli\/[^/]+\/dasha$/.test(path)) return 'dasha';
  if (path === '/kundli' || path.startsWith('/kundli/')) return 'kundli';
  return null;
}

/** Portals with their own chrome: the astrologer workspace and admin. */
export function isPortalPath(path: string): boolean {
  return path === '/astrologer' || path.startsWith('/astrologer/') || path === '/admin' || path.startsWith('/admin/');
}
