-- Add fields introduced after the initial content seed without replacing content
-- already customized through the admin portal.
update public.site_settings
set
  value = jsonb_set(
    jsonb_set(
      value,
      '{headers,pastries}',
      coalesce(
        value #> '{headers,pastries}',
        '{"eyebrow":"Baked fresh","headline":"Morning pastries.","supportingText":"Buttery layers and flavours drawn from the live bakery catalogue."}'::jsonb
      ),
      true
    ),
    '{orderSuccess}',
    coalesce(
      value #> '{orderSuccess}',
      '{"eyebrow":"Payment received","headline":"Your order is looking lovely.","body":"Thank you! Your payment went through and your order is confirmed.","steps":[{"title":"Receipt on its way","body":"Your receipt will arrive by email."},{"title":"We begin preparing","body":"The bakery confirms your fulfilment window."},{"title":"Follow every update","body":"Track progress with your order number."}]}'::jsonb
    ),
    true
  ),
  updated_at = now()
where key = 'content';
