insert into public.site_settings (key, value)
select
  'carousel',
  jsonb_build_object(
    'enabled', true,
    'eyebrow', 'From our kitchen',
    'headline', 'Today''s favourites',
    'body', 'Browse a few of our most-loved bakes, made fresh for every celebration.',
    'productIds', coalesce(
      (
        select jsonb_agg(chosen.id order by chosen.featured desc, chosen.created_at desc)
        from (
          select id, featured, created_at
          from public.products
          where status = 'ACTIVE'
          order by featured desc, created_at desc
          limit 8
        ) chosen
      ),
      '[]'::jsonb
    ),
    'style', 'editorial',
    'autoplay', true,
    'intervalMs', 6000,
    'loop', true,
    'showPrices', true,
    'showAddToCart', true,
    'social', jsonb_build_object(
      'headline', 'Made fresh for you',
      'callToAction', 'Order online',
      'websiteUrl', '',
      'format', 'portrait',
      'template', 'berry',
      'showLogo', true,
      'showPrice', true
    )
  )
on conflict (key) do nothing;
