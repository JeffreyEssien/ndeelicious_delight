-- Rollback-only integration checks for migration 0010.
begin;

do $$
declare
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_category uuid;
  v_product uuid;
  v_variant uuid;
  v_customer uuid;
  v_order uuid;
  v_order_number text;
  v_session text;
  v_result jsonb;
  v_stock integer;
begin
  insert into public.categories(name, slug)
  values ('G07 payment test', 'g07-category-' || v_suffix)
  returning id into v_category;

  insert into public.products(
    category_id, name, slug, short_description, description, base_price,
    status, track_inventory, stock_quantity
  ) values (
    v_category, 'G07 product', 'g07-product-' || v_suffix, 'Test', 'Test', 250000,
    'ACTIVE', true, 3
  ) returning id into v_product;

  insert into public.product_variants(product_id, name, stock_quantity)
  values (v_product, 'Standard', 3)
  returning id into v_variant;

  insert into public.customers(email, name, phone)
  values ('g07-' || v_suffix || '@example.com', 'Payment Test', '08000000000')
  returning id into v_customer;

  v_order_number := 'G07-' || left(v_suffix, 12);
  v_session := 'cs_test_' || v_suffix;
  insert into public.orders(
    order_number, customer_id, customer_name, email, phone, fulfilment,
    subtotal, discount_total, delivery_fee, grand_total
  ) values (
    v_order_number, v_customer, 'Payment Test', 'g07-' || v_suffix || '@example.com',
    '08000000000', 'pickup', 250000, 0, 0, 250000
  ) returning id into v_order;

  insert into public.order_items(
    order_id, product_id, variant_id, product_name, variant_name,
    unit_price, quantity, final_price
  ) values (v_order, v_product, v_variant, 'G07 product', 'Standard', 250000, 1, 250000);

  perform public.reserve_order_inventory(v_order, 60);
  insert into public.payments(order_id, provider_payment_id, amount, currency, idempotency_key)
  values (v_order, v_session, 250000, 'NGN', 'g07:' || v_suffix);

  begin
    perform public.process_stripe_checkout_event(
      'evt_bad_' || v_suffix, 'checkout.session.completed', v_session,
      'pi_bad', 'paid', 1, 'ngn', '{}'::jsonb
    );
    raise exception 'amount mismatch was accepted';
  exception
    when others then
      if sqlerrm not like '%PAYMENT_AMOUNT_MISMATCH%' then
        raise;
      end if;
  end;

  select public.process_stripe_checkout_event(
    'evt_paid_' || v_suffix, 'checkout.session.completed', v_session,
    'pi_paid', 'paid', 250000, 'ngn', '{}'::jsonb
  ) into v_result;
  if not coalesce((v_result ->> 'becamePaid')::boolean, false) then
    raise exception 'paid event did not transition the order';
  end if;

  select stock_quantity into v_stock from public.products where id = v_product;
  if v_stock <> 2 then
    raise exception 'inventory was not deducted exactly once';
  end if;
  if not exists (select 1 from public.orders where id = v_order and status = 'PAID') then
    raise exception 'order was not marked paid';
  end if;
  if not exists (select 1 from public.payments where order_id = v_order and status = 'SUCCEEDED') then
    raise exception 'payment was not marked succeeded';
  end if;

  select public.process_stripe_checkout_event(
    'evt_paid_' || v_suffix, 'checkout.session.completed', v_session,
    'pi_paid', 'paid', 250000, 'ngn', '{}'::jsonb
  ) into v_result;
  if coalesce((v_result ->> 'processed')::boolean, true) then
    raise exception 'duplicate webhook was not ignored';
  end if;
  select stock_quantity into v_stock from public.products where id = v_product;
  if v_stock <> 2 then
    raise exception 'duplicate webhook changed inventory';
  end if;
end;
$$;

rollback;
