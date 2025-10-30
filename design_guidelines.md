# Navagraha Vedic Astrology Platform - Design Guidelines

## Design Approach
**Reference-Based Design** inspired by premium astrology platforms (AstroKarma, Co-Star, Astrotalk) combined with modern SaaS aesthetics. The design emphasizes mystical elegance, trust-building, and intuitive spiritual exploration while maintaining professional functionality for service booking and transactions.

## Core Design Principles
1. **Cosmic Elegance**: Premium spiritual experience with sophisticated visual treatment
2. **Trust & Authenticity**: Professional presentation of ancient wisdom with modern credibility
3. **Intuitive Mysticism**: Complex astrological data made accessible and beautiful
4. **Seamless Transactions**: Financial interactions feel secure and effortless

---

## Typography System

**Primary Font**: Inter or DM Sans (clean, modern readability)
**Accent Font**: Cinzel or Playfair Display (mystical headings, premium touch)

**Hierarchy**:
- Hero Headlines: 48-64px, accent font, medium weight
- Section Headings: 32-40px, primary font, semibold
- Card Titles: 20-24px, primary font, semibold
- Body Text: 16px, primary font, regular (18px for important content)
- Captions: 14px, primary font, regular
- Small Text: 12px, primary font, medium (for labels, metadata)

---

## Layout & Spacing System

**Spacing Units**: Tailwind primitives of 2, 4, 6, 8, 12, 16, 20, 24 (as in p-2, m-4, gap-6, py-8, etc.)

**Container Strategy**:
- Maximum width: max-w-7xl for main content areas
- Card content: max-w-6xl
- Reading content: max-w-4xl
- Form sections: max-w-2xl centered

**Section Padding**:
- Desktop: py-16 to py-24
- Mobile: py-8 to py-12
- Card padding: p-6 to p-8

---

## Component Library

### Navigation
**Header**: Fixed top navigation with glassmorphism effect
- Logo left (mystical symbol + "Navagraha" wordmark)
- Center navigation: Home, Kundli, Astrologers, Learn
- Right section: Wallet balance chip (shows current balance), notification bell, user avatar
- Mobile: Hamburger menu with slide-in drawer
- Subtle glow effect on scroll

### Hero/Welcome Section
**Splash Screen**: 
- Full viewport centered cosmic animation (subtle particle field or constellation movement)
- Large mystical logo with soft glow
- Tagline: "Discover Your Cosmic Blueprint" (accent font)
- Single prominent CTA button with blur background
- Fade-in entrance animation (800ms)

**Home Hero**: 
- 70vh height with layered cosmic background
- Main headline + supporting text (left-aligned or centered)
- Dual CTA buttons: "Generate Kundli" (primary) + "Talk to Astrologer" (secondary)
- Floating trust indicators: "10,000+ Kundlis Generated" • "500+ Expert Astrologers"
- Background: Deep cosmic imagery with gradient overlay

### Cards & Containers

**Glassmorphism Cards**: Primary UI pattern
- Backdrop blur effect with semi-transparent background
- Subtle border with soft glow
- Rounded corners: 16-20px
- Shadow: Soft, elevated appearance
- Hover: Slight scale (1.02) with enhanced glow

**Kundli Report Cards**:
- Large card format (full-width or 2-column grid)
- Header section: User name, birth details, generation timestamp
- Chart display area: North Indian style kundli chart (centered, prominent)
- Tabbed interface: Overview, Dashas, Doshas, Divisional Charts, Remedies
- Each tab content in organized sections with icon headers

**Astrologer Profile Cards**:
- Grid layout: 3 columns desktop, 2 tablet, 1 mobile
- Card structure: Profile photo (circular, 80px), name, specialization tags, rating stars (gold), experience badge
- Stats row: "1,234 consultations" • "4.8★ rating"
- Pricing: Large prominent price "₹25/min" with availability status (green dot + "Available" or "Busy")
- Two action buttons: "Chat Now" (primary) + "Call Now" (outlined)
- Hover: Lift effect with enhanced glow

### Forms

**Kundli Generation Form**:
- Multi-step wizard: Personal Details → Birth Details → Location
- Progress indicator at top (step circles connected by lines)
- Large input fields with icon prefixes
- Date picker: Custom calendar with Vedic calendar highlights
- Time picker: Circular clock interface
- Location: Autocomplete with map preview
- "Generate Kundli" button: Extra large, with loading state animation

