# DESIGN_SYSTEM.md

## 1. Purpose

This document defines the visual, interaction, and experience standards for the bakery e-commerce platform.

The product should combine:

* The warmth, appetite appeal, and celebratory feel of a premium bakery.
* The simplicity, polish, confidence, and usability associated with Apple-style digital experiences.
* Established principles of visual hierarchy, accessibility, cognitive psychology, responsive design, and interaction design.
* A strong mobile-first experience suitable for customers arriving from Instagram, WhatsApp, search engines, and direct referrals.

The result should feel:

**Premium, warm, elegant, appetizing, modern, simple, responsive, and deliberate.**

The interface must never feel generic, overdesigned, cluttered, childish, or template-driven.

---

# 2. Core Design Philosophy

Every interface decision must answer four questions:

1. Is it obvious?
2. Is it useful?
3. Is it beautiful without becoming distracting?
4. Does it make completing the customer's task easier?

The system should follow this principle:

> Complexity belongs in the system, not in the customer's experience.

The website may have advanced functionality internally, but the customer should experience simplicity.

A customer should be able to:

* understand what the business sells within seconds;
* find a product quickly;
* understand the price;
* customize where necessary;
* add to cart;
* select delivery;
* pay;
* understand what happens next.

No unnecessary decision should be placed in front of the user.

---

# 3. Brand Experience

The brand should visually communicate:

* celebration;
* freshness;
* craftsmanship;
* quality;
* trust;
* indulgence;
* warmth;
* sophistication.

The interface should make users feel they are buying from an established premium bakery rather than a small informal seller.

At the same time, it must retain personality.

Avoid making the website excessively corporate or sterile.

The balance is:

```text
Bakery Warmth
+
Apple-Level Simplicity
+
Premium Commerce
```

---

# 4. Design Principles

## 4.1 Simplicity

Remove anything that does not help the customer:

* understand;
* decide;
* navigate;
* purchase;
* trust the business.

Prefer fewer stronger elements over many weak elements.

Do not overload interfaces with unnecessary:

* borders;
* labels;
* cards;
* shadows;
* icons;
* buttons;
* decorations.

---

## 4.2 Content First

Products are the primary visual material.

Cake photography, pastry imagery, ingredients, texture, and presentation should carry much of the visual personality.

The UI should support the products rather than compete with them.

When strong photography is available, reduce decorative UI around it.

---

## 4.3 Progressive Disclosure

Do not present every option simultaneously.

For complex flows such as custom cake ordering, reveal information step-by-step.

Example:

```text
Occasion
↓
Cake Size
↓
Flavour
↓
Design
↓
Personalization
↓
Delivery Date
↓
Review
```

This reduces cognitive load.

---

## 4.4 Clear Hierarchy

Each screen should have one dominant action.

Example:

Product page:

```text
Product Name
Price
Description
Options
[ Add to Cart ]
```

Secondary functionality should visually remain secondary.

Do not allow five buttons to compete for attention.

---

## 4.5 Familiarity Over Cleverness

Use patterns people already understand.

Examples:

* cart icon in the header;
* logo links home;
* product cards open product pages;
* back arrows behave consistently;
* search behaves like search;
* checkout follows expected e-commerce conventions.

Novelty should come from presentation and polish, not confusing navigation.

---

# 5. Visual Direction

The overall interface should feel spacious and premium.

Visual inspiration should combine:

### Premium Bakery

* rich product imagery;
* soft warmth;
* cream backgrounds;
* chocolate and pastry tones;
* celebratory photography;
* subtle decorative accents;
* appetizing visual composition.

### Apple-Inspired UX

* large typography;
* substantial whitespace;
* restrained colour usage;
* large product imagery;
* minimal chrome;
* clean layouts;
* subtle motion;
* strong alignment;
* precise spacing;
* clear interaction states.

---

# 6. Colour System

The colour system should be brand-driven, but restrained.

The website should primarily use neutral surfaces while allowing bakery imagery to provide visual richness.

## Primary Surfaces

Recommended base direction:

```text
Background:
Warm Ivory / Soft Cream

Cards:
White / Light Cream

Text:
Near Black / Dark Chocolate

Muted Text:
Warm Grey

Borders:
Very Light Warm Grey
```

Avoid pure black against pure white across large surfaces where possible.

Prefer softer contrast.

Example:

```text
Background: #FAF8F5
Surface:    #FFFFFF
Text:       #1D1D1F
Muted:      #6E6E73
Border:     #E8E5E1
```

