-- The 24-hour lead time decides the earliest date a customer can choose. It should not stop the
-- kitchen from marking an order ready, out for delivery or delivered once it is actually done.
drop trigger if exists product_preparation_window on public.orders;
drop function if exists public.enforce_product_preparation();
