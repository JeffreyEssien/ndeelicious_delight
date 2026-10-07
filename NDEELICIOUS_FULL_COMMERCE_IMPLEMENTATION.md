# NDEELICIOUS Delight — HRM Fulfilment, Tax, Pack Variants, Cake-Type Budget Matching & Mobile Commerce Implementation

Repository: `JeffreyEssien/ndeelicious_delight`
Production: `https://www.ndeelicious.com`
Reference for merchandising/fulfilment inspiration: `https://thebutterandbliss.com`

---

# 0. EXECUTION MODE

This is an implementation task.

Do not return another audit first.

Do not stop after creating files, schemas, migrations, components, or tests.

Follow this loop:

```text
inspect
→ reproduce
→ trace data flow
→ fix root cause
→ migrate safely
→ test domain logic
→ test API/server enforcement
→ run browser journey
→ inspect rendered result
→ fix regressions
→ repeat
```

A feature is not complete because code exists.

It is complete only when:

```text
Admin can configure it
→ data persists
→ storefront consumes it
→ server enforces it
→ refresh preserves it
→ mobile works
→ failures are recoverable
→ historical orders remain correct
→ browser flow is verified
```

Do not optimize for feature count.

Optimize for a bakery owner who can actually run the business from Admin and a customer who never has to understand the complexity underneath.

---

# 1. CURRENT IMPLEMENTATION — KEEP WHAT IS GOOD

Do not rebuild these from scratch:

- `cake_types`;
- per-cake-type lead times;
- cake-type customer notices;
- cake-type requested-date validation;
- immutable cake lead-time snapshots;
- `shopping_mode`;
- `preparation_hours`;
- variant-aware Budget Match for normal products;
- existing delivery-zone foundation;
- Stripe Checkout;
- order/document snapshots;
- current admin/customer wording system.

Extend them properly.

---

# 2. BRANCH STATE MUST BE RECONCILED FIRST

`main` and `develop` are currently diverged.

Before more implementation:

1. fetch latest remote state;
2. reconcile `main` into `develop`;
3. resolve conflicts carefully;
4. preserve current cake-type, product-mode, and Budget Match work;
5. run the project gate;
6. continue on one clean branch;
7. only merge to `main` after acceptance tests pass.

Do not deploy a branch with unresolved divergence.

Final report must state:

```text
source branch
destination branch
merge base
final SHA
```

---

# 3. CLEAN UP MIGRATION 0031 BEFORE APPLYING

`0031_product_shopping_modes.sql` currently updates owner-managed homepage content.

Remove the `site_settings.home.categories` rewrite from the structural migration.

Structural migration responsibilities should be limited to:

```text
schema
constraints
indexes
required data normalization
```

Do not silently overwrite CMS content.

Homepage merchandising changes belong in:

- Admin → Content; or
- an explicitly authorized data migration separate from schema changes.

---

# 4. APPLY AND VERIFY PENDING MIGRATIONS

Do not claim the cake/product features are complete while migrations exist only in source.

For migrations `0030`, `0031`, and all new migrations added by this task:

1. backup intended environment;
2. apply migration;
3. validate constraints;
4. test reads;
5. test writes;
6. verify rollback/recovery procedure;
7. run browser smoke.

Do not invent production data.

If new required configuration is missing after migration, surface:

`Setup required`

instead of silently using fake defaults.

---

# 5. HRM-ONLY FULFILMENT MODEL

Ndeelicious currently delivers only within Halifax Regional Municipality.

Customer-facing fulfilment must reflect this.

Use:

```text
Delivery within HRM
Pickup
```

Do not show generic Canada-wide delivery wording.

For local delivery:

```text
country = CA
province = NS
```

The customer should primarily provide:

```text
postal code
street
unit/apartment
city
delivery note
```

Do not force them to select from every Canadian province.

The internal model may remain extensible for future expansion.

---

# 6. BUILD ONE CANONICAL FULFILMENT DOMAIN

Create one fulfilment domain, for example:

```text
src/features/fulfilment/
  types.ts
  postal-code.ts
  resolver.ts
  schedule.ts
  validation.ts
```

This becomes the source of truth for:

