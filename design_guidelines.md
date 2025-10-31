# Navagraha Vedic Astrology Platform - Design Guidelines (Updated)

## Design Approach
**Reference-Based Design** inspired by modern professional astrology apps (Co-Star, Sanctuary, The Pattern) combined with contemporary SaaS aesthetics. The design emphasizes clean professionalism, trust-building, and intuitive spiritual exploration with a light, app-like interface that makes ancient wisdom feel accessible and modern.

**Selected References**:
- Co-Star: Minimal typography-first approach
- Calm/Headspace: Soft, welcoming color usage
- Notion: Clean card-based layouts
- Stripe: Professional trust indicators

---

## Core Design Principles
1. **Modern Minimalism**: Clean interfaces that respect content and user focus
2. **Warm Professionalism**: Approachable yet credible presentation of traditional wisdom
3. **App-Like Clarity**: Mobile-first thinking with excellent readability
4. **Trustworthy Simplicity**: Secure transactions through clear, confident design

---

## Typography System

**Primary Font**: Inter (exceptional readability, professional)
**Accent Font**: Crimson Text or Libre Baskerville (traditional wisdom meets elegance)

**Hierarchy**:
- Hero Headlines: 48-72px, accent font, regular weight
- Section Headings: 32-48px, primary font, semibold
- Subsection Titles: 24-28px, primary font, semibold
- Card Titles: 18-20px, primary font, semibold
- Body Text: 16px, primary font, regular (line-height: 1.6)
- Supporting Text: 14px, primary font, regular
- Labels/Meta: 12-13px, primary font, medium, uppercase letter-spacing

---

## Layout & Spacing System

**Spacing Units**: Tailwind primitives of 3, 4, 6, 8, 12, 16, 20, 24

**Container Strategy**:
- Main content: max-w-7xl
- Content sections: max-w-6xl
- Forms/focused content: max-w-3xl
- Text-heavy sections: max-w-4xl

**Section Padding**:
- Desktop: py-20 to py-32
- Tablet: py-16 to py-20
- Mobile: py-12 to py-16
- Card padding: p-6 (mobile), p-8 (desktop)
- Card internal spacing: gap-6 to gap-8

---

## Component Library

### Navigation
**Header** (sticky, white background, subtle shadow on scroll):
- Logo left: Minimalist "Navagraha" wordmark with small symbolic accent
- Center nav: Home | Kundli | Astrologers | Learn (clean text links)
- Right section: Wallet chip (₹1,234 with subtle background), notification icon, user avatar (32px circle)
- Mobile: Hamburger → full-screen overlay menu with large link text
- Border bottom: 1px subtle divider

### Hero Sections

**Home Hero** (80vh):
- High-quality lifestyle image: Person meditating/peaceful setting with warm natural lighting
- Gradient overlay: Soft gold-to-transparent fade for text readability
- Content positioned left or center-left (max-w-2xl)
- Headline: Large accent font, 2-line maximum
- Supporting text: 18px, soft readable length (max-w-xl)
- CTA group: "Generate Free Kundli" (primary button, blurred background) + "Explore Astrologers" (text link with arrow)
- Trust indicators below: "50,000+ Kundlis Generated" • "500+ Certified Astrologers" (small text, subtle)

**Section Heroes** (40-50vh for dedicated pages):
- Kundli page: Person with birth chart imagery
- Astrologers: Warm consultation scene
- All with centered or left-aligned content over image

### Cards & Containers

**Primary Card Style**:
- White background with subtle shadow (0 2px 8px rgba(0,0,0,0.04))
- Border: 1px solid very light neutral
- Border radius: 12px
- Hover: Lift with enhanced shadow (0 8px 16px rgba(0,0,0,0.08))
- No gradients or heavy effects

**Kundli Report Card**:
- Large format card with organized sections
- Header: Name (24px semibold) + birth details row (14px, lighter weight)
- Chart container: Centered North Indian kundli (traditional design, clean lines)
- Tab navigation: Horizontal tabs with active state (underline accent, no background)
- Content sections: Icon + heading + organized data in clean typography
- Insights sections: Left-aligned text blocks with generous line-height
- Action footer: "Download PDF" + "Share" buttons

**Astrologer Profile Cards** (grid: 3 cols desktop, 2 tablet, 1 mobile):
- Profile photo: 96px circular, centered
- Name: 18px semibold, centered
- Specialization tags: Pill chips (soft background, 12px text)
- Rating: Large stars (16px) + "4.8 (234 reviews)" below
- Stats row: "1,200 consultations" • "5 years experience"
- Pricing: "₹25/min" (20px semibold)
- Status: "Available Now" (green dot + text) or "Busy" (subtle)
- Action buttons: "Chat Now" (primary full-width) + "Call" (secondary full-width)
- Spacing: Generous internal padding (p-6), clear hierarchy

### Forms