Exact brand colours may change based on the client's identity.

---

# 7. Brand Accent Colour

Use one dominant brand accent.

Potential bakery-appropriate directions include:

* warm cocoa;
* burgundy;
* blush;
* muted rose;
* deep berry;
* champagne gold;
* caramel.

The accent colour should be used primarily for:

* primary CTA;
* active states;
* important highlights;
* selected options;
* promotional accents.

Do not paint entire interfaces with the brand colour.

The design should allow the brand colour to feel special.

---

# 8. Colour Usage Rule

Recommended visual ratio:

```text
70% neutral
20% product photography / supporting colour
10% brand accent
```

This prevents visual saturation.

---

# 9. Typography

Typography should feel refined, contemporary, and highly readable.

Use a strong sans-serif as the main interface font.

Recommended direction:

```text
Inter
Manrope
Geist
SF-style system typography
```

A secondary elegant display serif may optionally be used for editorial headings.

Examples:

```text
Playfair Display
Cormorant Garamond
DM Serif Display
```

Use the serif sparingly.

Never use decorative typography for:

* prices;
* buttons;
* navigation;
* forms;
* checkout;
* admin interfaces.

---

# 10. Type Scale

Desktop example:

```text
Display XL      64–72px
Display         48–56px
H1              40–48px
H2              32–40px
H3              24–30px
Title           20–24px
Body Large      18px
Body            16px
Small           14px
Caption         12–13px
```

Mobile:

```text
Display         40–48px
H1              32–38px
H2              28–32px
H3              22–26px
Body Large      17–18px
Body            16px
Small           14px
```

Avoid excessively tiny text.

---

# 11. Typography Rules

Use:

* short headings;
* restrained line lengths;
* sentence case;
* clear pricing;
* sufficient line height.

Ideal body text width:

```text
55–75 characters
```

Avoid:

```text
WELCOME TO OUR AMAZING PREMIUM CAKE WEBSITE
```

Prefer:

```text
Made for your sweetest moments.
```

---

# 12. Spacing System

Use an 8-point spacing system.

Primary spacing values:

```text
4px
8px
12px
16px
24px
32px
48px
64px
80px
96px
120px
```

Avoid random values like:

```text
19px
37px
53px
```

unless mathematically required.

Consistency creates perceived quality.

---

# 13. Whitespace

Whitespace is a design element.

Do not attempt to fill every blank area.

Large desktop sections may use:

```text
80–120px vertical padding
```

Mobile:

```text
48–72px
```

Important products and CTAs should have visual breathing room.

---

# 14. Layout

Use a consistent maximum content width.

Recommended:

```text
max-width: 1280–1440px
```

General structure:

```text
Full Width Background
    ↓
Centered Content Container
    ↓
Responsive Grid
```

Desktop pages should not stretch text edge-to-edge.

---

# 15. Grid System

Desktop:

```text
12 columns
```

Tablet:

```text
8 columns
```

Mobile:

```text
4 columns
```

Use responsive CSS grids rather than fixed-width layouts.

---

# 16. Product Grid

Recommended behaviour:

Desktop:

```text
3–4 products per row
```

Tablet:

```text
2–3
```

Mobile:

```text
2 products
```

For premium editorial sections, occasionally use larger asymmetric layouts.

Example:

```text
Large Featured Cake
        |
Small Product | Small Product
```

Avoid using the exact same grid repeatedly throughout the homepage.

---

# 17. Product Cards

Product cards should remain visually lightweight.

Primary information:

```text
Image
Product Name
Price
Optional Rating / Category
```

Do not overload cards with:

* long descriptions;
* SKU;
* inventory information;
* multiple large buttons;
* excessive badges.

Card interactions should include subtle hover feedback on desktop.

Possible effect:

```text
Image scale: 1.00 → 1.03
```

Duration:

```text
200–350ms
```

No aggressive zoom.

---

# 18. Product Photography

Images are one of the most important components of the design.

Prefer:

* natural light;
* clear product focus;
* consistent colour treatment;
* clean backgrounds;
* close-up detail shots;
* lifestyle images where useful.

Recommended image ratios:

```text
Product Grid:
1:1
or
4:5

Hero:
16:9
or
3:2
```

Images should use consistent cropping.

---

# 19. Image Behaviour

Images should:

* load responsively;
* use optimized formats;
* lazy-load where appropriate;
* provide loading placeholders;
* avoid layout shifts.