- standard checkout;
- custom cake checkout/quote acceptance;
- product availability copy;
- delivery page;
- order creation;
- document generation;
- admin validation.

Do not duplicate fulfilment calculations across routes/components.

---

# 7. UPGRADE DELIVERY ZONES INTO FULL DELIVERY AREAS

Extend the current `delivery_zones` model.

Add support for:

```text
postalCodePrefixes
freeDeliveryThreshold
customerNote
sameDayEligible
deliveryEstimate
minimumOrder
fee
active
sortOrder
```

Preferred DB representation for postal prefixes:

```sql
text[]
```

Example only:

```text
Halifax
Prefixes: B3H, B3J, B3K
Fee: $10
Minimum: $30
Free over: $100
Estimate: Same / next day
```

Do not hardcode these values.

---

# 8. DELIVERY AREA ADMIN CRUD

The bakery owner must be able to:

```text
Add delivery area
Rename
Edit fee
Edit minimum order
Edit free-delivery threshold
Edit estimate
Edit customer note
Add/remove postal prefixes
Toggle same-day eligibility
Activate/deactivate
Reorder
Archive/remove safely
```

Use explicit states:

```text
Unsaved changes
Saving…
Saved
Save failed
```

Do not rely only on toasts.

Historical orders must not break if an area is later edited or disabled.

---

# 9. POSTAL CODE NORMALIZATION

Create one helper.

Example:

```ts
normalizeCanadianPostalCode("b3h2y5") // "B3H 2Y5"
normalizeCanadianPostalCode("B3H2Y5") // "B3H 2Y5"
postalFsa("B3H 2Y5") // "B3H"
```

Use the same helper in:

- client;
- API/server;
- quote acceptance;
- admin validation;
- tests.

Do not duplicate regexes.

---

# 10. POSTAL CODE → DELIVERY AREA RESOLUTION

Create:

```ts
resolveDeliveryArea(postalCode, activeAreas)
```

Rules:

1. normalize postal code;
2. derive FSA;
3. find active matching area;
4. reject ambiguous matches;
5. return authoritative area data.

Structured errors:

```text
INVALID_POSTAL_CODE
OUTSIDE_DELIVERY_AREA
AMBIGUOUS_DELIVERY_AREA
DELIVERY_AREA_INACTIVE
```

Translate these to customer-friendly copy.

---

# 11. PREVENT DUPLICATE ACTIVE FSA COVERAGE

Two active areas must not own the same FSA.

Validate:

- in Admin;
- in API mutation;
- at DB level where practical.

Example:

`B3H is already assigned to Halifax.`

Do not silently choose one.

---

# 12. CUSTOMER DELIVERY UX — POSTAL CODE FIRST

Replace the old area-dropdown-first experience.

Target:

```text
Delivery within HRM

Postal code
[B3H 2Y5]

✓ We deliver here
Halifax
Delivery: $10.00
Estimated: Tomorrow
```

Then collect:

```text
Street address
Apartment/unit
City
Postal code
Delivery notes
```

Province should resolve to Nova Scotia.

Country should resolve to Canada.

---

# 13. OUTSIDE-HRM STATE

If no active configured area matches:

```text
We currently deliver within HRM only.

This postal code is outside our current delivery area.
Choose pickup or contact Ndeelicious.
```

Do not continue to Review/Payment with invalid delivery.

---

# 14. SERVER-AUTHORITATIVE DELIVERY FEE

The browser must not decide delivery pricing.

Server must resolve:

```text
postal code
→ area
→ fee
→ minimum
→ free-delivery threshold
→ estimate
```

Reject:

```text
inactive area
unknown area
FSA mismatch
tampered fee
minimum-order failure
```

---

# 15. FREE-DELIVERY THRESHOLDS

Each area may optionally have:

```text
freeDeliveryThreshold
```

Server rule:

```text
if subtotal >= threshold:
    deliveryFee = 0
else:
    deliveryFee = configured fee
```

Customer can see:

`Add $18.50 more for free delivery to Halifax.`

Only show when configured.

---

# 16. DELIVERY SCHEDULE SETTINGS

Add structured settings for:

