-- =====================================================================
-- Defektų aktai – duomenų bazės schema (Supabase / PostgreSQL)
-- Paleiskite visą failą: Supabase → SQL Editor → New query → Run
-- Failas idempotentiškas: galima paleisti pakartotinai (ir senai bazei atnaujinti).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Profiliai ir rolės ----------
-- Pirma sukurta paskyra tampa administratoriumi (role = 'admin'), kitos – 'user'.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'user' check (role in ('admin','user')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when exists (select 1 from public.profiles) then 'user' else 'admin' end)
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- esamos paskyros (seniausia – admin)
insert into public.profiles (id, email, role)
select id, email,
       case when id = (select id from auth.users order by created_at limit 1) then 'admin' else 'user' end
from auth.users
on conflict (id) do nothing;

create or replace function public.guard_profile_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Tik administratorius gali keisti roles';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

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

-- Neatikčių aktai (rangovų darbų neatitiktys)
alter table public.tasks add column if not exists kind       text not null default 'defect';  -- defect | nonconformity
alter table public.tasks add column if not exists contractor text;                            -- rangovas
alter table public.tasks add column if not exists nc_act     jsonb;                           -- neatikties aktas

-- Priskyrimas: sukūrusi paskyra automatiškai tampa atsakinga (admin gali perskirti)
alter table public.tasks add column if not exists assigned_to uuid references auth.users(id) on delete set null default auth.uid();
alter table public.tasks add column if not exists created_by  uuid references auth.users(id) on delete set null default auth.uid();

update public.tasks
set assigned_to = coalesce(assigned_to, (select id from public.profiles where role = 'admin' order by created_at limit 1)),
    created_by  = coalesce(created_by,  (select id from public.profiles where role = 'admin' order by created_at limit 1))
where assigned_to is null or created_by is null;

create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_created_idx on public.tasks (created_at desc);
create index if not exists tasks_assigned_idx on public.tasks (assigned_to);

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

-- ---------- Nustatymai: kiekvienai paskyrai savi ----------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data    jsonb not null default '{}'::jsonb
);

-- senos (bendros) lentelės `settings` duomenys perkeliami admin paskyrai
do $$
begin
  if to_regclass('public.settings') is not null then
    insert into public.user_settings (user_id, data)
    select (select id from public.profiles where role = 'admin' order by created_at limit 1), s.data
    from public.settings s
    where s.id = 1 and exists (select 1 from public.profiles where role = 'admin')
    on conflict (user_id) do nothing;
    drop policy if exists "auth all settings" on public.settings;
  end if;
end $$;

-- ---------- updated_at ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ---------- Saugumas (RLS) ----------
alter table public.profiles      enable row level security;
alter table public.tasks         enable row level security;
alter table public.photos        enable row level security;
alter table public.user_settings enable row level security;

-- profiliai: kiekvienas mato save, admin – visus
drop policy if exists "profiles select" on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles select" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles update" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- užduotys: tik priskirtos paskyrai; admin mato ir skirsto visas
drop policy if exists "auth all tasks" on public.tasks;
drop policy if exists "tasks select" on public.tasks;
drop policy if exists "tasks insert" on public.tasks;
drop policy if exists "tasks update" on public.tasks;
drop policy if exists "tasks delete" on public.tasks;
create policy "tasks select" on public.tasks
  for select to authenticated using (assigned_to = auth.uid() or public.is_admin());
create policy "tasks insert" on public.tasks
  for insert to authenticated
  with check (created_by = auth.uid() and (assigned_to = auth.uid() or public.is_admin()));
create policy "tasks update" on public.tasks
  for update to authenticated using (assigned_to = auth.uid() or public.is_admin())
  with check (assigned_to = auth.uid() or public.is_admin());
create policy "tasks delete" on public.tasks
  for delete to authenticated using (assigned_to = auth.uid() or public.is_admin());

-- nuotraukos: matomos tik su matoma užduotimi
drop policy if exists "auth all photos" on public.photos;
drop policy if exists "photos via task" on public.photos;
create policy "photos via task" on public.photos
  for all to authenticated
  using (exists (select 1 from public.tasks t where t.id = photos.task_id))
  with check (exists (select 1 from public.tasks t where t.id = photos.task_id));

