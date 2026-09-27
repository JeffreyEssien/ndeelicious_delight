-- Marketing exports are independent from homepage carousel merchandising.
insert into public.site_settings (key, value)
select
  'marketing',
  jsonb_build_object(
    'headline', coalesce(value #>> '{social,headline}', 'Made fresh for you'),
    'callToAction', coalesce(value #>> '{social,callToAction}', 'Order online'),
    'websiteUrl', coalesce(value #>> '{social,websiteUrl}', ''),
    'format', coalesce(value #>> '{social,format}', 'portrait'),
    'template', case when value #>> '{social,template}' = 'berry' then 'brand' else coalesce(value #>> '{social,template}', 'brand') end,
    'showLogo', coalesce((value #>> '{social,showLogo}')::boolean, true),
    'showPrice', coalesce((value #>> '{social,showPrice}')::boolean, true),
    'showSafeZone', true,
    'logoUrl', '/WhatsApp Image 2026-09-15 at 22.16.43.jpeg',
    'productIds', coalesce(value -> 'productIds', '[]'::jsonb)
  )
from public.site_settings
where key = 'carousel'
on conflict (key) do nothing;
