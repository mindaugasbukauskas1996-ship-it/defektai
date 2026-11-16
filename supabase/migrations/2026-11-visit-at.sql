-- Vizito su gyventoju laikas (kalendorius)
alter table public.tasks add column if not exists visit_at timestamptz;
create index if not exists tasks_visit_at_idx on public.tasks (visit_at) where visit_at is not null;

