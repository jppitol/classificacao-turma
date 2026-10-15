-- Imita o mínimo do Supabase para testar localmente (NÃO rodar no Supabase)
create role anon nologin;
create role authenticated nologin;
create role supabase_auth_admin nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, supabase_auth_admin;
grant usage on schema public to anon, authenticated, supabase_auth_admin;