```text
deliveryDays
sameDayEnabled
sameDayCutoff
defaultDeliveryEstimate
blackoutDates
timezone
```

Use:

`America/Halifax`

for authoritative calculations.

Do not use browser local timezone.

---

# 17. DELIVERY DAYS

Admin can enable/disable:

```text
Monday
Tuesday
Wednesday
Thursday
Friday
Saturday
Sunday
```

Customer cannot select unavailable delivery dates.

Server must revalidate.

---

# 18. SAME-DAY DELIVERY

Admin configures:

```text
same-day enabled
cutoff time
area eligibility
```

Do not copy Butter & Bliss's exact cutoff.

Customer-facing copy should derive from live configuration:

```text
Order before 2:00 PM for delivery today.
```

After cutoff:

```text
Next available delivery: Thursday.
```

---

# 19. BLACKOUT DATES

Create structured blackout dates:

```text
date
reason
active
```

Admin can add/edit/disable.

Fulfilment resolver skips them.

---

# 20. PICKUP SETTINGS

Expand beyond `pickupEnabled + business.address`.

Support:

```text
pickupEnabled
pickupAddress
pickupInstructions
pickupDays
pickupHours
pickupPreparationBuffer
```

Customer should see:

```text
Pickup
[address]
Earliest available: Friday
```

Do not show timing that cannot be enforced.

---

# 21. BUILD ONE EARLIEST-FULFILMENT RESOLVER

Inputs:

```text
now
timezone
fulfilment method
product preparation requirement
cake lead-time requirement
delivery area
delivery schedule
pickup schedule
blackout dates
same-day cutoff
```

Output:

```text
earliestDate
earliestDateTime where applicable
humanLabel
reason metadata
```

Pseudo logic:

```text
baseReadyAt = now + max(productPreparation, cakeLeadTime)

if delivery:
    apply area availability
    apply same-day cutoff
    find next valid delivery day
    skip blackout dates

if pickup:
    apply pickup schedule
    skip blackout dates
```

Use this service everywhere.

---

# 22. KEEP CAKE LEAD TIMES, BUT INTEGRATE THEM

Do not remove the existing cake-type lead-time implementation.

Keep:

```text
leadTimeValue
leadTimeUnit
customerNotice
active
sortOrder
snapshot
server date enforcement
```

But change the final date calculation from:

```text
now + lead time
```

to:

```text
now
+ cake lead time
+ fulfilment calendar rules
= earliest valid date
```

---

# 23. CAKE TYPES NEED BASE PRICING

The new cake-type model currently provides lead time but does not provide a first-class type-level base price.

Add:

```text
basePrice
```

to `cake_types`.

Store money in integer minor units.

Admin must edit it.

Do not hardcode examples.

Example:

```text
Birthday Cake
Base price: $50

Wedding Cake
Base price: $180
```

Customer-facing Budget Match should use this as part of its price calculation.

---

# 24. CAKE OPTIONS MUST BECOME CAKE-TYPE-AWARE

Current problem:

`CakeOption` has no relationship to `CakeType`.

That means a Wedding Cake can currently inherit the exact same recommendation set as a Birthday Cake.

Fix this.

Preferred normalized model:

```text
cake_type_options

cake_type_id
cake_option_id
```

Allow an option to be valid for:

- one cake type;
- multiple cake types;
- all types if explicitly modeled.

Do not infer compatibility from option names.

---

# 25. ADMIN CAKE OPTION ASSIGNMENT

In Custom Cakes → Configuration:

For each option, owner should be able to control:

```text
Applicable cake types
```

Example:

```text
6-inch size
✓ Birthday Cake
✓ Celebration Cake
☐ Wedding Cake
```

Do not make this overly complex.

Use multi-select/checklist.

Persist through normalized relationships.

---

# 26. CAKE BUILDER MUST FILTER BY SELECTED CAKE TYPE

Once customer selects cake type:

```text
Cake Type
→ Occasion
→ Size
→ Flavour
→ Filling
→ Design
```

Each subsequent step must show only options valid for the selected type.

Do not show every active generic option.

If customer changes cake type:

