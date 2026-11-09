-- The cake builder is gone. Drop any saved wording for it so it no longer appears in the
-- customer wording editor. Other saved wording is untouched.
begin;
update public.site_settings
set value = value #- '{customerText,cake builder}', updated_at = now()
where key = 'content' and value #> '{customerText}' ? 'cake builder';
commit;
