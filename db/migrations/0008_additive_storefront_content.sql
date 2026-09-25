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
      '{"eyebrow":"Order received","headline":"Your order is looking lovely.","body":"Your order has been saved and is awaiting payment confirmation.","steps":[{"title":"Payment confirmation","body":"A receipt will be sent by email."},{"title":"We begin preparing","body":"The bakery confirms your fulfilment window."},{"title":"Follow every update","body":"Track progress with your order number."}]}'::jsonb
    ),
    true
  ),
  updated_at = now()
where key = 'content';
