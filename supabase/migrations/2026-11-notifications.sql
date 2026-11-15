-- Pranešimai programoje: paskyrimai ir būsenų pokyčiai (užpildo trigeriai, klientas tik skaito / pažymi perskaitytus)
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,                       -- assigned | task_status | hp_assigned | hp_submitted
  task_id    uuid references public.tasks(id) on delete cascade,
  hp_id      uuid references public.heat_points(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, read_at, created_at desc);
alter table public.notifications enable row level security;

drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select to authenticated
  using (user_id = auth.uid() and public.is_active());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated
  using (user_id = auth.uid() and public.is_active()) with check (user_id = auth.uid());
drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid() and public.is_active());

create or replace function public.notify_admins(p_kind text, p_task uuid, p_hp uuid, p_text text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, task_id, hp_id, text)
  select id, p_kind, p_task, p_hp, p_text from public.profiles
  where role = 'admin' and active and id is distinct from auth.uid();
$$;
revoke all on function public.notify_admins(text, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.trg_notify_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare lbl text;
begin
  lbl := coalesce(nullif(new.address, ''), 'užduotis') || coalesce(', ' || nullif(new.apartment, '') || ' butas', '');
  if new.assigned_to is not null and new.assigned_to is distinct from auth.uid()
     and (tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    insert into public.notifications (user_id, kind, task_id, text)
    values (new.assigned_to, 'assigned', new.id, 'Jums paskirta užduotis: ' || lbl);
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('aktas', 'baigta') then
    perform public.notify_admins('task_status', new.id, null,
      case new.status when 'aktas' then 'Aktas paruoštas: ' else 'Užduotis baigta: ' end || lbl);
  end if;
  return null;
end $$;
drop trigger if exists notify_task on public.tasks;
create trigger notify_task after insert or update of assigned_to, status on public.tasks
  for each row execute function public.trg_notify_task();

create or replace function public.trg_notify_hp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null and new.assigned_to is distinct from auth.uid()
     and (tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    insert into public.notifications (user_id, kind, hp_id, text)
    values (new.assigned_to, 'hp_assigned', new.id, 'Jums paskirtas šilumos punktas: ' || coalesce(new.address, ''));
  end if;
  if tg_op = 'UPDATE' and new.status = 'pateikta' and old.status is distinct from 'pateikta' then
    perform public.notify_admins('hp_submitted', null, new.id, 'Šilumininkas pateikė ŠP: ' || coalesce(new.address, ''));
  end if;
  if tg_op = 'UPDATE' and new.status = 'grazinta' and old.status is distinct from 'grazinta' and new.assigned_to is not null
     and new.assigned_to is distinct from auth.uid() then
    insert into public.notifications (user_id, kind, hp_id, text)
    values (new.assigned_to, 'hp_assigned', new.id, 'ŠP grąžintas taisyti: ' || coalesce(new.address, ''));
  end if;
  return null;
end $$;
drop trigger if exists notify_hp on public.heat_points;
create trigger notify_hp after insert or update of assigned_to, status on public.heat_points
  for each row execute function public.trg_notify_hp();