-- nustatymai: tik savi
drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Nuotraukų saugykla (privati; aplanko pavadinimas = užduoties id) ----------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "auth read photos"   on storage.objects;
drop policy if exists "auth write photos"  on storage.objects;
drop policy if exists "auth update photos" on storage.objects;
drop policy if exists "auth delete photos" on storage.objects;
drop policy if exists "photos read via task"   on storage.objects;
drop policy if exists "photos write via task"  on storage.objects;
drop policy if exists "photos update via task" on storage.objects;
drop policy if exists "photos delete via task" on storage.objects;

create policy "photos read via task" on storage.objects
  for select to authenticated using (bucket_id = 'photos' and exists
    (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1]));
create policy "photos write via task" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and exists
    (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1]));
create policy "photos update via task" on storage.objects
  for update to authenticated using (bucket_id = 'photos' and exists
    (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1]));
create policy "photos delete via task" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and exists
    (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1]));

-- ---------- DI išmoktos taisyklės (savos kiekvienai paskyrai) ----------
create table if not exists public.ai_lessons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null default 'defect' check (kind in ('defect','nonconformity')),
  text        text not null,
  active      boolean not null default true,
  source_task uuid references public.tasks(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists ai_lessons_user_idx on public.ai_lessons (user_id, kind);

alter table public.ai_lessons enable row level security;
drop policy if exists "lessons select" on public.ai_lessons;
drop policy if exists "lessons insert" on public.ai_lessons;
drop policy if exists "lessons update" on public.ai_lessons;
drop policy if exists "lessons delete" on public.ai_lessons;
create policy "lessons select" on public.ai_lessons
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "lessons insert" on public.ai_lessons
  for insert to authenticated with check (user_id = auth.uid());
create policy "lessons update" on public.ai_lessons
  for update to authenticated using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy "lessons delete" on public.ai_lessons
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- ---------- Objektai (pastatai) ir laiptinių kodai ----------
create table if not exists public.objects (
  id           uuid primary key default gen_random_uuid(),
  address      text not null unique,          -- „Gatvė  NR, Miestas“ (vienas tarpas)
  city         text,
  street       text,
  house        text,
  street_key   text,                          -- normalizuotas paieškai
  house_key    text,
  manager      text,                          -- PA vadybininkas
  project      text,                          -- projektas / įmonė
  apartments   int,
  construction text,                          -- konstruktyvas (blokinis / plytinis ...)
  stairwells   int,
  usable_area  numeric,
  area         numeric,
  basement_area numeric,
  renovation   text,
  built_year   int,
  roof_condition text,
  roof_cover   text,
  roof_area    numeric,
  roof_type    text,
  heat_point   text,
  floors       int,                           -- aukštų skaičius
  created_at   timestamptz not null default now()
);
alter table public.objects add column if not exists floors int;
create index if not exists objects_key_idx on public.objects (street_key, house_key);

create table if not exists public.stair_codes (
  id         uuid primary key default gen_random_uuid(),
  city       text,
  street     text,
  house      text,
  stairwell  text,
  code       text not null,
  street_key text,
  house_key  text
);
create index if not exists stair_codes_key_idx on public.stair_codes (street_key, house_key);

alter table public.objects     enable row level security;
alter table public.stair_codes enable row level security;

drop policy if exists "objects read" on public.objects;
drop policy if exists "objects admin write" on public.objects;
create policy "objects read" on public.objects for select to authenticated using (true);
create policy "objects admin write" on public.objects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "codes read" on public.stair_codes;
drop policy if exists "codes admin write" on public.stair_codes;
create policy "codes read" on public.stair_codes for select to authenticated using (true);
create policy "codes admin write" on public.stair_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- užduotys: objektas ir aprašymo išsamumas (narrow | medium | wide)
alter table public.tasks add column if not exists object_id uuid references public.objects(id) on delete set null;
alter table public.tasks add column if not exists act_detail text not null default 'medium';
do $$ begin
  alter table public.tasks add constraint tasks_act_detail_chk check (act_detail in ('narrow','medium','wide'));
exception when duplicate_object then null; end $$;

-- ---------- Pranešimai (importuojami; užduotys susiejamos per registracijos Nr.) ----------
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  reg_no        text not null unique,          -- Registracijos nr., pvz. V26-0332167
  registered_at timestamptz,
  address       text,
  city          text,
  report_type   text,
  department    text,
  service_type  text,
  description   text,
  status        text,
  priority_code text,
  engineer      text,
  manager       text,
  order_type    text,
  apartment     text,
  work_label    text,
  act_type      text,                          -- prašomas aktas
  reporter      text,
  contact       text,
  contact_name  text,                         -- kontaktinis asmuo (gyventojas)
  stairwell     text,                         -- laiptinė (iš pranešimo)
  property_type text,
  assigned_to   uuid references auth.users(id) on delete set null,
  imported_at   timestamptz not null default now()
);
alter table public.reports add column if not exists contact_name text;
alter table public.reports add column if not exists stairwell text;
create index if not exists reports_assigned_idx on public.reports (assigned_to);

