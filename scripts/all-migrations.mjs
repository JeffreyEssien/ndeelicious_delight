import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

/** A PGlite database with every migration applied in order, over minimal Supabase stand-ins. */
export async function migratedDatabase() {
  const db = new PGlite();
  const dir = new URL("../db/migrations/", import.meta.url);
  await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_storage_admin;
create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql as 'select null::uuid';
create function auth.role() returns text language sql as 'select null::text';
create function auth.jwt() returns jsonb language sql as 'select null::jsonb';
create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
create function storage.foldername(text) returns text[] language sql as 'select string_to_array($1,''/'')';`);
  for (const name of fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(fs.readFileSync(new URL(name, dir), "utf8").replace(/create extension[^;]*;/gi, ""));
  return db;
}
