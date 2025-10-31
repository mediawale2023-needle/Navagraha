# Navagraha - Premium Vedic Astrology Platform

## Recent Changes (October 31, 2025)

**Major UI/UX Redesign - Dark to Light Theme Transformation:**
- Completely redesigned from dark cosmic theme to clean, modern light aesthetic across ALL pages
- New color palette: Golden yellow (#F5A623) primary, soft purple (#8B5CF6) secondary
- Replaced glassmorphism with clean card-based layouts and subtle shadows
- Changed default theme from dark to light mode in ThemeProvider
- **Landing page** (unauthenticated view) completely redesigned:
  - Removed all cosmic backgrounds and galaxy imagery
  - Removed GlassCard and CosmicBackground components
  - Updated messaging from "Discover Your Cosmic Blueprint" to "Your Personal Vedic Astrology Guide"
  - Clean white sticky header with branding and sign-in button
  - Light gradient backgrounds and standard Card components
  - Added clean footer with links
- **Home page** (authenticated view) completely redesigned:
  - Clean navigation with responsive mobile menu (hamburger Sheet component)
  - Modern hero section with call-to-action buttons
  - Redesigned horoscope section with zodiac cards
  - Updated astrologer cards with clean styling
  - New footer section
- **All other pages** updated to match clean light theme:
  - Astrologers, Wallet, Chat, Profile pages - removed all backdrop-blur effects
  - Standardized Avatar component usage throughout
  - Updated all headers to clean white backgrounds (bg-white border-b)
  - Fixed TypeScript errors (wallet queries, avatar image handling, date constructors)
- Updated design_guidelines.md to reflect new light theme specifications
- Fixed kundli generation validation (latitude/longitude type coercion)
- **Testing:** E2E tests confirmed clean light theme across all pages, mobile responsiveness maintained

## Overview

Navagraha is a full-stack premium Vedic astrology platform that enables users to generate kundli (birth charts), consult with expert astrologers, perform matchmaking analysis, and manage wallet transactions for services. The application combines ancient Vedic wisdom with modern design aesthetics, inspired by premium astrology platforms like AstroKarma, Co-Star, and Astrotalk.

The platform offers both authenticated and guest experiences, with core features including:
- Kundli generation and analysis with divisional charts
- Daily horoscope predictions
- Kundli matchmaking (compatibility analysis)
- Real-time chat with astrologers
- Wallet management and transaction history
- User profile management with saved kundlis

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18 with TypeScript
- Vite for build tooling and development server
- Wouter for client-side routing
- TanStack Query (React Query) for server state management
- React Hook Form with Zod for form validation
- Tailwind CSS for styling with shadcn/ui component library

**Design System:**
- Clean, modern light aesthetic inspired by premium astrology apps (Behance reference by Manoj A)
- **Primary Color:** Golden yellow (#F5A623) - warm, inviting, auspicious in Vedic culture
- **Secondary Color:** Soft purple (#8B5CF6) - spiritual, mystical accent
- **Backgrounds:** White/cream tones with subtle shadows instead of glassmorphism
- **Light mode by default** with dark mode support via `ThemeProvider`
- Custom color system using CSS variables for theming
- Typography: Inter for body text, Playfair Display/serif for headings
- Card-based layouts with clean borders and subtle elevation
- Spacing follows Tailwind's spacing scale (2, 4, 6, 8, 12, 16, 20, 24)
- Mobile-first responsive design with hamburger menu navigation

**Component Architecture:**
- Shadcn/ui component library for base UI primitives (buttons, cards, forms, dialogs, etc.)
- Custom reusable components: `ZodiacIcon`, `LoadingSpinner`, `ThemeToggle`
- Standard Card components with hover-elevate effects replace previous glassmorphism
- Page-based routing with dedicated components for each major feature
- Responsive design with mobile-first approach, hamburger menu navigation

**State Management:**
- TanStack Query for API data fetching and caching
- Custom hooks for authentication (`useAuth`) and UI state
- Form state managed by React Hook Form
- Theme state managed via Context API

### Backend Architecture

**Technology Stack:**
- Node.js with Express
- TypeScript for type safety
- Drizzle ORM for database operations
- Neon Serverless PostgreSQL for database
- Session-based authentication using express-session with PostgreSQL store

**Authentication:**
- Replit Auth integration using OpenID Connect (OIDC)
- Passport.js with OpenID Client strategy
- Session management with PostgreSQL-backed session store
- Protected API routes using `isAuthenticated` middleware
- Guest mode supported for browsing without authentication

**API Architecture:**
- RESTful API design with `/api/*` namespace
- Route handlers in `server/routes.ts`
- Storage abstraction layer in `server/storage.ts`
- **VedicAstroAPI Integration** - Real Vedic astrology calculations via `server/vedicAstroService.ts`
  - Kundli generation with planetary positions, dashas, and dosha detection
  - Daily horoscope predictions (supports 21 languages)
  - Matchmaking compatibility (Ashtakoot system)
  - Automatic fallback to mock data if API unavailable
- Validation using Zod schemas from shared schema definitions

**Data Layer:**
- Storage interface pattern (`IStorage`) for database operations
- Drizzle ORM with type-safe query builders
- PostgreSQL as primary database via Neon serverless
- Session table for authentication state
- Core tables: users, kundlis, astrologers, wallets, transactions, chatMessages

### Database Schema

**Core Tables:**
- `sessions`: Session storage for authentication (required for Replit Auth)
- `users`: User profiles with birth details and metadata
- `kundlis`: Generated birth charts with complete astrological data (JSON storage)
- `astrologers`: Astrologer profiles with specializations, ratings, and availability
- `wallets`: User wallet balances for service payments
- `transactions`: Financial transaction history
- `chatMessages`: Chat conversation history between users and astrologers

**Data Relationships:**
- Users have one-to-many relationship with kundlis
- Users have one wallet
- Users have many transactions
- Chat messages link users to astrologers

**Schema Design Patterns:**
- UUID primary keys using `gen_random_uuid()`
- JSONB columns for flexible astrological data storage
- Timestamp tracking with `createdAt` and `updatedAt`
- Enum-like constraints using VARCHAR with validation
- Decimal types for precise financial calculations

### External Dependencies

**Third-Party UI Libraries:**
- Radix UI primitives for accessible component foundations
- Framer Motion for animations (splash screen)
- Lucide React for icon system
- shadcn/ui component library built on Radix UI

**Development Tools:**
- Replit-specific plugins for development environment
- Vite plugins for runtime error overlay and development features
- ESBuild for production server bundling

**Database & Infrastructure:**
- Neon Serverless PostgreSQL (via `@neondatabase/serverless`)
- WebSocket support via `ws` package for Neon connections
- Drizzle Kit for database migrations

**Form & Validation:**
- React Hook Form for form state management
- Zod for schema validation
- `@hookform/resolvers` for Zod integration

**Session Management:**
- `connect-pg-simple` for PostgreSQL session storage
- `express-session` for session middleware
- Memoization via `memoizee` for OIDC configuration caching

**External APIs:**
- **VedicAstroAPI** - Professional Vedic astrology calculations
  - Real planetary positions using Swiss Ephemeris algorithms
  - Accurate dasha calculations (Vimshottari, current Mahadasha)
  - Dosha detection (Mangal, Kaal Sarp, Pitra)
  - Daily horoscope predictions (21 languages supported)
  - Ashtakoot matchmaking compatibility
  - Automatic fallback to mock data if API unavailable
- **Google Places API** - Location autocomplete for kundli generation
  - Integrated via script tag injection with callback pattern
  - Provides accurate coordinates (latitude/longitude) for birth locations
  - API key fetched from backend via `/api/config` endpoint
  - Graceful degradation to manual input if API unavailable
  - Cities-focused autocomplete for better relevance

**Current Limitations:**
- No actual payment gateway integration (wallet is simulated)
- Chat is basic implementation without WebSocket real-time updates (uses polling)
- No actual astrologer availability/booking system
- Timezone calculation uses fixed IST (5.5) - needs dynamic calculation based on location