- clear incompatible selections;
- retain compatible selections;
- recalculate price;
- recalculate earliest date.

---

# 27. CAKE PRICING MUST INCLUDE CAKE-TYPE BASE PRICE

Canonical cake calculation:

```text
cakeType.basePrice
+ occasion adjustment if applicable
+ size adjustment
+ flavour adjustment
+ filling adjustment
+ design adjustment
+ other priced options
= estimated total
```

Do not let Budget Match use a different pricing formula from the cake builder.

Create one pricing service.

---

# 28. QUOTE-REQUIRED OPTIONS MUST NOT KILL BUDGET MATCH

Current code does:

```ts
if any required option family has no active non-quote-required option:
    return []
```

Remove this all-or-nothing behavior.

Distinguish:

```text
EXACT_PRICE
STARTING_FROM
QUOTE_REQUIRED
```

Examples:

```text
Birthday Cake
6-inch · Vanilla · Classic
$82
Exact starting configuration
```

and:

```text
Wedding Cake
Starting from $180
Custom design requires quote
```

Do not hide all custom cakes because one dimension is quote-based.

---

# 29. REDESIGN THE CAKE RECOMMENDATION API

Do not generate generic cake ideas and cross-product them with every active cake type in React.

Current anti-pattern:

```text
generic cakeIdeas
×
all active cakeTypes
```

Replace with a cake-type-aware engine.

Suggested API:

```ts
cakeRecommendations({
  cakeTypes,
  options,
  relationships,
  maximum,
  limit,
})
```

Return already-valid recommendations:

```ts
type CakeBudgetRecommendation = {
  id: string;
  cakeType: CakeType;
  total: number;
  pricingMode: "EXACT_PRICE" | "STARTING_FROM" | "QUOTE_REQUIRED";
  selections: Partial<Record<CakeOptionType, CakeOption>>;
  leadTime: {
    value: number;
    unit: "hours" | "days" | "weeks";
  };
};
```

React should render recommendations, not manufacture domain relationships.

---

# 30. CAKE BUDGET RECOMMENDATION ALGORITHM

For every active cake type:

1. get base price;
2. load options valid for that type;
3. group by option family;
4. separate fixed-price and quote-required choices;
5. generate valid fixed-price combinations where possible;
6. calculate totals using canonical cake pricing;
7. filter exact recommendations to `<= maximum`;
8. generate meaningful `STARTING_FROM` recommendation where exact result is not possible;
9. attach cake lead time;
10. deduplicate by meaningful configuration signature;
11. rank results.

Do not create identical recommendations for every cake type.

---

# 31. BUDGET MATCH MUST NOT DEPEND ON EVERY OPTION FAMILY HAVING FIXED PRICE

If a cake type has:

```text
size = fixed price
flavour = fixed price
filling = fixed price
design = quote required
```

Budget Match may still show:

```text
Wedding Cake
Starting from $180
Final design requires a quote
Minimum lead time: 3 weeks
```

Do not return zero results.

---

# 32. BUDGET MATCH RESULT STATES MUST BE TRUTHFUL

Do not show:

`No options fit this budget`

when the actual reason is:

```text
no active cake types
no cake-type base price
no valid option relationship
all options require quote
cake configuration incomplete
```

Create distinct internal states.

Possible customer responses:

```text
No ready-to-price cake options are available right now.
Contact the bakery for a custom quote.
```

or:

```text
Custom cakes start above this budget.
See the closest starting options.
```

---

# 33. CUSTOM CAKES TAB MUST SURVIVE THE NEW DATA MODEL

The Budget Match custom-cake tab must continue to work after adding:

```text
cake types
lead times
base prices
option relationships
```

Regression test this explicitly.

Do not allow future cake-model migrations to silently remove recommendations.

---

# 34. CUSTOMIZE LINK MUST PRESERVE THE RECOMMENDATION

When customer clicks `Customize`, pass:

```text
cakeTypeId
occasionId
sizeId
flavourId
fillingId
designId
recommended=1
```

Use IDs, not only names.

The `/custom-cakes` page must validate:

- cake type active;
- option active;
- option belongs to selected cake type.

Ignore stale/incompatible query params safely.