**Authentication Forms**:
- Centered card on cosmic background
- Social login buttons at top: "Continue with Google" (with logo)
- Divider: "or" with horizontal lines
- Email/password fields with validation icons
- "Remember me" checkbox
- "Guest Mode" link prominently displayed
- Footer: "New here? Sign up" link

### Wallet Interface

**Wallet Card**: Prominent display on profile/dedicated page
- Large balance display: "₹1,234.50" with currency symbol
- "Add Money" button (primary, prominent)
- Quick add chips: "+₹100" "+₹500" "+₹1000" (pill buttons)
- Transaction history list: Icon, description, amount, timestamp
- Filter tabs: All, Recharge, Consultations, Refunds

### Chat Interface

**Chat Screen**:
- Fixed header: Astrologer info (photo, name, status dot, "Active now")
- Message area: Alternating message bubbles (user right, astrologer left)
- Astrologer messages: Glass bubble with avatar
- User messages: Solid colored bubbles aligned right
- Input bar: Text field with send button, "₹25/min" rate display
- Timer at top: "Session: 5:32" with running cost

### Dashboard Sections

**Daily Horoscope Section**:
- Zodiac sign selector: 12 zodiac symbols in circular arrangement
- Selected sign: Enlarged with glow effect
- Horoscope card: Today's prediction with star rating for Love, Career, Health
- "Read Full Prediction" link

**Matchmaking Section**:
- Dual form inputs: "Your Details" + "Partner's Details" side by side
- Compatibility score display: Large circular progress (0-100%)
- Breakdown bars: Mental, Physical, Emotional compatibility
- Detailed analysis in expandable sections

**Recommended Astrologers**:
- Horizontal scrollable carousel on mobile
- Grid on desktop (3-4 columns)
- "See All Astrologers" link with arrow

---

## Interactions & Micro-animations

**Minimal Animation Strategy** (only where enhancing UX):
- Page transitions: Smooth fade (300ms)
- Card hover: Subtle lift + glow enhancement
- Button click: Quick scale-down bounce
- Form validation: Shake animation on error
- Loading states: Cosmic spinner or pulsing stars
- Chart generation: Fade-in with stagger effect for elements

**No continuous animations** except:
- Gentle cosmic particle drift in hero backgrounds
- Pulsing glow on availability indicators

---

## Responsive Behavior

**Breakpoints**:
- Mobile: < 768px (single column, stacked cards, full-width forms)
- Tablet: 768-1024px (2-column grids, condensed spacing)
- Desktop: > 1024px (full multi-column layouts, expanded spacing)

**Mobile Optimizations**:
- Bottom navigation bar for primary actions
- Collapsible wallet balance in header
- Swipeable chart tabs
- Simplified kundli charts (tap to zoom)
- Sticky CTAs for astrologer profiles

---

## Images & Visual Assets

**Required Images**:

1. **Hero Background**: Cosmic nebula or starfield (deep blue/purple hues, high resolution)
   - Placement: Full-width hero section with gradient overlay
   - Style: Mystical, premium, not overly bright

2. **Kundli Chart Graphics**: North Indian style chart template
   - Placement: Central element in kundli report cards
   - Style: Clean lines, readable text, traditional design with modern rendering

3. **Astrologer Photos**: Professional headshots
   - Placement: Profile cards, chat headers
   - Style: Circular crops, consistent sizing (80px cards, 48px chat)

4. **Zodiac Icons**: 12 zodiac symbols
   - Placement: Horoscope selector, user profiles
   - Style: Golden line art, consistent stroke weight

5. **Cosmic Accents**: Stars, constellations, celestial symbols
   - Placement: Section dividers, background decorative elements
   - Style: Subtle, non-distracting, enhancing mystical atmosphere

**No Hero Image Needed For**: Login, wallet, chat, profile screens (use cosmic backgrounds instead)

---

## Trust & Credibility Elements

- Astrologer certifications badges on profiles
- "Verified" checkmarks for authenticated astrologers
- Review excerpts with star ratings
- Security badges near wallet/payment areas
- "Safe & Secure" text with lock icon for transactions
- Social proof counters throughout ("Join 50,000+ users")

---

## Accessibility Considerations

- Consistent focus indicators (glowing outline matching cosmic theme)
- Form labels always visible (not placeholder-only)
- Sufficient contrast ratios for all text on cosmic backgrounds
- Keyboard navigation for all interactive elements
- Screen reader text for decorative cosmic elements
- Error messages clearly associated with form fields