Product imagery must never visibly jump while loading.

---

# 20. Buttons

Buttons should feel substantial but simple.

Primary CTA:

```text
Solid brand accent
High contrast text
Rounded corners
Medium/large height
```

Recommended:

```text
Height: 48–56px
Radius: 12–16px
```

Secondary buttons:

```text
Neutral surface
Subtle border
Dark text
```

Tertiary actions:

```text
Text button
or
icon + label
```

---

# 21. Button Rules

Avoid excessive button varieties.

Primary button examples:

```text
Add to Cart
Continue to Checkout
Build Your Cake
Pay Now
```

Secondary examples:

```text
View Details
Continue Shopping
Save for Later
```

Destructive actions should never resemble primary purchase CTAs.

---

# 22. Touch Targets

All interactive controls should meet a minimum practical target of:

```text
44 × 44px
```

Prefer:

```text
48 × 48px
```

on mobile.

This follows Fitts's Law and improves usability.

---

# 23. Forms

Forms must be simple, forgiving, and clear.

Every field should have:

* visible label;
* sensible placeholder;
* validation;
* clear error state;
* clear success state.

Avoid relying on placeholder text as the only label.

---

# 24. Form Layout

Prefer single-column forms.

Example:

```text
Full Name
Email Address
Phone Number
Delivery Address
Delivery Area
Delivery Date
```

Do not place multiple fields beside one another unless they are tightly related.

Examples:

```text
First Name | Last Name
```

or:

```text
Expiry | CVV
```

---

# 25. Input Style

Recommended:

```text
Height: 48–56px
Radius: 10–14px
Border: subtle
Background: white
```

Focus state must be obvious.

Do not remove focus indicators.

---

# 26. Navigation

The main navigation must stay simple.

Suggested desktop:

```text
Logo

Shop
Custom Cakes
Ready to Bake
About
Contact

Search
Account
Cart
```

Avoid overloading the header.

---

# 27. Sticky Header

The navigation may become sticky after scrolling.

On scroll:

```text
Slight blur
Reduced height
Subtle border/shadow
```

The effect should be restrained.

---

# 28. Mobile Navigation

Mobile navigation should prioritise:

```text
Home
Shop
Custom Cakes
Cart
Account/Menu
```

A bottom navigation may be considered if it materially improves frequent actions.

Do not duplicate too many navigation systems.

---

# 29. Hero Sections

Hero sections should be visually strong but simple.

Preferred composition:

```text
Headline
Short supporting sentence
Primary CTA
Optional secondary CTA
Large product imagery
```

Example tone:

```text
Made for life's sweetest moments.

Handcrafted cakes, pastries and ready-to-bake favourites made with care.

[Shop Now]
[Build Your Cake]
```

Avoid oversized blocks of marketing copy.

---

# 30. Homepage Rhythm

Suggested structure:

```text
Navigation

Hero

Shop by Category

Featured / Best Sellers

Custom Cake Feature

Editorial Image Section

Ready-to-Bake Feature

Testimonials

Instagram / Gallery

Newsletter

Footer
```

Sections should alternate visually to maintain rhythm.

For example:

```text
Light
White
Photography
Light
Accent
White
```

---

# 31. Category Presentation

The three major product categories should be immediately understandable.

```text
Custom Cakes
Fresh Pastries
Ready to Bake
```

Each should have:

* strong image;
* short description;
* clear CTA.

Do not hide these categories inside navigation alone.

---

# 32. Custom Cake Builder Design

The cake builder should feel guided rather than technical.

Use:

```text
Progress indicator
Large visual selections
Short labels
Immediate feedback
Persistent summary
```

Example:

```text
1. Occasion
2. Size
3. Flavour
4. Design
5. Message
6. Delivery
7. Review
```

The customer should always understand:

* where they are;
* what remains;
* current estimated price.

---

# 33. Product Detail Pages

Page hierarchy:

```text
Image Gallery
Product Name
Price
Short Description
Options
Quantity
Add to Cart
Delivery Information

Detailed Description
Ingredients
Allergens
Storage / Preparation
Reviews
Related Products
```

The purchase area should remain immediately visible.

---

# 34. Cart Design

The cart should clearly show:

```text
Product
Variant
Quantity
Price
Remove
Subtotal
Delivery estimate
Checkout CTA
```

Avoid unnecessary distractions inside the cart.

The checkout button is the dominant action.

---

# 35. Checkout

Checkout should be visually calmer than the storefront.

Reduce:

