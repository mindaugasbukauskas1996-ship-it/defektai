-- Šilumininkui pažymėjus, kad name yra daugiau nei vienas ŠP, automatiškai sukuriamas antras (jei jo dar nėra).
-- Šilumininkas negali kurti ŠP tiesiogiai (insert politika tik admin), todėl – saugi funkcija.
create or replace function public.ensure_second_hp(p_hp uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare h public.heat_points; n int; nid uuid; nseq int;
begin
  select * into h from public.heat_points where id = p_hp;
  if h.id is null then raise exception 'Šilumos punktas nerastas'; end if;
  if not (public.is_active() and (h.assigned_to = auth.uid() or public.is_admin())) then
    raise exception 'Nepakanka teisių';
  end if;
  select count(*), coalesce(max(seq), 0) into n, nseq from public.heat_points
   where (h.object_id is not null and object_id = h.object_id)
      or (h.object_id is null and object_id is null and address = h.address);
  if n >= 2 then return null; end if;                     -- antras jau yra
  insert into public.heat_points (object_id, seq, address, city, registry_type, assigned_to)
  values (h.object_id, nseq + 1, h.address, h.city, h.registry_type, h.assigned_to)
  returning id into nid;
  perform public.notify_admins('hp_new', null, nid, 'Šilumininkas sukūrė antrą šilumos punktą: ' || coalesce(h.address, ''));
  return nid;
end $$;
revoke all on function public.ensure_second_hp(uuid) from public, anon;
grant execute on function public.ensure_second_hp(uuid) to authenticated;