---

# 35. BUILDER SHOULD LOAD THE PRESET CORRECTLY

A Budget Match recommendation should open the builder with:

```text
cake type selected
compatible recommendation selections prefilled
budget preset notice visible
correct lead time visible
correct estimated price
```

If one selected option is no longer valid:

- drop only the invalid selection;
- do not crash;
- explain that availability changed if useful.

---

# 36. FIRST-CLASS PACK QUANTITY

Current variant names such as:

`Pack of 3`

are not sufficient.

Add:

```text
pack_quantity integer null
```

to product variants.

TypeScript:

```ts
ProductVariant {
  ...
  packQuantity: number | null
}
```

Rules:

```text
null = not a pack variant
positive integer = pack variant
```

Never parse the quantity from the variant name.

---

# 37. PACK ADMIN UX

Admin variant editor should support:

```text
Variant name
Pack quantity
Price adjustment
Stock
Active
```

Convenience action:

`Add 3 / 6 / 12 packs`

must create:

```text
packQuantity = 3
packQuantity = 6
packQuantity = 12
```

not just names.

---

# 38. PRODUCT PAGE PACK SELECTOR

Use:

```text
Choose your pack

[ 3 ] [ 6 ] [ 12 ]
```

Selection updates:

```text
price
availability
SKU internally
tax result
cart line
```

Must be accessible and mobile-friendly.

---

# 39. PRODUCT PREPARATION TIME

Keep `preparation_hours`.

Integrate it into fulfilment.

Example:

```text
Made to Order
Preparation: 48h
```

If delivery is technically same-day but product needs 48h:

```text
earliest fulfilment >= 48h
```

---

# 40. TAX ARCHITECTURE — REPLACE GLOBAL SUBTOTAL TAXATION

Current final tax logic must not remain:

```text
(subtotal - discount + optional delivery)
× one global tax rate
```

Build a line-level tax engine.

Recommended structure:

```text
src/features/tax/
  types.ts
  rules.ts
  calculator.ts
  allocation.ts
```

---

# 41. PRODUCT TAX CLASSIFICATION

Add controlled tax classes:

```text
ZERO_RATED_GROCERY
SWEET_SINGLE_SERVING
FULL_CAKE
WEDDING_CAKE
STANDARD_TAXABLE
REQUIRES_REVIEW
```

Admin selects classification.

Do not allow arbitrary tax percentages per product.

---

# 42. NOVA SCOTIA TAX JURISDICTION

HRM delivery implies Nova Scotia.

Use:

```text
jurisdiction = NS
taxable HST rate = 14%
rateBps = 1400
```

Do not display:

```text
GST 5%
+
HST 14%
```

as separate charges.

---

# 43. PACK-AWARE TAX RESOLUTION

Resolver input:

```text
taxClass
packQuantity
jurisdiction
```

Example API:

```ts
resolveLineTaxTreatment({
  taxClass,
  packQuantity,
  jurisdiction: "NS",
})
```

Do not put tax-law branches inside React.

---

# 44. LINE-LEVEL TAX

Each order line must resolve:

```text
gross line amount
discount allocation
taxable amount
tax class
resolved rate
tax amount
```

Then:

```text
taxTotal = sum(lineTax)
```

Delivery tax is calculated separately.

---

# 45. DISCOUNT ALLOCATION

For mixed-tax baskets, allocate coupon discount deterministically across eligible lines.

Rules:

```text
allocated line discount <= line amount
sum(line discounts) = total discount
tax calculated after allocated discount
rounding deterministic
```

Test:

```text
taxable + zero-rated lines
percentage coupon
fixed coupon
product-restricted coupon
```

---

# 46. DELIVERY TAX MODE

Replace final dependence on:

`taxDelivery: boolean`

with an explicit mode such as:

```text
SEPARATE_TAXABLE_SERVICE
FOLLOW_ORDER_ITEMS
```

Put this under Advanced Tax Settings.

Do not invent legal treatment silently.

---

# 47. TAX SNAPSHOT

Persist per-order-line:

```text
taxClass
resolvedRateBps
taxableAmount
taxAmount
```

Persist order-level:

