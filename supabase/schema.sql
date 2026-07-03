-- Hudut Şantiye Yönetim Sistemi v4.0 - Tam Bulut Schema

create table if not exists public.progress (
  id text primary key,
  project_id text not null default 'hudut',
  stage_id text not null,
  work_type text not null,
  total numeric not null default 0,
  done numeric not null default 0,
  unit text not null,
  updated_at timestamptz default now()
);

create table if not exists public.production (
  id text primary key,
  project_id text not null default 'hudut',
  date date not null,
  count numeric not null default 0,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.settings (
  id text primary key,
  project_id text not null default 'hudut',
  value_json jsonb,
  value_text text,
  updated_at timestamptz default now()
);

create table if not exists public.photos (
  id text primary key,
  project_id text not null default 'hudut',
  stage_id text not null,
  km text not null,
  work_type text not null,
  note text,
  point_id text,
  point_name text,
  point_lat double precision,
  point_lng double precision,
  image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.progress disable row level security;
alter table public.production disable row level security;
alter table public.settings disable row level security;
alter table public.photos disable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.progress to anon, authenticated;
grant select, insert, update, delete on public.production to anon, authenticated;
grant select, insert, update, delete on public.settings to anon, authenticated;
grant select, insert, update, delete on public.photos to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('site-photos', 'site-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "site photos read" on storage.objects;
drop policy if exists "site photos insert" on storage.objects;
drop policy if exists "site photos update" on storage.objects;
drop policy if exists "site photos delete" on storage.objects;

create policy "site photos read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'site-photos');

create policy "site photos insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'site-photos');

create policy "site photos update"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'site-photos')
with check (bucket_id = 'site-photos');

create policy "site photos delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'site-photos');


-- Ek API izinleri
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
