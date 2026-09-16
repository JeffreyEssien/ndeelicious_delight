# IMPLEMENTATION_PLAN.md

## 1. Objective

Build a production-ready bakery e-commerce platform with three primary commerce flows:

1. Custom Cakes
2. Ready-Made Pastries
3. Ready-to-Bake Products

The system must support:

* customer storefront;
* product discovery;
* custom cake configuration;
* cart;
* delivery;
* Stripe payments;
* order management;
* inventory;
* coupons;
* customer notifications;
* admin management;
* SEO;
* analytics;
* monitoring;
* production deployment.

Every visible feature must be fully implemented across:

```text
UI
→ validation
→ server logic
→ database
→ admin visibility
→ customer feedback
→ error handling
```

No placeholder features.

No dead buttons.

No fake integrations.

No "coming soon" functionality unless explicitly approved.

---

# 2. Development Rules

Before implementing any feature:

1. Understand the complete user flow.
2. Identify affected database entities.
3. Identify security implications.
4. Define validation requirements.
5. Define loading states.
6. Define empty states.
7. Define error states.
8. Define success states.
9. Define admin implications.
10. Define tests.

A feature is complete only when all relevant states have been implemented.

---

# 3. Recommended Architecture

## Frontend

```text
Next.js
TypeScript
Tailwind CSS
ShadCN/UI where useful
React Hook Form
Zod
```

Prefer Server Components where appropriate.

Use Client Components only where interactivity requires them.

---

## Backend

Use:

```text
Next.js Server Actions
or
Route Handlers
```

All business-critical operations must run server-side.

Never trust:

* prices;
* discounts;
* stock quantities;
* delivery costs;
* payment status;

sent from the browser.

---

## Database

Recommended:

```text
PostgreSQL
```

Suggested provider:

```text
Supabase
or
Neon
```

Use an ORM such as:

```text
Prisma
```

or the existing project-standard database layer.

Do not introduce multiple database abstractions unnecessarily.

---

## Authentication

Initial requirement:

```text
Admin authentication
```

Customer checkout must support:

```text
Guest checkout
```

Customer accounts may be implemented where useful but must not block purchasing.

---

## Payments

Use:

```text
Stripe
```

Payment confirmation must rely on:

```text
Stripe webhook verification
```

not redirect success alone.

---

## Storage

Use:

```text
Cloudinary
or
Supabase Storage
```

For:

* product images;
* custom cake reference images;
* site imagery.

---

## Deployment

Recommended:

```text
Vercel
```

---

## Monitoring

Implement:

```text
Sentry
Vercel Analytics
structured application logs
```

---

# 4. Repository Structure

Use clear domain-based organization.

Recommended:

```text
src/
├── app/
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── product/
│   ├── cart/
│   ├── checkout/
│   ├── cakes/
│   └── admin/
│
├── features/
│   ├── products/
│   ├── cart/
│   ├── checkout/
│   ├── orders/
│   ├── cakes/
│   ├── inventory/
│   ├── coupons/
│   └── admin/
│
├── lib/
│
├── services/
│
├── validations/
│
├── types/
│
└── config/
```

Do not place all business logic inside page components.

---

# 5. Environment Strategy

Create:

```text
development
staging
production
```

Use separate:

* environment variables;
* Stripe keys;
* database configuration;

where practical.

Never test destructive functionality against production.

---

# 6. Phase 1 — Project Foundation

## Tasks

Set up:

* project structure;
* TypeScript strict mode;
* linting;
* formatting;
* environment handling;
* error boundaries;
* global loading UI;
* metadata defaults;
* design tokens;
* reusable UI primitives.

Implement:

```text
Button
Input
Textarea
Select
Checkbox
Radio
Modal
Drawer
Dialog
Toast
Skeleton
Badge
Tabs
Pagination
EmptyState
ErrorState
```

## Acceptance Criteria

* project builds with no TypeScript errors;
* no major lint errors;
* common components are reusable;
* styling follows DESIGN_SYSTEM.md;
* mobile layout foundation works;
* loading and error boundaries exist.

---

# 7. Phase 2 — Database Schema

Create the initial schema.

Core entities:

```text
Admin
Customer
Category
Product
ProductVariant
ProductImage
CustomCakeOption
CustomCakeOrder
Cart
CartItem
Order
OrderItem
Payment
DeliveryZone
Coupon
CouponUsage
Review
ContactMessage
NewsletterSubscriber
SiteSetting
AuditLog
```

---

# 8. Product Entity

Minimum fields:

