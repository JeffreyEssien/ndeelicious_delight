update public.site_settings
set value = jsonb_set(
  value,
  '{social}',
  jsonb_build_object(
    'headline', 'Made fresh for you',
    'callToAction', 'Order online',
    'websiteUrl', '',
    'format', 'portrait',
    'template', 'berry',
    'showLogo', true,
    'showPrice', true
  ),
  true
),
updated_at = timezone('utc', now())
where key = 'carousel'
  and not (value ? 'social');