* navigation choices;
* promotional banners;
* decorative imagery.

The checkout experience should communicate:

```text
Security
Progress
Clarity
Trust
```

Suggested flow:

```text
Information
↓
Delivery
↓
Payment
↓
Confirmation
```

---

# 36. Checkout Progress

Use a simple indicator:

```text
Information → Delivery → Payment
```

The customer should never wonder how much remains.

---

# 37. Order Confirmation

The success page should provide emotional closure.

Not merely:

```text
Order Successful.
```

Instead:

```text
Your order is confirmed 🎂

Order #NC1024

We've received your payment and will begin preparing your order.
```

Provide:

* order summary;
* delivery/pickup details;
* expected next step;
* support contact.

---

# 38. Motion Design

Animation should increase perceived quality and understanding.

It should never exist simply because animation is possible.

Use motion for:

* page entry;
* image reveals;
* cart feedback;
* selection changes;
* loading;
* modals;
* menus;
* step transitions.

---

# 39. Animation Timing

Microinteraction:

```text
150–250ms
```

Standard transition:

```text
250–400ms
```

Large entrance animation:

```text
400–700ms
```

Avoid slow animations that delay interaction.

---

# 40. Animation Style

Prefer:

```text
Opacity
Translate
Scale
Blur reduction
```

Avoid:

```text
Spinning elements
Bouncing everything
Large rotation
Excessive parallax
Constant movement
```

Movement should feel smooth and natural.

---

# 41. Reduced Motion

Respect:

```css
prefers-reduced-motion
```

Essential functionality must never depend on animations.

---

# 42. Hover States

Desktop interactive components should visibly respond.

Examples:

```text
Button:
slight elevation

Product image:
subtle scale

Navigation:
colour / underline transition

Card:
small surface change
```

Never hide important functionality behind hover alone.

---

# 43. Loading States

Every asynchronous interaction needs feedback.

Examples:

```text
Add to Cart
Submitting Order
Applying Coupon
Loading Products
Processing Payment
Uploading Image
Saving Admin Changes
```

Use:

* skeletons;
* inline spinners;
* disabled button states;
* optimistic feedback where safe.

Never leave the user wondering whether their click worked.

---

# 44. Skeleton Loading

Product grids should use skeleton layouts matching the final content.

Avoid generic centered spinning loaders for entire pages where possible.

---

# 45. Empty States

Every empty state should explain what happened and what can be done next.

Example:

```text
Your cart is empty.

Something sweet is waiting.

[Browse Products]
```

---

# 46. Error States

Errors must use plain language.

Avoid:

```text
Error 500
Mutation failed
Invalid object
```

Prefer:

```text
We couldn't add this item to your cart.
Please try again.
```

Provide recovery where possible.

---

# 47. Feedback

Actions should produce immediate feedback.

Examples:

```text
Added to cart ✓
Coupon applied ✓
Address saved ✓
Order confirmed ✓
```

Avoid requiring customers to infer whether something succeeded.

---

# 48. Accessibility

Accessibility is part of design quality.

The interface must include:

* sufficient colour contrast;
* keyboard navigation;
* semantic HTML;
* focus states;
* image alt text;
* form labels;
* accessible dialogs;
* meaningful button text.

Do not rely solely on colour to communicate states.

---

# 49. Cognitive Load

Apply Miller's Law conservatively.

Users should not be expected to process excessive choices simultaneously.

Where many options exist:

* group them;
* filter them;
* collapse them;
* paginate them;
* reveal progressively.

---

# 50. Hick's Law

More choices increase decision time.

For important actions, simplify.

Bad:

```text
Buy
Order
Purchase
Shop Now
Quick Buy
Instant Buy
Checkout
```

Good:

```text
Add to Cart
```

Then:

```text
Checkout
```

---

# 51. Fitts's Law

Important buttons should:

* be large;
* be easy to reach;
* appear close to where decisions happen.

On mobile, place critical purchase actions within comfortable thumb reach where practical.

---

# 52. Gestalt Principles

Use visual grouping intentionally.

Items close together should relate.

For example:

```text
Product Name
Price
Variant
Add to Cart
```

should visually form one purchasing group.

Do not use random boxes to communicate relationships.

---

# 53. Consistency

If a component behaves a certain way once, it should behave the same way everywhere.

Examples:

* all primary buttons;
* all dropdowns;
* all product cards;
* all confirmation dialogs;
* all breadcrumbs;
* all loading states.

