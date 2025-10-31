# Navagraha - Local Development Setup Guide

## Project Overview

Navagraha is a premium Vedic astrology web application built with React, Node.js, Express, and PostgreSQL. This guide will help you set up and run the project locally.

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for build tooling
- **Wouter** for client-side routing
- **TanStack Query (React Query)** for server state management
- **React Hook Form** + **Zod** for form validation
- **Tailwind CSS** + **shadcn/ui** component library
- **Framer Motion** for animations

### Backend
- **Node.js** with **Express**
- **TypeScript** for type safety
- **Drizzle ORM** for database operations
- **PostgreSQL** (Neon Serverless)
- **Passport.js** with OpenID Connect for authentication
- **Express Session** with PostgreSQL store

### External APIs
- **VedicAstroAPI** - Professional Vedic astrology calculations
- **Google Places API** - Location autocomplete

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **PostgreSQL** (v14 or higher)
- **Git**

## Installation Steps

### 1. Clone/Download the Project

If you're working with this Replit project locally:

```bash
# Download the project files from Replit or clone from git
git clone <your-repo-url>
cd navagraha
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables Setup

Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/navagraha
PGHOST=localhost
PGPORT=5432
PGUSER=your_username
PGPASSWORD=your_password
PGDATABASE=navagraha

# Session Secret (generate a random string)
SESSION_SECRET=your-very-secure-random-string-here

# Google Maps API Key (for location autocomplete)
GOOGLE_MAPS_API_KEY=your-google-maps-api-key

# VedicAstroAPI Credentials (optional - falls back to mock data if not provided)
VEDIC_ASTRO_API_KEY=your-vedic-astro-api-key
VEDIC_ASTRO_USER_ID=your-vedic-astro-user-id

# Node Environment
NODE_ENV=development
```

### 4. Database Setup

#### Create PostgreSQL Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE navagraha;

# Exit psql
\q
```

#### Run Database Migrations

The project uses Drizzle ORM. To set up the database schema:

```bash
# Push schema to database
npm run db:push

# Or if that doesn't work, use force mode
npm run db:push --force
```

#### Seed Initial Data (Optional)

The application will automatically create seed data for astrologers when you first run it.

### 5. Authentication Setup

This project uses **Replit Auth** which works via OpenID Connect. For local development, you have two options:

#### Option A: Mock Authentication (Easiest for Local Development)

Modify `server/auth.ts` to use a simplified local auth strategy:

```typescript
// Add a simple local strategy for development
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';

// Add this for local development
if (process.env.NODE_ENV === 'development') {
  passport.use(new LocalStrategy(
    function(username, password, done) {
      // Mock user for local dev
      return done(null, {
        id: 'local-dev-user',
        email: 'dev@localhost.com',
        username: 'developer'
      });
    }
  ));
}
```

#### Option B: Set Up Your Own OIDC Provider

Use services like Auth0, Clerk, or Firebase Auth and configure the OIDC settings in `server/auth.ts`.

### 6. API Keys Setup

#### Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Maps JavaScript API** and **Places API**
4. Create credentials → API Key
5. Add the key to your `.env` file

#### VedicAstroAPI (Optional)

1. Sign up at [VedicAstroAPI](https://vedicastroapi.com/)
2. Get your API key and User ID
3. Add to `.env` file
4. **Note:** If not provided, the app will use mock data

## Running the Project

### Development Mode

Start both the backend server and frontend dev server:

```bash
npm run dev
```

This will:
- Start the Express server on port 5000
- Start the Vite dev server
- Open your browser to `http://localhost:5000`

### Production Build

```bash
# Build the frontend
npm run build

# Start the production server
npm start
```

## Project Structure

```
navagraha/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   │   └── ui/       # shadcn/ui components
│   │   ├── pages/        # Page components (routing)
│   │   ├── lib/          # Utilities and helpers
│   │   ├── App.tsx       # Main app component with routing
│   │   ├── main.tsx      # Entry point
│   │   └── index.css     # Global styles and theme
│   └── index.html        # HTML template
├── server/                # Backend Node.js/Express application
│   ├── routes.ts         # API route handlers
│   ├── storage.ts        # Database operations (Drizzle ORM)
│   ├── auth.ts           # Authentication setup (Passport + OIDC)
│   ├── vedicAstroService.ts  # VedicAstroAPI integration
│   ├── vite.ts           # Vite middleware for dev server
│   └── index.ts          # Express server entry point
├── shared/
│   └── schema.ts         # Shared TypeScript types and Drizzle schemas
├── db/
│   └── index.ts          # Database connection setup
├── attached_assets/      # Static assets (images, icons)
├── .env                  # Environment variables (create this)
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── tailwind.config.ts    # Tailwind CSS configuration
├── vite.config.ts        # Vite configuration
└── drizzle.config.ts     # Drizzle ORM configuration
```

