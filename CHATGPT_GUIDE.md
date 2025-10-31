# Working with ChatGPT on Navagraha

This guide helps you effectively collaborate with ChatGPT when developing features for the Navagraha astrology platform.

## Quick Start Prompts

### Getting Help with Existing Code

```
I'm working on the Navagraha astrology app (React + TypeScript + Express + Drizzle ORM).

I need help with [specific feature/issue].

Here's the relevant code:
[paste your code]

Here's the error I'm getting:
[paste error message]
```

### Adding a New Feature

```
I'm building a Vedic astrology app with React, TypeScript, Express, and PostgreSQL (Drizzle ORM).

I want to add a feature that [describe feature].

Here's my current database schema:
[paste relevant parts of shared/schema.ts]

Here's my current API routes:
[paste relevant parts of server/routes.ts]

How should I implement this?
```

### UI/UX Questions

```
I'm working on a light-themed astrology app using React, Tailwind CSS, and shadcn/ui.

Design guidelines:
- Primary color: Golden yellow (#F5A623)
- Secondary: Soft purple (#8B5CF6)
- Clean, modern aesthetic
- Card-based layouts

I need help designing [specific component/page].
```

## Key Files to Share

When asking ChatGPT for help, share these files based on your task:

### For Database Changes
```
shared/schema.ts          # Database schema with Drizzle ORM
server/storage.ts         # Database operations
```

### For API Changes
```
server/routes.ts          # API endpoints
server/storage.ts         # Database queries
shared/schema.ts          # Type definitions
```

### For Frontend Changes
```
client/src/pages/[YourPage].tsx     # Specific page component
client/src/components/ui/[Component].tsx  # UI component
client/src/index.css                 # Theme and styling
design_guidelines.md                 # Design specifications
```

### For Authentication
```
server/auth.ts            # Authentication setup
```

### For External APIs
```
server/vedicAstroService.ts    # VedicAstroAPI integration
```

## Common Tasks with Example Prompts

### 1. Adding a New Page

**Prompt:**
```
I'm adding a new "Birth Chart Analysis" page to my astrology app.

Tech stack: React, TypeScript, Wouter (routing), shadcn/ui

Design system:
- Uses Card components with hover-elevate effects
- Primary color: Golden yellow (#F5A623)
- Clean white backgrounds
- Mobile-responsive

Here's how my current routing works in App.tsx:
[paste App.tsx routing section]

Create a new page component that:
1. Shows detailed chart analysis
2. Displays planetary positions in a table
3. Has a clean, modern layout
4. Follows the design system
```

### 2. Adding a Database Table

**Prompt:**
```
I need to add a "predictions" table to my PostgreSQL database.

Current setup:
- Using Drizzle ORM with TypeScript
- Database: Neon PostgreSQL

Requirements:
- Store user predictions with zodiac sign, date, and prediction text
- Link to user table (varchar ID with UUID)
- Include created_at timestamp

Here's an example table from my schema:
[paste one table from shared/schema.ts]

Create the Drizzle schema for this new table, plus the insert/select types.
```

### 3. Adding an API Endpoint

**Prompt:**
```
I need to add a new API endpoint GET /api/predictions/:userId

Tech stack: Express, TypeScript, Drizzle ORM

Here's my current routes structure:
[paste relevant section from server/routes.ts]

Here's my storage interface:
[paste IStorage interface from server/storage.ts]

Create:
1. The storage method
2. The API route handler
3. Proper TypeScript types
4. Error handling
```

### 4. Fixing TypeScript Errors

**Prompt:**
```
I'm getting this TypeScript error in my React component:

[paste full error message]

Here's my code:
[paste component code]

Tech stack: React, TypeScript, TanStack Query, Zod validation

How do I fix this?
```

### 5. Styling Components

**Prompt:**
```
I need to style this component to match my design system.

Design system:
- Tailwind CSS + shadcn/ui
- Primary: Golden yellow (#F5A623) - use 'text-primary' or 'bg-primary'
- Card-based layouts with 'hover-elevate' effects
- Clean white backgrounds

Current component:
[paste your component]

Make it match the design system with proper spacing, colors, and hover effects.
```

### 6. Form Handling

**Prompt:**
```
I need to create a form for [purpose].

Tech stack: React Hook Form, Zod validation, shadcn/ui Form components

Form fields needed:
- [list fields]

Here's a similar form from my app:
[paste example form]

Here's my Zod schema:
[paste schema]

Create the complete form component with validation.
```

## Project Context to Share

When starting a conversation with ChatGPT, provide this context:

