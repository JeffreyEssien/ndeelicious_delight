-- Private customer inspiration images for custom cake requests.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cake-reference-images',
  'cake-reference-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The application uploads and signs these objects with the service role. No public
-- storage.object policy is created, so browser clients cannot enumerate or read them.
