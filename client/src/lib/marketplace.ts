import { useQuery } from '@tanstack/react-query';

/**
 * The astrologer marketplace (consultations, scheduling, live, Pooja, Astromall) can be
 * switched off on the server (FEATURE_MARKETPLACE). While it is off, its pages show a
 * paused notice and nothing in the app links to them.
 */
export const MARKETPLACE_PATHS = ['/astrologers', '/chat', '/call', '/schedule', '/live', '/pooja', '/store', '/astrologer/live'];

export function isMarketplacePath(href: string | null | undefined): boolean {
  if (!href) return false;
  const path = href.split(/[?#]/)[0];
  return MARKETPLACE_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Whether the marketplace is on. Off until the server says otherwise, so nothing paused flashes into view. */
export function useMarketplace(): boolean {
  const { data } = useQuery<{ marketplaceEnabled?: boolean }>({ queryKey: ['/api/config'], refetchOnWindowFocus: false });
  return data?.marketplaceEnabled === true;
}
