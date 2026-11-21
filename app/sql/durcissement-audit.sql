-- Durcissement issu de l'audit du 15/11/2026. À exécuter dans Supabase › SQL Editor (rejouable sans risque).

-- 1) Les fonctions admin sont déjà protégées DANS leur code (_admin_guard…), mais 18 restaient appelables
--    par le rôle anonyme via /rest/v1/rpc : on retire cet accès superflu (défense en profondeur).
do $$ declare r record; begin
  for r in select p.oid::regprocedure f from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
             and (p.proname like 'admin\_%' or p.proname like '\_admin\_%')
             and has_function_privilege('anon', p.oid, 'execute')
  loop execute 'revoke execute on function ' || r.f || ' from anon'; end loop;
end $$;

-- 2) Votes sur les signalements : aucune limite → 3 appels « deny » (avec 3 identifiants d'appareil inventés) suffisaient à
--    effacer n'importe quelle alerte danger. Limite par adresse IP (60 votes / heure).
create or replace function public.vote_report(p_id uuid, p_device text, p_vote text) returns void
language plpgsql security definer set search_path to '' as $f$
declare d int;
begin
  if p_vote not in ('confirm','deny') or p_device is null or char_length(p_device) not between 8 and 64 then
    raise exception 'invalid';
  end if;
  perform public.rl_hit('vr', 60, interval '1 hour');
  insert into public.report_votes (report_id, device_id, vote) values (p_id, p_device, p_vote)
  on conflict (report_id, device_id) do nothing;
  if not found then return; end if;
  update public.map_reports set
    confirms = confirms + (p_vote = 'confirm')::int,
    denies = denies + (p_vote = 'deny')::int,
    expires_at = case when kind = 'danger' and p_vote = 'confirm'
                      then least(expires_at + interval '2 hours', created_at + interval '48 hours')
                      else expires_at end
  where id = p_id
  returning denies into d;
  if p_vote = 'deny' and d >= 3 then
    delete from public.report_votes where report_id = p_id;
    delete from public.map_reports where id = p_id and kind = 'danger';
  end if;
end $f$;

-- 3) Création de signalements/balades : la limite existante est par appareil (identifiant que l'appelant choisit) → contournable.
--    On ajoute une limite par adresse IP (30 créations / heure).
do $$ declare src text; begin
  select prosrc into src from pg_proc where proname = 'map_reports_before_insert' and pronamespace = 'public'::regnamespace;
  if src not like '%rl_hit(''mr''%' then
    src := replace(src, 'perform public.purge_expired_reports();', 'perform public.rl_hit(''mr'', 30, interval ''1 hour'');' || chr(10) || '  perform public.purge_expired_reports();');
    -- 3 bis) Filtre de termes interdits (déjà utilisé pour les pseudos et les trajets publiés) sur titre, détails, lieu et organisateur des balades
    src := replace(src, 'declare n int;', 'declare n int; w text; v_all text;');
    src := replace(src, 'raise exception ''title_required''; end if;', 'raise exception ''title_required''; end if;' || chr(10) ||
      '    v_all := translate(lower(coalesce(new.title,'''') || '' '' || coalesce(new.description,'''') || '' '' || coalesce(new.place_name,'''') || '' '' || coalesce(new.organizer_name,'''')), ''àâäéèêëîïôöùûüç'', ''aaaeeeeiioouuuc'');' || chr(10) ||
      '    for w in select regexp_split_to_table(v_all, ''[^a-z0-9]+'') loop if char_length(w) >= 3 and not public.username_allowed(w) then raise exception ''terme_interdit''; end if; end loop;' || chr(10) ||
      '    if not public.username_allowed(regexp_replace(v_all, ''[^a-z0-9]+'', '''', ''g'')) then raise exception ''terme_interdit''; end if;');
    execute 'create or replace function public.map_reports_before_insert() returns trigger language plpgsql security definer set search_path to '''' as $b$' || src || '$b$';
  end if;
end $$;

-- 4) Performances : policy RLS réévaluée à chaque ligne + 4 clés étrangères sans index
drop policy if exists own_sub_ban_read on public.subscription_bans;
create policy own_sub_ban_read on public.subscription_bans for select using (user_id = (select auth.uid()));
create index if not exists admins_added_by_idx on public.admins(added_by);
create index if not exists promo_redemptions_user_idx on public.promo_redemptions(user_id);
create index if not exists rider_links_user_idx on public.rider_links(user_id);
create index if not exists route_reports_reporter_idx on public.route_reports(reporter_id);

-- 5) À faire à la main (tableau de bord) : Authentication › Sign In / Providers › « Prevent use of leaked passwords » = ON.