```text
jurisdiction
deliveryTaxMode
taxTotal
```

Historical orders must never recalculate when tax configuration changes.

---

# 48. INVOICE / RECEIPT TAX DISPLAY

Customer documents:

```text
Subtotal
Delivery
HST
Total
```

Do not expose internal enum names.

Admin can have a detailed advanced tax view if useful.

---

# 49. BUDGET MATCH — NORMAL PRODUCT VARIANTS

Keep the existing improvement where Budget Match evaluates purchasable variants.

Continue using actual variant price.

Once `packQuantity` exists, show:

```text
Chocolate Croissants
Pack of 6
$27
$3 remaining in your budget
Ready tomorrow
```

Do not compare against product base price only.

---

# 50. BUDGET MATCH — MOBILE RESULT STATE

The critical broken state is:

```text
enter budget
→ Find options
→ results render
```

Test at:

```text
320
360
375
390
430
```

---

# 51. MOBILE RESULT VISUAL STANDARD

Requirements:

```text
1 result per row
product-first hierarchy
compact image
no giant icons
no oversized decorative blocks
no horizontal overflow
no excessive whitespace
price highly visible
lead/prep time readable
CTA visible
```

Normal icon size:

```text
16–20px
```

Supporting icon:

```text
24–32px max
```

Only empty-state illustration may be larger.

---

# 52. RESULT SEGMENTS

Support useful segments such as:

```text
All
Ready now
Custom cakes
```

Make the control responsive.

Use:

- compact segmented controls;
- horizontal scrolling if required;
- proper `aria-pressed` or tab semantics.

No ugly multi-row wrapping.

---

# 53. BUDGET LOADING STATE

After `Find options`:

- show result skeletons;
- keep layout stable;
- avoid giant spinner;
- avoid page jump.

---

# 54. PRODUCT / CAKE RESULT COUNTING

Count only genuinely rendered recommendations.

Do not count hidden or invalid cake recommendations.

Do not let a missing cake configuration produce a misleading global `0 options found` when product results exist.

---

# 55. MERCHANDISING STRUCTURE

Keep:

```text
Ready to Order
Made to Order
Ready to Bake
Custom Cakes
```

Use Butter & Bliss as inspiration for clarity.

Improve beyond it with:

```text
admin-editable rules
preparation timing
pack variants
HRM postal validation
cake-type lead time
accurate tax
strong mobile UX
```

Do not copy branding or copywriting.

---

# 56. AVAILABILITY LABELS

Create one helper.

Examples:

```text
Ready today
Ready tomorrow
Made to order · 48 hours
Available Friday
Minimum lead time · 3 weeks
```

Do not hardcode availability copy across components.

---

# 57. CUSTOMER DELIVERY PAGE

Render structured delivery data.

Show:

```text
We currently deliver within HRM.
```

Then derive:

```text
active areas
fees
minimums
free delivery thresholds
estimated timing
pickup
cutoff rules
```

Do not duplicate these numbers in static CMS copy.

---

# 58. ADMIN FULFILMENT WORKSPACE

Recommended:

```text
Fulfilment
├── Delivery areas
├── Schedule & cutoffs
├── Pickup
└── Tax
```

Make it mobile-friendly.

Do not use wide desktop-only tables.

---

# 59. ADMIN DELIVERY CARD DESIGN

Example:

```text
Halifax
Active

Fee: $10
Minimum: $30
Free over: $100
Estimate: Same / next day

Postal areas
B3H · B3J · B3K

[Edit] [Disable]
```

Mobile:

```text
1 column
```

Desktop:

```text
2 columns where practical
```

---

# 60. ORDER SNAPSHOT — FULFILMENT

Persist:

```text
fulfilmentMethod
deliveryAreaId
deliveryAreaName
postalCode
deliveryFee
minimumOrderResult
freeDeliveryThresholdResult
estimatedFulfilment
address
```

Historical orders must not depend on current delivery settings.

---

# 61. CUSTOM CAKE QUOTE ACCEPTANCE USES SAME FULFILMENT ENGINE

Flow:

```text
quote accepted
→ fulfilment
→ postal code
→ HRM area resolution
→ earliest valid date
→ delivery fee
→ tax
→ Stripe
```

