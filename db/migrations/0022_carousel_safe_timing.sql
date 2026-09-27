update public.site_settings
set value = jsonb_set(value, '{intervalMs}', '6000'::jsonb, true),
    updated_at = timezone('utc', now())
where key = 'carousel'
  and coalesce((value->>'intervalMs')::integer, 6000) < 6000;