```text
id
name
slug
shortDescription
description
categoryId
basePrice
discountPrice
sku
status
featured
trackInventory
stockQuantity
lowStockThreshold
ingredients
allergens
storageInstructions
preparationInstructions
createdAt
updatedAt
```

Statuses:

```text
DRAFT
ACTIVE
OUT_OF_STOCK
ARCHIVED
```

---

# 9. Product Variants

Support:

```text
size
flavour
packSize
weight
other future attributes
```

Variant fields should include:

```text
id
productId
name
sku
priceAdjustment
stockQuantity
status
```

---

# 10. Categories

Initial categories:

```text
CUSTOM_CAKES
PASTRIES
READY_TO_BAKE
```

Do not hardcode display logic everywhere.

Use database-backed categories where practical.

---

# 11. Phase 3 — Admin Authentication

Implement secure admin login.

Requirements:

* secure sessions;
* protected routes;
* logout;
* authorization middleware;
* failed login handling;
* rate limiting where appropriate.

Admin route prefix:

```text
/admin
```

Unauthenticated users must not access admin data.

---

# 12. Phase 4 — Admin Shell

Build admin layout first.

Desktop:

```text
Sidebar
Top bar
Main content
```

Sidebar:

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
Settings
```

Mobile admin navigation must remain usable.

---

# 13. Phase 5 — Product Management

Implement complete product CRUD.

Admin must be able to:

* create product;
* edit product;
* archive product;
* duplicate product;
* change price;
* manage stock;
* manage category;
* upload images;
* reorder images;
* add variants;
* change visibility;
* mark featured.

## Acceptance Criteria

Product changes must immediately affect storefront data appropriately.

Archived products must not appear publicly.

Do not permanently delete historical products tied to orders.

---

# 14. Phase 6 — Inventory

Implement inventory rules.

Fields:

```text
trackInventory
stockQuantity
lowStockThreshold
```

Rules:

```text
stock <= threshold
→ LOW STOCK

stock = 0
→ OUT OF STOCK
```

Admin must see:

* low-stock products;
* out-of-stock products;
* current quantity.

Stock deduction must occur only at the correct payment/order lifecycle stage.

Prevent overselling.

---

# 15. Phase 7 — Storefront Foundation

Build public layout.

Implement:

```text
Header
Desktop navigation
Mobile navigation
Search
Cart indicator
Footer
Newsletter block
```

Primary routes:

```text
/
 /shop
 /custom-cakes
 /ready-to-bake
 /product/[slug]
 /about
 /contact
 /faq
 /delivery-information