**Kundli Generation Form** (multi-step wizard):
- Progress dots: 3-step indicator (filled/hollow circles, connected lines)
- Large input fields: 56px height, clear labels above
- Date picker: Calendar overlay with today highlight
- Time picker: Dropdown with AM/PM
- Location: Google Places autocomplete with map preview below
- Validation: Inline messages (not aggressive, helpful tone)
- Submit button: Extra large (h-14), full-width on mobile
- "Save as Draft" link below for returning users

**Authentication Forms** (centered, max-w-md):
- Card container on light background
- Social buttons top: "Continue with Google" (outlined, logo left)
- Divider: "or continue with email"
- Input fields: Ample height (h-12), clear focus states
- Primary CTA: Full width
- Guest mode: "Continue as Guest" text link, prominent
- Footer navigation: "New here? Create account"

### Wallet Interface

**Wallet Section** (dedicated page or profile tab):
- Balance card: Large centered display
  - "Current Balance" label (14px)
  - "₹1,234.50" (48px semibold)
  - "Add Money" button below (primary)
- Quick add grid: 3x2 grid of amount chips (+₹100, +₹500, +₹1000, +₹2000, +₹5000, Custom)
- Transaction history: Clean list with left icon, center description, right amount
- Filter tabs: All | Recharges | Consultations | Refunds
- Each transaction row: 56px height, divider below

### Chat Interface

**Chat Screen**:
- Header bar: Astrologer photo (40px) + name + "Online" status + rate display (₹25/min)
- Messages area: Clean bubbles with timestamp
  - Astrologer: Left-aligned, soft neutral background
  - User: Right-aligned, primary accent tint background
- Input bar: Text field (h-12) + send icon button
- Session timer: Floating chip top-center "15:24 (₹380)"
- End session button: Subtle red text link

### Dashboard Sections

**Daily Horoscope Section**:
- Zodiac selector: Horizontal scrollable row (mobile) or 12-icon grid (desktop)
- Each zodiac: 64px icon, label below, active state with accent tint
- Horoscope card: Large, centered
  - Title: "Today's Prediction for Leo"
  - Content: Readable paragraph (max-w-2xl)
  - Ratings row: Love ★★★★☆ | Career ★★★★★ | Health ★★★☆☆

**Matchmaking Section**:
- Side-by-side forms (desktop) or stacked (mobile)
- "Your Details" + "Partner's Details" labels
- Compatibility result: Circular progress (120px diameter, centered)
  - Score: 78% (large centered text)
- Breakdown grid: 3 columns (Mental | Physical | Emotional) with bar indicators
- Detailed analysis: Expandable sections below

**Featured Astrologers Carousel**:
- Horizontal scroll on all devices
- 4-5 cards visible desktop, 1.5 on mobile
- "View All Astrologers" button right-aligned

---

## Interactions & Animations

**Minimal Animation Strategy**:
- Page transitions: 300ms fade
- Card hover: Subtle lift (translateY -2px), enhanced shadow
- Button states: No blurred backgrounds except on hero images, standard hover/active states
- Form validation: Gentle highlight, no shake
- Loading: Simple spinner or progress bar
- Chart appearance: Fade-in 400ms

**No continuous animations** - static, professional presentation

---

## Responsive Behavior

**Breakpoints**: Mobile <768px | Tablet 768-1024px | Desktop >1024px

**Mobile Adaptations**:
- Single-column layouts
- Full-width cards
- Bottom navigation: Home | Kundli | Chat | Profile icons
- Collapsible wallet balance in header
- Stacked form fields (full-width)
- Simplified chart displays with tap-to-expand

---

## Images & Visual Assets

**Hero Images** (required):
1. **Home Hero**: Peaceful meditation/yoga scene, warm natural lighting, person in serene setting
2. **Kundli Page Hero**: Birth chart imagery with traditional elements in modern style
3. **Astrologers Landing Hero**: Warm consultation scene, professional astrologer with client

**Component Images**:
4. **Astrologer Photos**: Professional headshots (circular, 96px cards, 40px chat)
5. **Zodiac Icons**: 12 symbols (line art style, consistent 48px size)
6. **Kundli Chart Graphics**: North Indian style chart template (clean, readable)

**Decorative Elements**:
7. **Section dividers**: Subtle constellation line art or geometric patterns
8. **Empty states**: Simple illustrations for no transactions, no messages

**Style Guidelines**: All images bright, warm tones, professional quality, no dark/mystical treatments

---

## Trust & Credibility Elements

- Certification badges on astrologer profiles (small, subtle)
- Verified checkmarks (16px icon next to verified astrologers)
- Review snippets: Clean quote cards with 5-star ratings
- Security indicators: Small lock icon + "Secure Payment" near wallet
- Social proof: Numeric counters in subtle containers
- Testimonial section: 3-column grid with user photos, quotes, names

---

## Accessibility Standards

- Focus indicators: 2px accent outline with 2px offset
- Form labels: Always visible above inputs (never placeholder-only)
- Contrast ratios: WCAG AA minimum for all text
- Keyboard navigation: Logical tab order through all interactive elements
- Error messages: Aria-live regions, clear association with fields
- Alt text: Descriptive for astrologer photos, decorative images marked appropriately