```
Project: Navagraha - Vedic Astrology Platform

Tech Stack:
- Frontend: React 18, TypeScript, Vite, Wouter (routing)
- UI: Tailwind CSS, shadcn/ui, Framer Motion
- State: TanStack Query (React Query)
- Forms: React Hook Form + Zod
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL with Drizzle ORM
- Auth: Passport.js with OIDC

Design System:
- Primary Color: Golden yellow (#F5A623)
- Secondary: Soft purple (#8B5CF6)
- Light theme by default (dark mode available)
- Clean, modern aesthetic with card-based layouts
- Mobile-first responsive design

Key Features:
- Kundli (birth chart) generation
- Daily horoscope
- Matchmaking (compatibility)
- Astrologer consultation with chat
- Wallet system for payments
```

## File Structure Reference

```
client/src/
  ├── components/ui/     # shadcn components (Button, Card, etc.)
  ├── pages/            # Page components (Home, Landing, etc.)
  ├── lib/              # Utilities (queryClient, etc.)
  ├── App.tsx           # Main app with routing
  └── index.css         # Global styles & theme

server/
  ├── routes.ts         # API endpoints
  ├── storage.ts        # Database operations
  ├── auth.ts           # Authentication
  └── vedicAstroService.ts  # External API integration

shared/
  └── schema.ts         # Database schema & types
```

## Best Practices for ChatGPT Prompts

### ✅ DO:
- Be specific about what you want
- Include relevant code context
- Mention the tech stack
- Share error messages with full stack traces
- Reference the design system
- Ask for explanations along with code

### ❌ DON'T:
- Ask vague questions like "fix my code"
- Paste entire large files (just relevant sections)
- Forget to mention if you're using TypeScript
- Skip mentioning if it's frontend or backend code
- Ignore the existing design patterns

## Example Conversation Flow

**You:**
```
I'm adding a "Transit Predictions" feature to my astrology app.

Tech: React, TypeScript, TanStack Query, shadcn/ui

I need:
1. A page showing planetary transits
2. API endpoint to get transit data
3. Database table to store transits

Start with the database schema. Here's my current schema file:
[paste shared/schema.ts]
```

**ChatGPT Response:** [Creates schema]

**You:**
```
Great! Now create the storage methods and API endpoint.

Here's my current storage interface:
[paste IStorage from server/storage.ts]

Here's how my routes are structured:
[paste relevant routes from server/routes.ts]
```

**ChatGPT Response:** [Creates storage and routes]

**You:**
```
Perfect! Now create the frontend page component.

Design system (from design_guidelines.md):
- Card-based layout
- Golden yellow primary (#F5A623)
- Use shadcn Card, Button components
- hover-elevate effects

Here's a similar page for reference:
[paste example page]
```

**ChatGPT Response:** [Creates page component]

## Debugging with ChatGPT

### Runtime Errors

```
I'm getting this error when [action]:

Error message:
[paste full error]

Stack trace:
[paste stack trace]

Relevant code:
[paste the code where error occurs]

Environment: [development/production]
Browser: [Chrome/Firefox/Safari]
```

### Build Errors

```
My build is failing with this error:

[paste build error]

Here's my vite.config.ts:
[paste config]

Here's my tsconfig.json:
[paste config]
```

### Type Errors

```
TypeScript is complaining about this:

[paste type error]

Here's the code:
[paste code]

Here are my types:
[paste relevant type definitions]
```

## Code Review with ChatGPT

```
Can you review this code for:
- TypeScript best practices
- React best practices
- Security issues
- Performance improvements

Here's my code:
[paste code]

Tech stack: React, TypeScript, Express
```

## Learning with ChatGPT

```
I want to understand how [feature] works in my app.

Can you explain:
1. How the data flows from database to UI
2. What each part does
3. Why it's structured this way

Here's the relevant code:
[paste code sections]
```

## Tips for Better Results

1. **Be Incremental:** Break large features into small steps
2. **Provide Context:** Always mention the tech stack
3. **Share Examples:** Show similar working code from your app
4. **Ask Follow-ups:** Don't hesitate to ask for clarification
5. **Test & Iterate:** Try the solution, share results, refine

## Common ChatGPT Use Cases

- ✅ Writing new components
- ✅ Creating API endpoints
- ✅ Database schema design
- ✅ Form validation logic
- ✅ TypeScript type definitions
- ✅ Styling with Tailwind
- ✅ Debugging errors
- ✅ Code reviews
- ✅ Performance optimization
- ✅ Test writing

## Resources to Share with ChatGPT

When ChatGPT needs more context, share links to:
- Drizzle ORM docs: https://orm.drizzle.team/
- TanStack Query: https://tanstack.com/query/latest
- shadcn/ui: https://ui.shadcn.com/
- React Hook Form: https://react-hook-form.com/

---

**Pro Tip:** Save your frequent prompts in a file for quick reuse!