```

---

# 16. Phase 8 — Homepage

Implement sections:

```text
Hero
Shop by Category
Best Sellers
Custom Cake Feature
Featured Products
Ready-to-Bake Feature
Testimonials
Gallery
Newsletter
Footer
```

Use real database-driven content where applicable.

Avoid hardcoded products.

---

# 17. Phase 9 — Product Listing

Implement:

* category browsing;
* pagination;
* sorting;
* filtering;
* availability status;
* responsive product grid.

Filters:

```text
Category
Price
Availability
Flavour
```

Sorting:

```text
Featured
Newest
Price: Low to High
Price: High to Low
```

---

# 18. Phase 10 — Search

Implement search across:

```text
product name
description
category
flavour
keywords
```

Search must have:

* loading state;
* no-results state;
* keyboard support;
* mobile support.

---

# 19. Phase 11 — Product Details

Product page must include:

```text
Image gallery
Name
Price
Discount
Description
Variant selection
Quantity
Stock state
Add to Cart
Delivery summary
Ingredients
Allergens
Storage
Preparation
Related Products
```

Disable purchase when product is unavailable.

---

# 20. Phase 12 — Cart

Implement persistent cart.

Support:

* add;
* remove;
* update quantity;
* select variants;
* clear cart;
* recalculate subtotal.

Persist cart across:

```text
refresh
navigation
browser restart where practical
```

Do not trust client-side price values during checkout.

---

# 21. Cart Data Integrity

Every checkout request must re-fetch:

* product;
* variant;
* price;
* stock;
* availability.

If product price changed:

update cart before payment.

If stock changed:

show clear error.

---

# 22. Phase 13 — Custom Cake Builder

This is a standalone feature and must not be treated as a simple product form.

Wizard steps:

```text
1. Occasion
2. Size
3. Flavour
4. Filling
5. Design
6. Colours
7. Inscription
8. Upload Inspiration
9. Delivery Date
10. Review
```

Persist state between steps.

---

# 23. Cake Configuration

Admin must control available:

* sizes;
* flavours;
* fillings;
* tier options;
* decoration options;
* extras;
* lead time;
* price adjustments.

Avoid hardcoding options in JSX.

---

# 24. Cake Pricing Engine

Pricing model:

```text
Base Price
+ Size Adjustment
+ Flavour Adjustment
+ Tier Adjustment
+ Decoration
+ Extras
= Estimated Total
```

All final calculations must run server-side.

---

# 25. Cake Quote Mode

Allow certain configurations to use:

```text
REQUEST_QUOTE
```

instead of immediate payment.

Admin should be able to:

```text
review request
set quote
send quote
approve
reject
mark accepted
```

---

# 26. Cake Lead Time

Admin-defined lead time.

Example:

```text
72 hours
```

Date picker must prevent invalid dates.

Handle:

* closed days;
* same-day restrictions;
* unavailable dates;
* maximum capacity where implemented.

---

# 27. Image Uploads

Cake reference image upload must validate:

```text
file type
file size
number of files
```

Never allow arbitrary executable uploads.

---

# 28. Phase 14 — Delivery

Create database-backed delivery zones.

Fields:

```text
name
fee
active
estimatedTime
minimumOrder
```

Admin can:

* create;
* edit;
* disable;
* reorder.

Checkout must calculate delivery server-side.

---

# 29. Pickup

If pickup is enabled:

customer should choose:

```text
Delivery
or
Pickup
```

Pickup should not receive delivery fees.

Show pickup instructions clearly.

---

# 30. Phase 15 — Checkout

Checkout steps:

```text
Customer Information
↓
Fulfilment
↓
Delivery Address
↓
Coupon
↓
Order Review
↓
Payment
```

Use minimal distractions.

---

# 31. Customer Information

Collect:

```text
name
email
phone
```

Address:

```text
street
area
city
state
additional instructions
```

Validate server-side.

---

# 32. Phase 16 — Coupons

Implement coupon system.

Support:

```text
percentage
fixed amount
```

Rules:

```text
minimum order
maximum discount
expiry
start date
usage limit
per-customer limit
category restriction
product restriction
active status
```

Never validate coupons only in frontend code.

---

# 33. Phase 17 — Stripe Integration

Payment lifecycle:

```text
checkout request
↓
server rebuilds cart
↓
server validates stock
↓
server validates coupon
↓
server calculates delivery
↓
server calculates total
↓
order created as PENDING_PAYMENT
↓
Stripe payment session created
↓
customer pays
↓
Stripe webhook received
↓
signature validated
↓
order marked PAID
↓
inventory updated
↓
confirmation triggered
```

---

# 34. Stripe Security Rules

Never:

* expose secret key;
* accept amount from client;
* trust redirect URL as payment verification;
* mark order paid without webhook confirmation.

Webhook processing must be idempotent.

Duplicate webhooks must not create duplicate orders or stock deductions.

---

# 35. Phase 18 — Orders

Order statuses:

```text
PENDING_PAYMENT
PAID
CONFIRMED
PREPARING
READY
OUT_FOR_DELIVERY
DELIVERED
CANCELLED
REFUNDED
FAILED
```

Custom cake statuses may also include:

```text
QUOTE_REQUIRED
QUOTE_SENT
CUSTOMER_APPROVED
```

---

# 36. Order History

Every order should store immutable purchase snapshots.

Order items must retain:

```text
product name
variant
unit price
quantity
discount
final price
```

Do not depend entirely on current product data for old orders.

---

# 37. Phase 19 — Admin Order Management

Admin can:

* search;
* filter;
* view;
* change status;
* view payment state;
* see delivery details;
* add internal notes;
* print/download order summary;
* process refunds where supported.

All status changes should be auditable.

---

# 38. Phase 20 — Notifications

Implement transactional email.

Events:

```text
Order received
Payment confirmed
Order confirmed
Order preparing
Order ready
Out for delivery
Delivered
Custom cake quote
```

Do not send notification before transaction state is valid.

---

# 39. WhatsApp

Provide:

```text
WhatsApp support CTA
```

Optionally generate structured order handoff messages.

Do not expose sensitive customer/order data unnecessarily.

---

# 40. Phase 21 — Reviews

Implement product reviews.

Recommended rules:

```text
rating
title
body
customer name
status
createdAt
```

Admin moderation:

```text
PENDING
APPROVED
REJECTED
```

Only approved reviews appear publicly.

---

# 41. Phase 22 — Content Management

Admin should be able to edit important storefront content where practical.

Examples:

```text
Homepage hero
About section
Contact details
Social links
Delivery text
FAQ
Newsletter text
Store hours
```

Avoid forcing developer changes for routine content updates.

---

# 42. Phase 23 — Site Settings

Create centralized settings for:

```text
business name
email
phone
WhatsApp
address
social links
currency
custom cake lead time
pickup enabled
delivery enabled
order minimum
```

Do not scatter constants across the codebase.

---

# 43. Phase 24 — Audit Logging

Audit sensitive admin actions.

Examples:

```text
Product price changed
Stock changed
Order status changed
Coupon created
Coupon edited
Delivery fee changed
Refund initiated
Settings changed
```

Audit data:

```text
admin
action
entity
entityId
previousValue
newValue
timestamp
```

---

# 44. Phase 25 — SEO

Implement:

```text
page metadata
product metadata
canonical URLs
OpenGraph
Twitter metadata
sitemap.xml
robots.txt
structured data
```

Structured data:

```text
Product
Organization
BreadcrumbList
```

---

# 45. Phase 26 — Analytics

Track meaningful events.

Examples:

```text
product_viewed
add_to_cart
remove_from_cart
checkout_started
payment_completed
cake_builder_started
cake_builder_completed
coupon_applied
search_performed
```

Do not track unnecessary sensitive information.

---

# 46. Phase 27 — Performance

Audit:

* image optimization;
* bundle size;
* server response times;
* unnecessary client components;
* database query count;
* cache opportunities.

Targets:

```text
LCP < 2.5s
INP < 200ms
CLS < 0.1
```

Use optimized image sizes and formats.

---

# 47. Phase 28 — Accessibility

Ensure:

* keyboard navigation;
* labels;
* accessible dialogs;
* focus management;
* sufficient contrast;
* semantic HTML;
* alternative text;
* reduced motion support.

Run automated accessibility checks.

---

# 48. Phase 29 — Security

Implement:

```text
Zod validation
server-side authorization
rate limiting
secure cookies
CSRF protection where applicable
secure headers
file validation
webhook signature verification
database access control
sanitized output
```

Review:

```text
IDOR
XSS
SQL injection
privilege escalation
payment tampering
coupon abuse
inventory race conditions
upload abuse
```

---

# 49. Phase 30 — Testing

## Unit Tests

Test:

```text
pricing calculations
discount calculations
delivery calculations
stock rules
cake pricing
coupon rules
```

---

## Integration Tests

Test:

```text
product creation
cart
checkout
order creation
Stripe webhook
inventory deduction
status updates
coupon application
```

---

## E2E Tests

Required customer flows:

```text
Buy pastry
Buy ready-to-bake product
Configure custom cake
Apply coupon
Checkout
Payment flow
Order confirmation
```

Required admin flows:

```text
Login
Create product
Edit product
Update inventory
Process order
Create coupon
Update delivery zone
```

---

# 50. Edge Cases

Explicitly test:

```text
Product goes out of stock during checkout
Price changes while product is in cart
Coupon expires while cart is open
Duplicate Stripe webhook
Payment succeeds but redirect fails
Webhook delayed
Customer refreshes checkout
Customer double-clicks Pay
Invalid upload
Invalid delivery zone
Cake date becomes unavailable
Admin archives ordered product
Customer orders last unit
Network failure
Database timeout
Email provider unavailable
```

The system must fail safely.

---

# 51. Phase 31 — Staging

Deploy staging before production.

Test using:

* realistic products;
* realistic delivery zones;
* Stripe test mode;
* mobile devices;
* desktop browsers.

Perform complete customer and admin journeys.

---

# 52. Phase 32 — Production Content

Before launch add:

```text
real products
real prices
real images
delivery fees
business details
policies
FAQs
social links
contact channels
custom cake rules
```

Remove all placeholder content.

---

# 53. Phase 33 — Production Launch

Checklist:

```text
[ ] Production database configured
[ ] Production Stripe keys
[ ] Stripe webhook live
[ ] Domain connected
[ ] SSL active
[ ] Admin account configured
[ ] Email sending configured
[ ] Product images optimized
[ ] Delivery zones configured
[ ] Policies added
[ ] Analytics active
[ ] Error monitoring active
[ ] Sitemap accessible
[ ] Robots configuration correct
[ ] Mobile QA complete
[ ] Desktop QA complete
[ ] Checkout tested
[ ] Backup/recovery plan documented
```

---

# 54. Definition of Done

A feature is DONE only when:

```text
UI exists
+
mobile works
+
validation exists
+
server logic exists
+
database persistence works
+
authorization is correct
+
loading state exists
+
error state exists
+
success feedback exists
+
edge cases handled
+
tests pass
+
admin impact considered
```

If one of these is missing, the feature is not finished.

---

# 55. Agent Execution Order

The agent should build in this sequence:

```text
1. Foundation
2. Database
3. Admin authentication
4. Admin shell
5. Products
6. Inventory
7. Storefront shell
8. Homepage
9. Product catalogue
10. Search
11. Product detail
12. Cart
13. Cake builder
14. Delivery
15. Checkout
16. Coupons
17. Stripe
18. Orders
19. Admin order management
20. Notifications
21. Reviews
22. Content management
23. Settings
24. Audit logs
25. SEO
26. Analytics
27. Performance
28. Accessibility
29. Security
30. Testing
31. Staging
32. Production content
33. Launch
```

Do not jump to later phases if foundational dependencies are unstable.

---

# 56. Agent Checkpoint Protocol

At the end of every major phase, the agent must report:

```text
COMPLETED
- What was implemented