## Key Features

### 1. Kundli Generation
- Birth chart creation with planetary positions
- Divisional charts (D1, D9, D10, D12)
- Dasha calculations (Vimshottari system)
- Dosha detection (Mangal, Kaal Sarp, Pitra)

### 2. Daily Horoscope
- Zodiac-based predictions
- Supports 21 languages

### 3. Matchmaking
- Ashtakoot compatibility analysis
- Guna Milan scoring

### 4. Astrologer Consultation
- Browse expert astrologers
- Real-time chat interface
- Wallet-based payment system

### 5. User Profile
- Save multiple kundlis
- Transaction history
- Profile management

## Database Schema

The application uses the following main tables:

- **users** - User profiles and birth details
- **kundlis** - Generated birth charts (JSONB storage)
- **astrologers** - Astrologer profiles and availability
- **wallets** - User wallet balances
- **transactions** - Payment transaction history
- **chatMessages** - Chat conversation history
- **sessions** - Express session storage

## Design System

### Color Palette
- **Primary:** Golden Yellow (#F5A623 / HSL 43 96% 56%)
- **Secondary:** Soft Purple (#8B5CF6)
- **Background:** White/Cream (light mode)
- **Text:** Dark on light backgrounds

### Theme Support
- Light mode (default)
- Dark mode (via toggle)
- Defined in `client/src/index.css`

### Components
- Uses **shadcn/ui** component library
- Custom components: ZodiacIcon, LoadingSpinner, ThemeToggle
- Card-based layouts with hover effects

## Development Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Database operations
npm run db:push        # Sync schema with database
npm run db:studio      # Open Drizzle Studio (database GUI)

# Type checking
npm run type-check

# Linting
npm run lint
```

## Troubleshooting

### Port Already in Use

If port 5000 is already in use:

```bash
# Find and kill the process using port 5000
# On macOS/Linux:
lsof -ti:5000 | xargs kill -9

# On Windows:
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

### Database Connection Issues

1. Ensure PostgreSQL is running:
   ```bash
   # macOS
   brew services start postgresql
   
   # Linux
   sudo systemctl start postgresql
   
   # Windows
   # Start from Services or pgAdmin
   ```

2. Verify connection string in `.env`
3. Check database user permissions

### Authentication Issues

For local development, consider using the mock authentication setup (Option A) mentioned above.

### Missing API Keys

The application will work with limited functionality without API keys:
- **Without Google Maps API:** Manual lat/long input for kundli generation
- **Without VedicAstroAPI:** Mock data for horoscopes and calculations

## Working with ChatGPT

To get help from ChatGPT on this project:

1. **Share the context:** Provide the relevant files (e.g., `shared/schema.ts`, specific page components)

2. **Example prompts:**
   - "I want to add a new feature to show planetary transits. Here's my current schema: [paste schema.ts]"
   - "I'm getting a TypeScript error in this component: [paste code]"
   - "How do I add a new API endpoint for [feature]? Here's my current routes.ts: [paste file]"

3. **Best practices:**
   - Include error messages with full stack traces
   - Share the relevant component/file you're working on
   - Mention the tech stack (React, TypeScript, Drizzle ORM, etc.)
   - Reference the design system from `design_guidelines.md`

## Additional Resources

- **Drizzle ORM Docs:** https://orm.drizzle.team/
- **React Query Docs:** https://tanstack.com/query/latest
- **shadcn/ui Components:** https://ui.shadcn.com/
- **Tailwind CSS:** https://tailwindcss.com/
- **VedicAstroAPI Docs:** https://vedicastroapi.com/docs

## Support

For issues specific to this Replit project, consult:
- `replit.md` - Project architecture and recent changes
- `design_guidelines.md` - UI/UX design specifications
- Project documentation in code comments

## License

[Add your license information here]

---

**Last Updated:** October 31, 2025
**Version:** 2.0 (Clean Light Theme Redesign)
