# 🌟 Navagraha - Premium Vedic Astrology Platform

A modern, full-stack Vedic astrology web application featuring kundli generation, daily horoscopes, matchmaking, and expert astrologer consultations.

![Version](https://img.shields.io/badge/version-2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### 🔮 Core Features
- **Kundli Generation** - Detailed Vedic birth charts with planetary positions, dashas, and dosha detection
- **Daily Horoscope** - Personalized predictions for all zodiac signs (21 languages supported)
- **Matchmaking** - Ashtakoot compatibility analysis using traditional Vedic methods
- **Expert Consultations** - Real-time chat with certified Vedic astrologers
- **Wallet System** - Secure payment management for services
- **User Profiles** - Save multiple kundlis, view transaction history

### 🎨 Design
- **Clean Light Theme** - Modern, professional aesthetic inspired by premium astrology apps
- **Golden Yellow Primary** (#F5A623) - Warm, auspicious color scheme
- **Responsive Design** - Mobile-first approach with smooth animations
- **Dark Mode Support** - Toggle between light and dark themes
- **Card-Based Layout** - Clean, organized interface with subtle hover effects

## 🚀 Quick Start

### For Local Development

See **[LOCAL_SETUP.md](./LOCAL_SETUP.md)** for complete installation instructions.

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# 3. Set up PostgreSQL database
npm run db:push

# 4. Start development server
npm run dev
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

### For Working with ChatGPT

See **[CHATGPT_GUIDE.md](./CHATGPT_GUIDE.md)** for tips on using ChatGPT to develop features.

## 📚 Documentation

- **[LOCAL_SETUP.md](./LOCAL_SETUP.md)** - Complete local development setup guide
- **[CHATGPT_GUIDE.md](./CHATGPT_GUIDE.md)** - Guide for working with ChatGPT on this project
- **[design_guidelines.md](./design_guidelines.md)** - UI/UX design specifications
- **[replit.md](./replit.md)** - Project architecture and recent changes

## 🛠️ Tech Stack

### Frontend
- React 18 + TypeScript
- Vite (build tool)
- Wouter (routing)
- TanStack Query (state management)
- Tailwind CSS + shadcn/ui
- React Hook Form + Zod

### Backend
- Node.js + Express
- TypeScript
- Drizzle ORM
- PostgreSQL (Neon)
- Passport.js (authentication)

### External APIs
- VedicAstroAPI (astrology calculations)
- Google Places API (location autocomplete)

## 📁 Project Structure

```
navagraha/
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # Reusable components
│   │   ├── pages/      # Page components
│   │   └── lib/        # Utilities
│   └── index.html
├── server/              # Express backend
│   ├── routes.ts       # API endpoints
│   ├── storage.ts      # Database operations
│   └── auth.ts         # Authentication
├── shared/
│   └── schema.ts       # Database schema & types
├── db/                 # Database config
└── docs/               # Documentation
```

## 🎯 Key Pages

1. **Landing** - Unauthenticated homepage with feature showcase
2. **Home** - Authenticated dashboard with horoscope and astrologer cards
3. **Kundli Generation** - Form to create new birth charts
4. **Kundli View** - Detailed chart analysis with divisional charts
5. **Matchmaking** - Compatibility analysis between two charts
6. **Astrologers** - Browse and filter expert astrologers
7. **Chat** - Real-time messaging with astrologers
8. **Wallet** - Manage balance and view transaction history
9. **Profile** - User settings and saved kundlis

## 🎨 Design System

### Colors
- **Primary:** `#F5A623` (Golden Yellow)
- **Secondary:** `#8B5CF6` (Soft Purple)
- **Background:** White/Cream (light) / Dark Blue (dark)
- **Accent:** Purple tones for spiritual elements

### Components
- **Card-based layouts** with `hover-elevate` effects
- **shadcn/ui components** for buttons, forms, dialogs
- **Responsive navigation** with mobile hamburger menu
- **Clean typography** - Inter (body), Playfair Display (headings)

### Theme Toggle
Light mode is default. Users can switch to dark mode via the theme toggle button in the header.

## 🔐 Environment Variables

Required variables (see `.env.example`):

```env
DATABASE_URL=              # PostgreSQL connection string
SESSION_SECRET=            # Random string for sessions
GOOGLE_MAPS_API_KEY=       # For location autocomplete
VEDIC_ASTRO_API_KEY=       # Optional (falls back to mock data)
VEDIC_ASTRO_USER_ID=       # Optional
```

## 🧪 Development

```bash
# Install dependencies
npm install

# Start dev server (backend + frontend)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Database operations
npm run db:push          # Sync schema with database
npm run db:studio        # Open Drizzle Studio (database GUI)

# Type checking
npm run type-check
```

## 📱 Mobile Support

The application is fully responsive with:
- Mobile-first design approach
- Hamburger navigation menu for small screens
- Touch-optimized interactions
- Optimized performance for mobile devices

## 🌍 Internationalization

- Daily horoscope supports 21 languages
- Extensible i18n architecture for future expansion

## 🔒 Security

- Session-based authentication with secure cookies
- CSRF protection
- Environment variable management for secrets
- Input validation with Zod schemas
- SQL injection protection via Drizzle ORM

## 🚧 Roadmap

- [ ] Real-time WebSocket chat
- [ ] Payment gateway integration (Stripe/Razorpay)
- [ ] Email notifications
- [ ] Advanced chart analysis features
- [ ] Astrologer booking system
- [ ] Mobile app (React Native)

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 💡 Getting Help

- **Local Setup Issues:** See [LOCAL_SETUP.md](./LOCAL_SETUP.md)
- **ChatGPT Help:** See [CHATGPT_GUIDE.md](./CHATGPT_GUIDE.md)
- **Design Questions:** See [design_guidelines.md](./design_guidelines.md)
- **Architecture:** See [replit.md](./replit.md)

## 🙏 Acknowledgments

- **VedicAstroAPI** for professional astrology calculations
- **shadcn/ui** for beautiful component primitives
- **Drizzle ORM** for type-safe database operations
- Inspired by premium astrology platforms like Co-Star, Sanctuary, and Astrotalk

## 📞 Support

For questions or issues:
1. Check the documentation files
2. Search existing issues
3. Open a new issue with detailed information

---

**Built with ❤️ for Vedic Astrology enthusiasts**

**Last Updated:** October 31, 2025  
**Version:** 2.0 - Clean Light Theme Redesign
