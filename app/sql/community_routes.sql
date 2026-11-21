-- Trajets communautaires (Roadbook › Communauté) — à appliquer après accord
create table public.community_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author text not null check (char_length(author) <= 20),
  title text not null check (char_length(title) between 3 and 60),
  description text check (description is null or char_length(description) <= 300),
  level text not null check (level in ('balade','dynamique','fifou')),
  dist_m int not null check (dist_m between 500 and 2000000),
  dur_min int not null check (dur_min between 1 and 3000),
  region text not null default 'Hors de France' check (region in ('Auvergne-Rhône-Alpes','Bourgogne-Franche-Comté','Bretagne','Centre-Val de Loire','Corse','Grand Est','Hauts-de-France','Île-de-France','Normandie','Nouvelle-Aquitaine','Occitanie','Pays de la Loire','Provence-Alpes-Côte d''Azur','Hors de France')),
  pts text not null check (char_length(pts) between 4 and 12000 and pts ~ '^[?-~]+$'),
  downloads int not null default 0,
  created_at timestamptz not null default now()
);
create index community_routes_recent on public.community_routes (created_at desc);
create index community_routes_user on public.community_routes (user_id);
create index community_routes_region on public.community_routes (region, created_at desc);
create table public.route_reports (
  route_id uuid not null references public.community_routes(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (route_id, reporter_id)
);
alter table public.community_routes enable row level security;
alter table public.route_reports enable row level security;
revoke all on public.community_routes, public.route_reports from anon, authenticated;
-- aucune politique : tout passe par les fonctions ci-dessous

create or replace function public.publish_route(p_title text, p_desc text, p_level text, p_dist int, p_dur int, p_pts text, p_region text default 'Hors de France')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_name text; w text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.account_bans where user_id = auth.uid()) then raise exception 'banni'; end if;
  select username into v_name from public.profiles where user_id = auth.uid();
  if v_name is null then raise exception 'pseudo_requis'; end if;
  if (select count(*) from public.community_routes where user_id = auth.uid() and created_at > now() - interval '1 day') >= 5
     or (select count(*) from public.community_routes where user_id = auth.uid()) >= 50 then
    raise exception 'rate_limit' using errcode = '54000';
  end if;
  for w in select regexp_split_to_table(translate(lower(coalesce(p_title,'') || ' ' || coalesce(p_desc,'')), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'), '[^a-z0-9]+') loop
    if char_length(w) >= 3 and not public.username_allowed(w) then raise exception 'terme_interdit'; end if;
  end loop;
  insert into public.community_routes(user_id, author, title, description, level, dist_m, dur_min, pts, region)
  values (auth.uid(), v_name, btrim(p_title), nullif(btrim(coalesce(p_desc,'')), ''), p_level, p_dist, p_dur, p_pts, coalesce(p_region, 'Hors de France'))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.list_routes(p_level text default null, p_q text default null, p_off int default 0, p_region text default null)
returns table(id uuid, author text, title text, description text, level text, dist_m int, dur_min int, downloads int, created_at timestamptz, pts text, mine boolean, region text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.author, c.title, c.description, c.level, c.dist_m, c.dur_min, c.downloads, c.created_at, c.pts, (c.user_id = auth.uid()), c.region
  from public.community_routes c
  where (p_level is null or c.level = p_level)
    and (p_region is null or c.region = p_region)
    and (p_q is null or c.title ilike '%' || replace(replace(replace(left(p_q, 40), '\', ''), '%', ''), '_', '') || '%')
    and (select count(*) from public.route_reports r where r.route_id = c.id) < coalesce((select report_threshold from public.admin_settings limit 1), 3)
  order by c.created_at desc
  limit 20 offset greatest(coalesce(p_off, 0), 0)
$$;

create or replace function public.route_regions()
returns table(region text, n int) language sql stable security definer set search_path = '' as $$
  select c.region, count(*)::int from public.community_routes c
  where (select count(*) from public.route_reports r where r.route_id = c.id) < coalesce((select report_threshold from public.admin_settings limit 1), 3)
  group by c.region
$$;

create or replace function public.route_downloaded(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.rl_hit('rd', 60, interval '1 hour');
  update public.community_routes set downloads = downloads + 1 where id = p_id;
end $$;

create or replace function public.report_route(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.rl_hit('rr', 15, interval '1 hour');
  insert into public.route_reports(route_id, reporter_id) values (p_id, auth.uid()) on conflict do nothing;
end $$;

create or replace function public.delete_my_route(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.community_routes where id = p_id and user_id = auth.uid();
end $$;

revoke all on function public.publish_route(text,text,text,int,int,text,text), public.list_routes(text,text,int,text), public.route_regions(), public.route_downloaded(uuid), public.report_route(uuid), public.delete_my_route(uuid) from public;
grant execute on function public.list_routes(text,text,int,text), public.route_regions(), public.route_downloaded(uuid) to anon, authenticated;
grant execute on function public.publish_route(text,text,text,int,int,text,text), public.report_route(uuid), public.delete_my_route(uuid) to authenticated;
