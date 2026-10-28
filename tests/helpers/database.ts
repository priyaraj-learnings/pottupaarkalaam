import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { PGlite } from '@electric-sql/pglite'

// An in-memory Postgres (PGlite) with every migration applied and the few
// Supabase objects they use (auth.users, storage.buckets, the API roles)
// stubbed, so credit, recharge and report rules are tested in SQL.
const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}',
  raw_app_meta_data jsonb not null default '{}',
  last_sign_in_at timestamptz
);
create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
`

export async function freshDatabase() {
  const db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  const dir = join(__dirname, '..', '..', 'supabase', 'migrations')
  for (const file of readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, file), 'utf8'))
  }
  return db
}
