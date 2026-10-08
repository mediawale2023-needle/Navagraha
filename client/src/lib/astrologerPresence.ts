/** Whether an astrologer can take a consultation now, by their stored status (live presence is added by the caller). */
export function isAstrologerAvailable(a: { isOnline?: boolean | null; availability?: string | null }): boolean {
  return Boolean(a.isOnline) || a.availability === 'available' || a.availability === 'online';
}
