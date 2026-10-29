-- =====================================================================
-- Defektų aktai – duomenų bazės schema (Supabase / PostgreSQL)
-- Paleiskite visą failą: Supabase → SQL Editor → New query → Run
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Užduotys ----------
create table if not exists public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  status             text not null default 'nauja',      -- nauja | planuota | apziureta | aktas | baigta
  priority           text not null default 'iprastas',   -- skubus | iprastas | zemas
  service_type       text,
  address            text not null default '',
  city               text,
  apartment          text,
  stairwell          text,                               -- laiptinė
  entry_code         text,                               -- laiptinės / durų kodas
  contact_name       text,
  contact_phone      text,
  problem            text,                               -- trumpas problemos aprašas
  description        text,                               -- pilnas pranešimo tekstas
  manager            text,                               -- pastatų administravimo vadybininkas
  due_date           date,
  inspection_date    date,
  inspection_purpose text default 'Neeilinė',
  field_notes        text,                               -- inžinieriaus aprašymas vietoje
  act_mode           text default 'defect',              -- defect | full
  act_number         text,
  act_date           date,
  ai_questions       jsonb not null default '[]'::jsonb,
  defect_act         jsonb,
  works_act          jsonb,
  ai_assumptions     jsonb not null default '[]'::jsonb,
  act_generated_at   timestamptz
);

create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_created_idx on public.tasks (created_at desc);

-- ---------- Nuotraukos ----------
create table if not exists public.photos (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references public.tasks(id) on delete cascade,
  created_at      timestamptz not null default now(),
  path            text not null,          -- originalas saugykloje
  annotated_path  text,                   -- pažymėta versija
  annotations     jsonb not null default '[]'::jsonb,
  caption         text,
  sort            int not null default 0,
  include_in_act  boolean not null default true,
  width           int,
  height          int
);

create index if not exists photos_task_idx on public.photos (task_id, sort);

-- ---------- Nustatymai (viena eilutė) ----------
create table if not exists public.settings (
  id    int primary key default 1 check (id = 1),
  data  jsonb not null default '{}'::jsonb
);
insert into public.settings (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- ---------- updated_at ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ---------- Saugumas (RLS): tik prisijungę vartotojai ----------
alter table public.tasks    enable row level security;
alter table public.photos   enable row level security;
alter table public.settings enable row level security;

drop policy if exists "auth all tasks" on public.tasks;
create policy "auth all tasks" on public.tasks
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all photos" on public.photos;
create policy "auth all photos" on public.photos
  for all to authenticated using (true) with check (true);

drop policy if exists "auth all settings" on public.settings;
create policy "auth all settings" on public.settings
  for all to authenticated using (true) with check (true);

-- ---------- Nuotraukų saugykla (privati) ----------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "auth read photos"   on storage.objects;
drop policy if exists "auth write photos"  on storage.objects;
drop policy if exists "auth update photos" on storage.objects;
drop policy if exists "auth delete photos" on storage.objects;

create policy "auth read photos" on storage.objects
  for select to authenticated using (bucket_id = 'photos');
create policy "auth write photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');
create policy "auth update photos" on storage.objects
  for update to authenticated using (bucket_id = 'photos');
create policy "auth delete photos" on storage.objects
  for delete to authenticated using (bucket_id = 'photos');