Consistency reduces learning effort.

---

# 54. Responsive Design

Design mobile-first.

Breakpoints should be based on layout needs rather than devices alone.

Typical reference:

```text
Mobile:       < 640px
Tablet:       640–1024px
Desktop:      1024–1440px
Large:        > 1440px
```

Never simply shrink desktop layouts.

Recompose them.

---

# 55. Mobile Product Pages

On mobile:

```text
Image Gallery
Product Info
Options
Quantity
Sticky Add to Cart
```

The primary CTA may become sticky near the bottom when appropriate.

---

# 56. Mobile Custom Cake Builder

Use one major decision per screen or section.

Avoid huge multi-column forms.

The persistent footer may display:

```text
₦45,000
[Continue]
```

---

# 57. Admin Design

The admin interface should follow the same quality principles but remain operational.

Do not make the admin panel unnecessarily decorative.

Priority:

```text
Speed
Clarity
Information density
Search
Filtering
Bulk operations
Feedback
```

Use a sidebar navigation for desktop.

---

# 58. Admin Sidebar

Suggested:

```text
Dashboard

Orders
Custom Cakes
Products
Inventory
Customers
Coupons
Reviews

Content
Delivery
Analytics

Settings
```

The current section should always be obvious.

---

# 59. Admin Dashboard

The dashboard should prioritise actionable information.

Examples:

```text
Today's Orders
Pending Orders
Revenue
Low Stock
Upcoming Cake Deliveries
Custom Cake Requests
```

Avoid filling the dashboard with charts that do not support decisions.

---

# 60. Cards

Cards should not be the default container for everything.

Only use cards where content benefits from clear grouping or interaction.

Too many cards create visual fragmentation.

Use whitespace and typography before adding borders.

---

# 61. Borders

Use borders lightly.

Recommended:

```text
1px
low contrast
warm neutral
```

Avoid thick dark borders throughout the interface.

---

# 62. Shadows

Shadows should be subtle.

Use them mainly for:

* floating navigation;
* menus;
* modals;
* raised CTA elements.

Avoid strong shadows around every card.

---

# 63. Border Radius

Use a consistent radius scale.

Example:

```text
Small:   8px
Medium:  12px
Large:   16px
XL:      24px
Pill:    999px
```

Images may use larger radii than inputs.

---

# 64. Icons

Use one icon family consistently.

Recommended:

```text
Lucide
```

Icons must support labels rather than replace clear text where ambiguity exists.

Avoid mixing:

```text
Lucide
FontAwesome
random SVGs
emoji
```

within the same interface.

---

# 65. Badges

Use badges sparingly.

Examples:

```text
Best Seller
New
Sold Out
Low Stock
20% Off
```

Too many badges reduce their meaning.

---

# 66. Promotions

Promotional sections should feel integrated rather than intrusive.

Avoid:

* excessive popups;
* flashing banners;
* countdown timers everywhere;
* fake urgency.

Use genuine urgency only when relevant.

---

# 67. Trust Signals

Throughout checkout and purchase flows, surface meaningful reassurance.

Examples:

```text
Secure checkout
Freshly prepared
Delivery information
Customer reviews
Clear policies
Business contact information
```

Do not use fake trust badges.

---

# 68. Reviews

Reviews should feel natural and credible.

Display:

```text
Customer name
Rating
Review
Optional image
Date
```

Avoid cluttering every homepage section with reviews.

---

# 69. Microcopy

Copy should feel human, concise, warm, and confident.

Avoid robotic language.

Instead of:

```text
The item has successfully been added to your shopping cart.
```

Use:

```text
Added to your cart.
```

Instead of:

```text
Please select desired delivery method.
```

Use:

```text
How would you like to receive your order?
```

---

# 70. Voice

Brand communication should feel:

```text
Warm
Celebratory
Friendly
Premium
Clear
Confident
```

Avoid:

```text
Overly corporate
Childish
Excessively playful
Slang-heavy
Overly formal
```

---

# 71. Homepage Animation

Animations may include:

* soft hero fade;
* image reveal;
* category cards appearing as they enter the viewport;
* subtle parallax on selected editorial imagery;
* smooth section transitions.

Do not animate every element simultaneously.

---

# 72. Apple-Inspired Interaction Standard

Every interaction should feel immediate.

The system should aim for:

```text
Tap
↓
Immediate visual response
↓
Processing
↓
Clear completion
```

Never:

```text
Tap
↓
Nothing
↓
Nothing
↓
Suddenly new page
```

