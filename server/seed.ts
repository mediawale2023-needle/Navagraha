import { db } from "./db";
import { astrologers } from "@shared/schema";

const astrologerImages = [
  'professional_indian__fe6b0669.jpg',
  'professional_indian__85b3f37a.jpg',
  'professional_indian__f6a78414.jpg',
  'professional_indian__ada45c82.jpg',
  'professional_indian__7e50bc49.jpg',
  'professional_indian__7857f9ad.jpg',
  'professional_indian__6c62ef62.jpg',
  'professional_indian__afd6c8e2.jpg',
  'professional_indian__61011add.jpg',
  'professional_indian__f50b906a.jpg',
];

const specializations = [
  ['Vedic Astrology', 'Kundli Analysis', 'Career Guidance'],
  ['Love & Relationships', 'Marriage Compatibility', 'Family Matters'],
  ['Numerology', 'Gemstone Consultation', 'Vastu Shastra'],
  ['Palmistry', 'Face Reading', 'Tarot Reading'],
  ['Business Astrology', 'Financial Planning', 'Property Matters'],
  ['Health Astrology', 'Medical Astrology', 'Remedies'],
  ['Child Astrology', 'Education Guidance', 'Career Selection'],
  ['Spiritual Guidance', 'Meditation', 'Life Coaching'],
  ['Horary Astrology', 'Muhurat Selection', 'Event Planning'],
  ['Prashna Kundli', 'Transit Analysis', 'Annual Predictions'],
];

const aboutTexts = [
  'Renowned Vedic astrologer with expertise in kundli analysis and life predictions. Helping people find clarity and direction for over a decade.',
  'Expert in relationship counseling and compatibility analysis. Guiding couples towards harmonious unions through ancient wisdom.',
  'Certified numerologist and gemstone expert. Specializing in personalized remedies and spiritual guidance.',
  'Master palmist with deep knowledge of traditional Indian astrology. Providing accurate predictions and practical solutions.',
  'Business astrology specialist helping entrepreneurs and professionals make informed decisions.',
  'Health and wellness astrologer focusing on holistic healing through astrological remedies.',
  'Child astrology expert guiding parents in nurturing their children\'s potential and talents.',
  'Spiritual counselor combining astrology with meditation and life coaching techniques.',
  'Muhurat and event timing specialist ensuring auspicious beginnings for important occasions.',
  'Transit analysis expert providing timely guidance for navigating life\'s changes.',
];

const names = [
  'Pandit Rajesh Sharma',
  'Dr. Priya Patel',
  'Acharya Vikram Singh',
  'Swami Anand Kumar',
  'Guruji Manoj Tiwari',
  'Jyotish Sanjay Verma',
  'Pt. Ramesh Joshi',
  'Dr. Anjali Mehta',
  'Acharya Suresh Gupta',
  'Pandit Deepak Shastri',
];

const languages = [
  ['Hindi', 'English', 'Sanskrit'],
  ['English', 'Gujarati', 'Hindi'],
  ['Hindi', 'English', 'Punjabi'],
  ['English', 'Tamil', 'Hindi'],
  ['Hindi', 'English', 'Bengali'],
  ['English', 'Hindi', 'Marathi'],
  ['Hindi', 'English', 'Telugu'],
  ['English', 'Hindi', 'Kannada'],
  ['Hindi', 'English', 'Malayalam'],
  ['English', 'Hindi', 'Urdu'],
];

async function seedAstrologers() {
  try {
    console.log('🌟 Starting to seed astrologers...');

    const astrologersData = names.map((name, index) => ({
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@navagraha.com`,
      profileImageUrl: `/attached_assets/stock_images/${astrologerImages[index]}`,
      specializations: specializations[index],
      experience: Math.floor(Math.random() * 15) + 5, // 5-20 years
      rating: (4.5 + Math.random() * 0.5).toFixed(2), // 4.5-5.0
      totalConsultations: Math.floor(Math.random() * 5000) + 500, // 500-5500
      pricePerMinute: (20 + Math.floor(Math.random() * 30)).toString(), // 20-50 per min
      availability: Math.random() > 0.3 ? 'available' : 'busy',
      languages: languages[index],
      about: aboutTexts[index],
      certifications: ['Certified Vedic Astrologer', 'Jyotish Visharad'],
    }));

    for (const astrologerData of astrologersData) {
      await db.insert(astrologers).values(astrologerData);
      console.log(`✓ Added astrologer: ${astrologerData.name}`);
    }

    console.log(`\n✨ Successfully seeded ${astrologersData.length} astrologers!`);
  } catch (error) {
    console.error('❌ Error seeding astrologers:', error);
    throw error;
  }
}

seedAstrologers()
  .then(() => {
    console.log('🎉 Seed completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to seed database:', error);
    process.exit(1);
  });