FILES CHANGED
- Relevant files

DATABASE CHANGES
- Migrations / schema changes

TESTS
- Tests added
- Tests passed

MANUAL TEST
- Exact steps to verify

KNOWN LIMITATIONS
- Anything still incomplete

NEXT PHASE
- What should be built next
```

Never simply state:

```text
Done.
```

---

# 57. Regression Rule

Before completing a new feature:

verify that existing critical flows still work.

At minimum:

```text
Homepage
Product listing
Product page
Cart
Admin login
Admin products
```

Later:

```text
Checkout
Payment
Order processing
```

should become part of every regression pass.

---

# 58. Database Migration Rule

Every database schema change must:

* use a migration;
* preserve existing data where practical;
* document breaking changes;
* avoid destructive resets outside development.

Never use production database resets as a normal deployment strategy.

---

# 59. Data Integrity Rule

Critical operations should use transactions where required.

Examples:

```text
Order creation
Payment confirmation
Inventory deduction
Coupon usage
Refund state changes
```

Avoid partial system state.

---

# 60. Idempotency Rule

The following operations must be safely repeatable:

```text
Stripe webhooks
payment confirmation
inventory deduction
notification triggers where practical
```

Repeated requests must not create:

```text
duplicate orders
duplicate payments
duplicate stock deductions
```

---

# 61. UI Rule

Follow DESIGN_SYSTEM.md strictly.

Every page should maintain:

```text
consistent spacing
consistent type scale
consistent radii
consistent loading states
consistent buttons
consistent form behaviour
consistent feedback
```

Do not introduce one-off visual styles without justification.

---

# 62. Mobile-First Rule

Every customer-facing feature must be tested first at mobile widths.

Critical flows must work comfortably one-handed.

Pay special attention to:

```text
navigation
product galleries
variant selectors
cake builder
cart
checkout
sticky CTAs
```

---

# 63. Customer Journey Test

Before launch the following full flow must succeed:

```text
Customer visits site
↓
Finds product
↓
Selects variant
↓
Adds to cart
↓
Applies coupon
↓
Selects delivery
↓
Pays
↓
Order created
↓
Inventory updates
↓
Customer receives confirmation
↓
Admin receives order
↓
Admin updates status
↓
Customer receives update
↓
Order delivered
```

---

# 64. Custom Cake Journey Test

The following must succeed:

```text
Customer opens cake builder
↓
Chooses occasion
↓
Chooses size
↓
Chooses flavour
↓
Chooses design
↓
Adds inscription
↓
Uploads reference image
↓
Chooses valid date
↓
Reviews configuration
↓
Gets price / quote
↓
Submits order
↓
Admin sees complete configuration
↓
Admin processes request
```

No configuration data should be lost.

---

# 65. Failure Handling Standard

Every critical action must answer:

```text
What if it succeeds?
What if it fails?
What if it times out?
What if it is retried?
What if the customer refreshes?
What if the request arrives twice?
```

Implement accordingly.

---

# 66. Do Not Implement

Avoid unnecessary complexity during the initial production build.

Do not add unless explicitly required:

```text
microservices
multiple databases
Kubernetes
event streaming platforms
complex recommendation engines
native mobile apps
custom CMS frameworks
custom payment processing
```

Keep the architecture maintainable and proportional to the business.

---

# 67. Final Engineering Principle

The system must favour:

```text
Correctness
↓
Security
↓
Reliability
↓
Usability
↓
Performance
↓
Visual polish
```

Visual polish is important, but never at the cost of transactional correctness.

For every feature, ask:

> Can a real customer use this today without developer intervention?

If the answer is no, the feature is incomplete.