---

# 73. Perceived Performance

Where actual processing takes time, provide perceived responsiveness.

Use:

```text
optimistic updates
skeletons
instant button states
progress indicators
preloading
prefetching
```

The website should feel fast even when network conditions are imperfect.

---

# 74. Performance Standards

Target:

```text
LCP < 2.5 seconds

INP < 200ms

CLS < 0.1
```

Avoid:

* unnecessarily heavy video;
* oversized PNG images;
* excessive JavaScript;
* large animation libraries for simple effects.

---

# 75. Modal Behaviour

Use modals only for focused temporary actions.

Examples:

```text
Quick product preview
Confirm destructive action
Delivery information
Login
```

Do not put entire complex pages inside modals.

---

# 76. Search

Search should be prominent enough to discover but not dominate the homepage.

Search should support:

```text
Product name
Category
Flavour
Keywords
```

Results should appear quickly with useful empty states.

---

# 77. Filters

Filters should be task-oriented.

Possible:

```text
Category
Price
Availability
Flavour
Occasion
```

Desktop:

```text
Sidebar / horizontal filter bar
```

Mobile:

```text
Filter drawer
```

---

# 78. Breadcrumbs

Use breadcrumbs on deeper pages.

Example:

```text
Home / Cakes / Birthday Cakes / Red Velvet Celebration Cake
```

This improves navigation and SEO.

---

# 79. Footer

Footer should include:

```text
Logo
Short brand description

Shop
Custom Cakes
Ready to Bake

About
Contact
FAQ
Delivery Information

Privacy
Terms
Refund Policy

Social Media
Newsletter
Contact Details
```

Keep hierarchy clear.

---

# 80. No Dead Ends

Every screen should provide a useful next action.

Examples:

Empty search:

```text
Browse Best Sellers
```

404:

```text
Return Home
Browse Cakes
```

Completed order:

```text
Track Order
Continue Shopping
```

---

# 81. No Half-Finished Features

Any visible feature must be complete.

If a feature is exposed in the UI, all necessary states must exist.

For example, adding coupons requires:

```text
Coupon creation
Validation
Expiry
Usage limits
Checkout calculation
Error messages
Admin visibility
Order record
```

A feature is not complete simply because a button exists.

---

# 82. Component Reuse

Build reusable primitives.

Examples:

```text
Button
Input
Select
Modal
Drawer
ProductCard
ProductGrid
Price
Badge
QuantitySelector
ImageGallery
Toast
EmptyState
LoadingSkeleton
OrderStatus
```

Avoid recreating slightly different versions unnecessarily.

---

# 83. Design Tokens

Design values should be centrally controlled.

Example:

```text
Colors
Typography
Spacing
Radius
Shadows
Transitions
Breakpoints
```

Do not scatter hardcoded styling constants throughout the codebase.

---

# 84. Dark Mode

Dark mode is not a priority unless explicitly requested.

The product photography and bakery brand should primarily be optimized for a premium light experience.

If implemented later, it must be intentionally designed rather than automatically inverted.

---

# 85. Design Quality Checklist

Before marking any page complete, verify:

```text
Does the page have one clear primary goal?

Is the hierarchy obvious?

Is spacing consistent?

Does it work on mobile?

Does it work with keyboard navigation?

Are loading states present?

Are empty states present?

Are error states present?

Are interactions responsive?

Is text readable?

Are images optimized?

Are CTAs obvious?

Is anything visually unnecessary?

Does it feel premium?

Does it feel like the same product as every other page?
```

---

# 86. Final Experience Standard

The final website should never feel like:

```text
A generic e-commerce template
+
bakery images
```

It should feel like the digital extension of the bakery itself.

The customer should experience:

```text
Beautiful product discovery
↓
Simple decision making
↓
Pleasant customization
↓
Effortless checkout
↓
Clear order confirmation
↓
Confidence in the business
```

The interface should communicate quality before the customer even tastes the product.

---

# 87. Golden Rule

Whenever there is a conflict between:

```text
More decoration
```

and:

```text
More clarity
```

choose clarity.

Whenever there is a conflict between:

```text
More functionality on one screen
```

and:

```text
A simpler customer decision
```

choose simplicity.

Whenever there is a conflict between:

```text
A trendy interaction
```

and:

```text
A familiar interaction
```

choose the familiar interaction unless the new approach is objectively easier.

The goal is not to make the website look designed.

The goal is to make the website feel effortless.