Do not create a cake-specific delivery calculator.

---

# 62. MARKETING STUDIO REGRESSION — REVERIFY

Do not trust old documentation claiming it is fixed.

Verify actual browser behavior:

```text
canvas initialized before image fetch
optional logo failure does not kill render
product image load reliable
preview works
single PNG works
ZIP works
```

Add a Playwright download assertion.

---

# 63. DATABASE TESTS — CAKE BUDGET MODEL

Add migration/domain tests for:

```text
cake type base price
cake type option relationships
active option validation
cake type deletion/archive safety
cake request snapshot
cake recommendation pricing
```

---

# 64. UNIT TESTS — CAKE RECOMMENDATIONS

Test:

```text
one active cake type
multiple cake types
different base prices
different allowed options
quote-required design
missing fixed-price design
budget below all exact configurations
starting-from recommendation
deduplication
inactive cake type
inactive option
```

Critical regression:

```text
adding cake types must not make Custom Cakes disappear from Budget Match
```

---

# 65. BUILDER TESTS

Test:

```text
cake type filters options
changing cake type clears incompatible selection
compatible selections persist
budget recommendation prefill works
lead time updates
price updates
stale query params handled safely
```

---

# 66. DELIVERY TESTS

Test:

```text
postal normalization
FSA extraction
valid area
outside HRM
duplicate FSA
inactive area
minimum order
free delivery
server fee authority
```

---

# 67. FULFILMENT SCHEDULE TESTS

Test:

```text
before cutoff
after cutoff
disabled weekday
blackout date
48h product prep
cake lead time
pickup schedule
same-day area disabled
```

Use deterministic Halifax timezone fixtures.

---

# 68. PACK TESTS

Test:

```text
packQuantity persistence
3/6/12 helper
product selection
cart
Budget Match
checkout
order
tax
invoice
```

---

# 69. TAX TESTS

At minimum:

```text
zero-rated line
taxable line
mixed basket
Pack 3
Pack 6
Pack 12
coupon allocation
delivery tax mode
order tax snapshot
invoice total
refund uses snapshot
```

---

# 70. PLAYWRIGHT — BUDGET MATCH

Viewport coverage:

```text
375 × 812
390 × 844
430 × 932
```

Scenario:

1. open Shop;
2. enter budget;
3. click `Find options`;
4. wait for results;
5. assert custom cake suggestions appear when valid;
6. switch Custom Cakes tab;
7. click Customize;
8. assert builder is prefilled;
9. go back;
10. verify no horizontal overflow.

Assert:

```js
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

---

# 71. PLAYWRIGHT — DELIVERY

Scenario:

```text
valid HRM postal
→ area resolves
→ fee appears
→ minimum enforced
→ free threshold works
→ checkout review
```

Also test:

```text
outside HRM
→ pickup option
```

---

# 72. PLAYWRIGHT — CAKE TYPE LEAD TIME

Scenario:

```text
admin configures cake type
→ storefront shows lead time
→ Budget Match shows cake recommendation
→ Customize opens builder
→ invalid early date blocked
→ valid date accepted
```

---

# 73. PLAYWRIGHT — PRODUCT PACK

Scenario:

```text
Made to Order
→ product
→ Pack 6
→ price changes
→ add cart
→ checkout
→ order summary preserves Pack 6
```

---

# 74. ADMIN BROWSER TESTS

Verify persistence through reload for:

```text
delivery area
FSA prefixes
free-delivery threshold
same-day settings
pickup
cake type
cake base price
cake option relationship
3/6/12 pack quantity
tax class
```

---

# 75. MIGRATION STRATEGY

Additive migrations only.

Do not edit historical migrations already applied.

Expected new migration responsibilities may include:

```text
delivery area FSA fields
free-delivery threshold
same-day flags
schedule settings
blackout dates
cake type base price
cake type option junction
variant pack quantity
tax class
tax snapshots
```

Use current DB conventions.

---

# 76. BACKWARD COMPATIBILITY

Existing products/orders must continue to load.

Legacy variants:

```text
packQuantity = null
```

Legacy cake types:

if no base price is configured, do not fabricate a price.

Surface:

```text
Setup required
```

in Admin.

Do not show misleading customer prices.

---

# 77. REMOVE DUPLICATED AUTHORITATIVE LOGIC

Search entire repo for:

```text
taxRateBps
taxDelivery
subtotal * tax
deliveryZones
delivery fee
cakeRecommendations
leadTime
preparationHours
```

Consolidate authoritative logic into domain services.

Do not leave old and new calculators active simultaneously.

---

# 78. PRODUCTION DOMAIN

Customer-facing URLs must resolve to:

`https://www.ndeelicious.com`