alter table public.reports enable row level security;
drop policy if exists "reports read" on public.reports;
drop policy if exists "reports admin write" on public.reports;
create policy "reports read" on public.reports
  for select to authenticated using (assigned_to = auth.uid() or public.is_admin());
create policy "reports admin write" on public.reports
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.tasks add column if not exists report_no text;
create index if not exists tasks_report_idx on public.tasks (report_no);

-- ---------- Paskyros aktyvavimas ----------
-- Nauja paskyra (registracija / Add user) neturi prieigos prie duomenų, kol admin jos neaktyvuoja
-- (Nustatymai → Paskyros → „aktyvi“). Pirma paskyra – aktyvus admin.
alter table public.profiles add column if not exists active boolean not null default false;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;
revoke all on function public.is_active() from public, anon;
grant execute on function public.is_active() to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active)
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean := not exists (select 1 from public.profiles);
begin
  insert into public.profiles (id, email, role, active)
  values (new.id, new.email, case when first_user then 'admin' else 'user' end, first_user)
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.guard_profile_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active) and not public.is_admin() then
    raise exception 'Tik administratorius gali keisti rolę ir aktyvavimą';
  end if;
  return new;
end $$;

drop policy if exists "tasks select" on public.tasks;
drop policy if exists "tasks insert" on public.tasks;
drop policy if exists "tasks update" on public.tasks;
drop policy if exists "tasks delete" on public.tasks;
create policy "tasks select" on public.tasks for select to authenticated
  using (public.is_active() and (assigned_to = auth.uid() or public.is_admin()));
create policy "tasks insert" on public.tasks for insert to authenticated
  with check (public.is_active() and created_by = auth.uid() and (assigned_to = auth.uid() or public.is_admin()));
create policy "tasks update" on public.tasks for update to authenticated
  using (public.is_active() and (assigned_to = auth.uid() or public.is_admin()))
  with check (public.is_active() and (assigned_to = auth.uid() or public.is_admin()));
create policy "tasks delete" on public.tasks for delete to authenticated
  using (public.is_active() and (assigned_to = auth.uid() or public.is_admin()));

drop policy if exists "objects read" on public.objects;
create policy "objects read" on public.objects for select to authenticated using (public.is_active());
drop policy if exists "codes read" on public.stair_codes;
create policy "codes read" on public.stair_codes for select to authenticated using (public.is_active());

drop policy if exists "reports read" on public.reports;
create policy "reports read" on public.reports for select to authenticated
  using (public.is_active() and (assigned_to = auth.uid() or public.is_admin()));

drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings for all to authenticated
  using (public.is_active() and user_id = auth.uid()) with check (public.is_active() and user_id = auth.uid());

drop policy if exists "lessons select" on public.ai_lessons;
drop policy if exists "lessons insert" on public.ai_lessons;
drop policy if exists "lessons update" on public.ai_lessons;
drop policy if exists "lessons delete" on public.ai_lessons;
create policy "lessons select" on public.ai_lessons for select to authenticated
  using (public.is_active() and (user_id = auth.uid() or public.is_admin()));
create policy "lessons insert" on public.ai_lessons for insert to authenticated
  with check (public.is_active() and user_id = auth.uid());
create policy "lessons update" on public.ai_lessons for update to authenticated
  using (public.is_active() and (user_id = auth.uid() or public.is_admin()))
  with check (public.is_active() and (user_id = auth.uid() or public.is_admin()));
create policy "lessons delete" on public.ai_lessons for delete to authenticated
  using (public.is_active() and (user_id = auth.uid() or public.is_admin()));

-- ---------- Metinė (kasmetinė) apžiūra ----------
-- tasks.kind = 'annual'; aktas – annual_act (jsonb); nuotraukos susiejamos su elementu per photos.ref
alter table public.tasks  add column if not exists annual_act jsonb;
alter table public.photos add column if not exists ref text;
create index if not exists tasks_object_kind_idx on public.tasks (object_id, kind);