// Astrologer facts are shown only when the astrologer has them; nothing is invented to fill a card.

/** "4.7" for a rated astrologer, "New" before any rating exists. */
export function ratingLabel(rating: string | number | null | undefined): string {
  const n = Number(rating);
  return Number.isFinite(n) && n > 0 ? n.toFixed(1) : 'New';
}

/** "12y exp", or null when no experience is on record. */
export function experienceLabel(experience: string | number | null | undefined): string | null {
  const n = Number(experience);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n)}y exp` : null;
}

/** "₹25", or null when no price is set. */
export function priceLabel(pricePerMinute: string | number | null | undefined): string | null {
  const n = Number(pricePerMinute);
  return Number.isFinite(n) && n > 0 ? `₹${Number.isInteger(n) ? n : n.toFixed(2)}` : null;
}