Audit:

```text
quote links
emails
invoices
receipts
marketing exports
metadata
OpenGraph
tracking links
```

No localhost/preview-domain leakage.

---

# 79. QUALITY GATES

Use actual package scripts.

At minimum:

```bash
npm run quality
npm run test:css
npm run test:regression
npm run test:functional
npm run test:db:local
npm run typecheck
npm run build
npm run test:e2e
```

If environment-gated tests cannot run, state exactly why.

Do not invent commands.

---

# 80. REQUIRED FINAL CUSTOMER JOURNEYS

## A. Budget → Custom Cake

```text
Shop
→ enter budget
→ Find options
→ custom cake suggestion appears
→ cake type shown
→ starting/exact price shown
→ lead time shown
→ Customize
→ correct cake type preselected
→ compatible options preselected
→ builder price correct
```

## B. HRM Delivery

```text
Cart
→ Delivery
→ B3H postal code
→ Halifax area resolves
→ fee/minimum/free threshold correct
→ valid fulfilment date
→ review
→ Stripe
```

## C. Outside HRM

```text
postal code outside configured HRM coverage
→ delivery blocked
→ pickup offered
```

## D. Made-to-Order Pack

```text
product
→ Pack 3 / 6 / 12
→ variant price
→ prep time
→ cart
→ Budget Match
→ tax
→ checkout
```

## E. Cake Lead Time

```text
Wedding Cake
→ configured base price
→ configured option set
→ lead time
→ earliest date
→ quote/request
```

## F. Mixed Tax Basket

```text
taxable item
+ zero-rated item
→ correct line tax
→ correct HST total
→ correct invoice/receipt
```

---

# 81. FINAL REPORT FORMAT

Only after implementation.

## Branch state

```text
source
destination
final SHA
```

## Migrations

```text
created
applied
verified
pending
```

## Implemented

Concise factual list.

## Budget Match

State:

```text
custom cake recommendation logic
cake-type awareness
exact vs starting-from behavior
builder prefill verification
mobile verification
```

## Fulfilment

State:

```text
HRM postal resolution
fees
minimums
free delivery
schedule
pickup
```

## Tax

State:

```text
line-level calculator
tax classes
pack-aware rules
delivery tax
snapshots
```

## Tests

Actual commands and results.

## Browser verification

Actual tested viewport sizes.

## External blockers

Only genuine blockers.

## Remaining defects

Concrete defects only.

## Production readiness

Choose exactly one:

```text
READY
READY WITH LIMITATIONS
NOT READY
```

Justify with evidence.

---

# 82. DEFINITION OF DONE

The feature set is done only when:

## Owner

She can:

```text
configure HRM delivery areas
configure FSA coverage
set fees/minimums/free-delivery thresholds
set delivery days/cutoffs
set pickup rules
set cake type base prices
set cake type lead times
assign cake options to cake types
create real 3/6/12 pack variants
set preparation time
classify products for tax
```

without code changes.

## Customer

They can:

```text
enter budget
see relevant ready-made products
see valid custom-cake builder suggestions
open a suggestion directly in the builder
see correct cake lead time
choose product pack
enter HRM postal code
see correct delivery fee
see earliest valid fulfilment
see correct HST
complete Stripe checkout
```

on mobile and desktop.

## Backend

It must enforce:

```text
cake compatibility
cake lead time
cake pricing
pack quantity
delivery coverage
delivery pricing
schedule/cutoff
tax treatment
order snapshots
```

independently of browser input.

Anything less is incomplete.
