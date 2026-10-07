Cake requests now require an active owner-configured cake type. Apply migrations
0030 and 0031 with the application release: 0030 adds the type table, constraints
and immutable submission snapshot; 0031 adds catalogue shopping modes and an
order preparation deadline. These migrations have been validated in a local
PostgreSQL engine, but have not been applied to the configured Supabase database.

No example timings are published. Before reopening custom cake requests, use
Custom Cakes → Configuration → Cake types & lead times to create and activate
appropriate types. Date-only requests use the bakery calendar date at the
preparation deadline; collection times remain subject to bakery confirmation.

Product editing supports Ready to Order, Made to Order and Ready to Bake, with
separate preparation hours. “Add 3 / 6 / 12 packs” creates inactive variants;
set each pack's price adjustment and activate the packs you sell. Variant price
is the product's current sale/base price plus its adjustment. Products produced
on demand can disable inventory tracking. Configure storage and preparation
instructions for Ready to Bake products.

Budget matching uses active, purchasable variants and shows their complete pack
price. Tax and delivery are excluded from the displayed budget. Checkout applies
the configured server tax rate once; 14% HST is 1400 basis points. No additional
GST is added. Product preparation windows are saved on orders and enforced when
operations try to mark an order ready or fulfilled.

The fixture browser commands and screenshot locations are in e2e/README.md.

Run `npm run test:db:local` to validate migrations, lead-time constraints, snapshots,
and preparation deadlines without a network database.
