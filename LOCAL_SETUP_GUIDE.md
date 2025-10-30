# Navagraha - Local Setup Guide

**Premium Vedic Astrology Platform**  
Complete instructions for running the application on your local machine

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation Steps](#installation-steps)
3. [Database Setup](#database-setup)
4. [Environment Configuration](#environment-configuration)
5. [Authentication Setup](#authentication-setup)
6. [Running the Application](#running-the-application)
7. [API Keys Configuration](#api-keys-configuration)
8. [Troubleshooting](#troubleshooting)
9. [Project Structure](#project-structure)

---

## Prerequisites

Before you begin, ensure you have the following installed on your machine:

### Required Software

| Software | Version | Download Link |
|----------|---------|---------------|
| **Node.js** | v18 or higher | https://nodejs.org/ |
| **PostgreSQL** | v14 or higher | https://www.postgresql.org/download/ |
| **Git** | Latest | https://git-scm.com/downloads (optional) |

### System Requirements

- **Operating System:** Windows 10/11, macOS 10.15+, or Linux
- **RAM:** Minimum 4GB (8GB recommended)
- **Disk Space:** 500MB free space

---

## Installation Steps

### Step 1: Download the Project

**Option A: Using Git**
```bash
git clone <your-repository-url>
cd navagraha
```

**Option B: Manual Download**
1. Download the project ZIP file
2. Extract to your desired location
3. Open terminal/command prompt in the project folder

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages including:
- React, Express, TypeScript
- Drizzle ORM, TanStack Query
- Tailwind CSS, shadcn/ui components
- And 60+ other dependencies

**Expected time:** 2-5 minutes depending on internet speed

---

## Database Setup

### Step 1: Install PostgreSQL

Follow the installation wizard for your operating system:

**Windows:**
- Download installer from postgresql.org
- Use default port 5432
- Remember the password you set for the `postgres` user

**macOS (using Homebrew):**
```bash
brew install postgresql@14
brew services start postgresql@14
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### Step 2: Create Database

Open terminal and run:

```bash
# Access PostgreSQL
psql -U postgres

# Create the database
CREATE DATABASE navagraha_db;

# Verify creation
\l

# Exit PostgreSQL
\q
```

### Step 3: Run Database Migrations

```bash
npm run db:push
```

This creates all required tables:
- `sessions` - Authentication sessions
- `users` - User profiles
- `kundlis` - Birth charts
- `astrologers` - Astrologer profiles
- `wallets` - User wallets
- `transactions` - Payment history
- `chat_messages` - Chat conversations

---

## Environment Configuration

### Create `.env` File

Create a new file named `.env` in the root directory of the project:

```env
# ============================================
# DATABASE CONFIGURATION
# ============================================
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/navagraha_db
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=YOUR_PASSWORD
PGDATABASE=navagraha_db

# ============================================
# SESSION CONFIGURATION
# ============================================
SESSION_SECRET=GENERATE_RANDOM_STRING_HERE

# ============================================
# GOOGLE MAPS API (Optional)
# ============================================
GOOGLE_MAPS_API_KEY=your-google-maps-api-key

# ============================================
# VEDIC ASTROLOGY API (Optional)
# ============================================
VEDIC_ASTRO_API_KEY=your-vedic-astro-api-key
VEDIC_ASTRO_USER_ID=your-vedic-astro-user-id

# ============================================
# NODE ENVIRONMENT
# ============================================
NODE_ENV=development
```

### Generate Session Secret

Run this command to generate a secure random string:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and use it as your `SESSION_SECRET`.

### Important Notes

⚠️ **Replace placeholders:**
- `YOUR_PASSWORD` - Your PostgreSQL password
- `GENERATE_RANDOM_STRING_HERE` - Generated session secret

⚠️ **Never commit `.env` to version control** - It's already in `.gitignore`

---

## Authentication Setup

For local development, you have two options:

### Option A: Mock Authentication (Recommended for Testing)

This is the simplest approach for local development.

**1. Edit `server/routes.ts`**

Add this code at the beginning of the routes (around line 30, before other routes):

```typescript
// TEMPORARY: Mock authentication for local development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    req.user = {
      id: 'local-test-user-123',
      email: 'test@local.com',
      firstName: 'Test',
      lastName: 'User'
    };
    req.isAuthenticated = () => true;
    next();
  });
}
```

**Benefits:**
- ✅ No external auth provider needed
- ✅ Works immediately
- ✅ Perfect for testing features

**Drawbacks:**
- ❌ No real login/logout
- ❌ Single test user only

### Option B: Replit Auth (Production-Ready)

Keep the existing Replit Auth configuration. This only works when deployed on Replit platform.

For local testing, you'll need to set up your own OIDC provider or disable auth routes temporarily.

---

## Running the Application

### Start Development Server

```bash
npm run dev
```

**Expected output:**
```
[express] serving on port 5000
```

### Access the Application

Open your web browser and navigate to:

```
http://localhost:5000
```

### Verify Installation

You should see:
1. ✅ Navagraha home page with cosmic background
2. ✅ Navigation menu (Home, Generate Kundli, Astrologers, etc.)
3. ✅ No errors in browser console

### Test Core Features

**1. Generate Kundli:**
- Click "Generate Kundli"
- Fill in birth details (name, date, time, place)
- Click "Generate Kundli"
- View generated birth chart

**2. Browse Astrologers:**
- Click "Astrologers" in navigation
- View list of available astrologers
- Click on an astrologer to see profile

**3. Wallet:**
- Click "Wallet" in navigation
- View wallet balance (₹500 default)
- View transaction history

---

## API Keys Configuration

### Google Maps API (Optional)

**Purpose:** Location autocomplete in kundli generation form

**Setup Steps:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable these APIs:
   - Places API
   - Maps JavaScript API
4. Create credentials → API Key
5. Restrict API key (optional but recommended):
   - Application restrictions: HTTP referrers
   - Add: `http://localhost:5000/*`
6. Copy API key to `.env` file

**Cost:** Free tier includes $200/month credit (≈28,500 autocomplete requests)

**Without this key:**
- ⚠️ Location autocomplete won't work
- ✅ Manual location entry still works
- ✅ App functionality not affected

### Vedic Astro API (Optional)

**Purpose:** Real astrological calculations (planetary positions, dashas, doshas)

**Setup Steps:**

1. Visit [VedicAstroAPI.com](https://www.vedicastroapi.com/)
2. Sign up for an account
3. Choose a plan:
   - Basic: ₹2,499/month (75,000 API calls)
   - Pro: ₹4,999/month (200,000 API calls)
4. Get your API credentials:
   - API Key
   - User ID
5. Add to `.env` file

**Cost:** Starting at ₹2,499/month (~$30 USD)

**Without this key:**
- ⚠️ Uses mock/sample astrological data
- ✅ All features work with placeholder data
- ✅ Great for development/testing

---

## Troubleshooting

### Database Connection Failed

**Error:** `ECONNREFUSED` or `Connection refused`

**Solution:**
```bash
# Check if PostgreSQL is running
pg_isready

# Start PostgreSQL
# macOS (Homebrew)
brew services start postgresql@14

# Linux
sudo systemctl start postgresql

# Windows
# Use Services app or pg_ctl start
```

### Port 5000 Already in Use

**Error:** `EADDRINUSE: address already in use :::5000`

**Solution:**

**macOS/Linux:**
```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill -9 <PID>
```

**Windows:**
```bash
# Find process
netstat -ano | findstr :5000

# Kill process
taskkill /PID <PID> /F
```

**Or change port in `server/index.ts`:**
```typescript
const PORT = process.env.PORT || 3000; // Change 5000 to 3000
```

### Module Not Found Errors

**Error:** `Cannot find module 'xyz'`

**Solution:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Or try
npm ci
```

### Database Migration Errors

**Error:** `relation "xyz" does not exist`

**Solution:**
```bash
# Force push schema
npm run db:push

# If that fails, manually recreate database
psql -U postgres
DROP DATABASE navagraha_db;
CREATE DATABASE navagraha_db;
\q

# Then run migration again
npm run db:push
```

### TypeScript Errors

**Error:** Type errors during development

**Solution:**
```bash
# Restart TypeScript server in your editor
# Or rebuild
npm run build
```

### Session Errors

**Error:** `Session store disconnected`

**Solution:**
- Ensure PostgreSQL is running
- Verify `DATABASE_URL` in `.env` is correct
- Check `sessions` table exists in database

---

## Project Structure

```
navagraha/
│
├── client/                      # Frontend (React + TypeScript)
│   ├── src/
│   │   ├── pages/              # Page components
│   │   │   ├── Home.tsx
│   │   │   ├── KundliNew.tsx
│   │   │   ├── KundliView.tsx
│   │   │   ├── Astrologers.tsx
│   │   │   ├── Chat.tsx
│   │   │   ├── Wallet.tsx
│   │   │   └── Matchmaking.tsx
│   │   │
│   │   ├── components/         # Reusable components
│   │   │   ├── ui/            # shadcn/ui components
│   │   │   ├── GlassCard.tsx
│   │   │   ├── CosmicBackground.tsx
│   │   │   ├── PlacesAutocomplete.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   │
│   │   ├── lib/               # Utilities
│   │   │   ├── queryClient.ts
│   │   │   └── utils.ts
│   │   │
│   │   ├── hooks/             # Custom hooks
│   │   │   └── use-toast.ts
│   │   │
│   │   └── App.tsx            # Main app component
│   │
│   └── index.html
│
├── server/                      # Backend (Express + TypeScript)
│   ├── index.ts               # Server entry point
│   ├── routes.ts              # API routes
│   ├── storage.ts             # Database operations
│   ├── vedicAstroService.ts   # Astrology API integration
│   ├── replitAuth.ts          # Authentication
│   └── vite.ts                # Vite integration
│
├── shared/                      # Shared code
│   └── schema.ts              # Database schema & types
│
├── drizzle/                    # Database migrations
│
├── .env                        # Environment variables (CREATE THIS)
├── .env.example               # Environment template
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
├── tailwind.config.ts         # Tailwind CSS config
├── vite.config.ts             # Vite config
├── drizzle.config.ts          # Drizzle ORM config
└── replit.md                  # Project documentation
```

---

## Technology Stack

### Frontend
- **Framework:** React 18 with TypeScript
- **Routing:** Wouter (lightweight router)
- **State Management:** TanStack Query (React Query v5)
- **Forms:** React Hook Form + Zod validation
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui (built on Radix UI)
- **Icons:** Lucide React
- **Build Tool:** Vite

### Backend
- **Runtime:** Node.js
- **Framework:** Express
- **Language:** TypeScript
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL (Neon Serverless)
- **Authentication:** Passport.js with OIDC
- **Session Store:** PostgreSQL (connect-pg-simple)

### External APIs
- **VedicAstroAPI:** Real Vedic astrology calculations
- **Google Places API:** Location autocomplete

---

## Quick Reference

### Common Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Push database schema
npm run db:push

# Generate database client
npm run db:generate

# Open Drizzle Studio (database GUI)
npm run db:studio
```

### Default Credentials

**Mock User (when using Option A auth):**
- Email: test@local.com
- User ID: local-test-user-123

**Database:**
- Host: localhost
- Port: 5432
- Database: navagraha_db
- User: postgres
- Password: (your PostgreSQL password)

### Default Ports

- **Application:** http://localhost:5000
- **PostgreSQL:** localhost:5432
- **Drizzle Studio:** http://localhost:4983 (when running)

---

## Next Steps After Setup

1. ✅ **Test kundli generation** - Generate a few birth charts
2. ✅ **Browse astrologers** - View astrologer profiles
3. ✅ **Check wallet** - View transactions and balance
4. ✅ **Try matchmaking** - Test compatibility analysis
5. 🔄 **Add real API keys** - Get Google Maps & VedicAstro keys
6. 🔄 **Customize** - Modify colors, content, features

---

## Support & Resources

### Documentation
- **React:** https://react.dev/
- **Express:** https://expressjs.com/
- **Drizzle ORM:** https://orm.drizzle.team/
- **shadcn/ui:** https://ui.shadcn.com/
- **TanStack Query:** https://tanstack.com/query/

### API Documentation
- **Google Places:** https://developers.google.com/maps/documentation/places/web-service
- **VedicAstroAPI:** https://www.vedicastroapi.com/docs

### Community
- **GitHub Issues:** Report bugs and request features
- **Stack Overflow:** Get help with technical questions

---

## License

This project is private and proprietary. All rights reserved.

---

**Document Version:** 1.0  
**Last Updated:** October 30, 2025  
**Application Version:** 1.0.0

---

© 2025 Navagraha - Premium Vedic Astrology Platform
