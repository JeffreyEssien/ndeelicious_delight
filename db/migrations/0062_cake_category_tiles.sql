-- The homepage cake section is now a grid of cake sub-categories whose photos rotate through
-- their cakes. Replace the old builder copy only where the owner never changed it, and drop
-- the steps and photo the section no longer uses.
begin;
update public.site_settings
set value = jsonb_set(value, '{home,cakeFeature,eyebrow}', '"Our cakes"'::jsonb), updated_at = now()
where key = 'content' and value #>> '{home,cakeFeature,eyebrow}' = 'Yours, in cake form';

update public.site_settings
set value = jsonb_set(value, '{home,cakeFeature,headline}', '"A cake for every occasion"'::jsonb), updated_at = now()
where key = 'content'
  and value #>> '{home,cakeFeature,headline}' = 'A centrepiece that tastes as good as it looks.';

update public.site_settings
set value = jsonb_set(value, '{home,cakeFeature,body}', '""'::jsonb), updated_at = now()
where key = 'content' and value #>> '{home,cakeFeature,body}' like '%guided builder%';

update public.site_settings
set value = jsonb_set(value, '{home,cakeFeature,buttonLabel}', '"See all cakes"'::jsonb), updated_at = now()
where key = 'content' and value #>> '{home,cakeFeature,buttonLabel}' = 'Start your cake';

update public.site_settings
set value = value #- '{home,cakeFeature,steps}' #- '{home,cakeFeature,image}' #- '{home,cakeFeature,imageAlt}',
  updated_at = now()
where key = 'content' and value #> '{home,cakeFeature}' is not null;
commit;
