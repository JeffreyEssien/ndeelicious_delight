-- The order success page only shows this copy once Stripe has confirmed payment, so the
-- original default ("awaiting payment confirmation") contradicted it. Replace the default
-- wording only; copy the owner has already edited is left alone.
update public.site_settings
set value = jsonb_set(
    jsonb_set(
      jsonb_set(
        value,
        '{orderSuccess,eyebrow}',
        to_jsonb('Payment received'::text)
      ),
      '{orderSuccess,body}',
      to_jsonb('Thank you! Your payment went through and your order is confirmed.'::text)
    ),
    '{orderSuccess,steps,0}',
    '{"title":"Receipt on its way","body":"Your receipt will arrive by email."}'::jsonb
  ),
  updated_at = now()
where key = 'content'
  and value #>> '{orderSuccess,body}' = 'Your order has been saved and is awaiting payment confirmation.'
  and value #>> '{orderSuccess,steps,0,title}' = 'Payment confirmation';
