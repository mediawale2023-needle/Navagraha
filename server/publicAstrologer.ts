import type { Astrologer } from '@shared/schema';

/**
 * The only astrologer fields a visitor may see. An allow-list, so a column added later
 * (contact, KYC, bank, earnings, credits) stays private unless it is added here on purpose.
 */
export function publicAstrologer(a: Astrologer) {
  return {
    id: a.id,
    name: a.name,
    profileImageUrl: a.profileImageUrl,
    specializations: a.specializations,
    experience: a.experience,
    rating: a.rating,
    totalConsultations: a.totalConsultations,
    pricePerMinute: a.pricePerMinute,
    availability: a.availability,
    languages: a.languages,
    about: a.about,
    certifications: a.certifications,
    isVerified: a.isVerified,
    isOnline: a.isOnline,
  };
}
