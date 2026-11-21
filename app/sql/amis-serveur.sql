-- Amis par code (8 chiffres) — ajout d'amis sans se croiser. Tout passe par des fonctions serveur (aucun accès direct aux tables).
-- Identifiant public d'un motard = pub_id aléatoire (jamais l'identifiant du compte).
create table if not exists public.friend_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code char(8) not null unique check (code ~ '^[0-9]{8}$'),
  pub_id uuid not null unique default gen_random_uuid(),
  rotated_at timestamptz not null default now()
);
create table if not exists public.friend_links (
  a uuid not null references auth.users(id) on delete cascade,
  b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b), check (a < b)
);
create index if not exists friend_links_b on public.friend_links (b);
create table if not exists public.friend_requests (
  from_id uuid not null references auth.users(id) on delete cascade,
  to_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id), check (from_id <> to_id)
);
create index if not exists friend_requests_to on public.friend_requests (to_id);
create table if not exists public.friend_blocks (
  blocker uuid not null references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked), check (blocker <> blocked)
);
create index if not exists friend_blocks_blocked on public.friend_blocks (blocked);
-- délai après suppression d'un ami : pas de nouvelle demande entre les deux avant « until »
create table if not exists public.friend_cooldowns (
  a uuid not null references auth.users(id) on delete cascade,
  b uuid not null references auth.users(id) on delete cascade,
  until timestamptz not null,
  primary key (a, b), check (a < b)
);
-- essais de code ratés (anti-recherche par force brute)
create table if not exists public.friend_misses (
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists friend_misses_user on public.friend_misses (user_id, at desc);
alter table public.friend_codes enable row level security;
alter table public.friend_links enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friend_blocks enable row level security;
alter table public.friend_cooldowns enable row level security;
alter table public.friend_misses enable row level security;
revoke all on public.friend_codes, public.friend_links, public.friend_requests, public.friend_blocks, public.friend_cooldowns, public.friend_misses from anon, authenticated;

create or replace function public.fr_ok() returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.account_bans where user_id = auth.uid()) then raise exception 'banni'; end if;
  return auth.uid();
end $$;

-- Mon code (créé au premier appel)
create or replace function public.my_friend_code() returns text language plpgsql security definer set search_path = '' as $$
declare u uuid := public.fr_ok(); c text; i int := 0;
begin
  select code into c from public.friend_codes where user_id = u;
  if c is not null then return c; end if;
  loop
    c := lpad(floor(random() * 100000000)::bigint::text, 8, '0'); i := i + 1;
    begin insert into public.friend_codes(user_id, code) values (u, c); return c;
    exception when unique_violation then if i > 20 then raise; end if; end;
  end loop;
end $$;

-- Changer de code (1 fois par minute) : l'ancien code ne marche plus
create or replace function public.regen_friend_code() returns text language plpgsql security definer set search_path = '' as $$
declare u uuid := public.fr_ok(); c text; i int := 0;
begin
  perform public.my_friend_code();
  if exists (select 1 from public.friend_codes where user_id = u and rotated_at > now() - interval '1 minute') then raise exception 'rate_limit' using errcode = '54000'; end if;
  loop
    c := lpad(floor(random() * 100000000)::bigint::text, 8, '0'); i := i + 1;
    begin update public.friend_codes set code = c, rotated_at = now() where user_id = u; return c;
    exception when unique_violation then if i > 20 then raise; end if; end;
  end loop;
end $$;

-- Envoyer une demande avec le code de l'autre. Retour : { status: 'sent' | 'accepted', name }
-- Un code inconnu, un motard qui t'a bloqué, ou un compte banni répondent tous « code_invalide » (rien n'est révélé).
create or replace function public.friend_request_by_code(p_code text) returns json language plpgsql security definer set search_path = '' as $$
declare u uuid := public.fr_ok(); t uuid; v_name text; v_until timestamptz;
begin
  perform public.my_friend_code();
  p_code := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  if char_length(p_code) <> 8 then return json_build_object('status', 'invalid'); end if;
  if (select count(*) from public.friend_misses where user_id = u and at > now() - interval '1 hour') >= 10 then raise exception 'trop_d_essais' using errcode = '54000'; end if;
  if not exists (select 1 from public.profiles where user_id = u and username is not null) then raise exception 'pseudo_requis'; end if;
  select user_id into t from public.friend_codes where code = p_code;
  if t is null or t = u or exists (select 1 from public.account_bans where user_id = t)
     or exists (select 1 from public.friend_blocks where blocker = t and blocked = u) then
    insert into public.friend_misses(user_id) values (u);
    delete from public.friend_misses where at < now() - interval '1 day';
    return json_build_object('status', case when t = u then 'self' else 'invalid' end);
  end if;
  if exists (select 1 from public.friend_blocks where blocker = u and blocked = t) then return json_build_object('status', 'blocked_by_me'); end if;
  if exists (select 1 from public.friend_links where friend_links.a = least(u, t) and friend_links.b = greatest(u, t)) then return json_build_object('status', 'already'); end if;
  select until into v_until from public.friend_cooldowns c where c.a = least(u, t) and c.b = greatest(u, t) and until > now();
  if v_until is not null then return json_build_object('status', 'delay', 'until', v_until); end if;
  select username into v_name from public.profiles where user_id = t;
  -- il m'avait déjà demandé : on devient amis tout de suite
  if exists (select 1 from public.friend_requests where from_id = t and to_id = u) then
    delete from public.friend_requests where (from_id = t and to_id = u) or (from_id = u and to_id = t);
    insert into public.friend_links(a, b) values (least(u, t), greatest(u, t)) on conflict do nothing;
    return json_build_object('status', 'accepted', 'name', v_name);
  end if;
  if (select count(*) from public.friend_requests where from_id = u) >= 100 then raise exception 'rate_limit' using errcode = '54000'; end if;
  insert into public.friend_requests(from_id, to_id) values (u, t) on conflict do nothing;
  return json_build_object('status', 'sent', 'name', v_name);
end $$;

-- Tout l'état d'un coup : amis, demandes reçues, demandes envoyées, bloqués
create or replace function public.friends_state() returns json language plpgsql stable security definer set search_path = '' as $$
declare u uuid := public.fr_ok(); r json;
begin
  select json_build_object(
    'friends', coalesce((select json_agg(json_build_object('id', fc.pub_id, 'name', p.username, 'since', l.created_at, 'rid', (select rl.rid from public.rider_links rl where rl.user_id = o.id order by rl.updated_at desc limit 1)) order by l.created_at desc)
        from public.friend_links l
        join lateral (select case when l.a = u then l.b else l.a end as id) o on true
        join public.friend_codes fc on fc.user_id = o.id
        join public.profiles p on p.user_id = o.id
        where (l.a = u or l.b = u) and not exists (select 1 from public.account_bans ab where ab.user_id = o.id)), '[]'::json),
    'incoming', coalesce((select json_agg(json_build_object('id', fc.pub_id, 'name', p.username, 'at', q.created_at) order by q.created_at desc)
        from public.friend_requests q join public.friend_codes fc on fc.user_id = q.from_id join public.profiles p on p.user_id = q.from_id
        where q.to_id = u and not exists (select 1 from public.friend_blocks bl where bl.blocker = u and bl.blocked = q.from_id) and not exists (select 1 from public.account_bans ab where ab.user_id = q.from_id)), '[]'::json),
    'outgoing', coalesce((select json_agg(json_build_object('id', fc.pub_id, 'name', p.username, 'at', q.created_at) order by q.created_at desc)
        from public.friend_requests q join public.friend_codes fc on fc.user_id = q.to_id join public.profiles p on p.user_id = q.to_id
        where q.from_id = u and not exists (select 1 from public.friend_blocks bl where bl.blocker = q.to_id and bl.blocked = u)), '[]'::json),
    'blocked', coalesce((select json_agg(json_build_object('id', fc.pub_id, 'name', p.username) order by bl.created_at desc)
        from public.friend_blocks bl join public.friend_codes fc on fc.user_id = bl.blocked join public.profiles p on p.user_id = bl.blocked
        where bl.blocker = u), '[]'::json)
  ) into r;
  return r;
end $$;

create or replace function public.fr_target(p_pub uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select user_id from public.friend_codes where pub_id = p_pub
$$;

-- Répondre à une demande reçue
create or replace function public.friend_respond(p_id uuid, p_accept boolean) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := public.fr_ok(); t uuid := public.fr_target(p_id);
begin
  if t is null or not exists (select 1 from public.friend_requests where from_id = t and to_id = u) then raise exception 'introuvable'; end if;
  delete from public.friend_requests where (from_id = t and to_id = u) or (from_id = u and to_id = t);
  if p_accept and not exists (select 1 from public.friend_blocks where (blocker = t and blocked = u) or (blocker = u and blocked = t)) then
    insert into public.friend_links(a, b) values (least(u, t), greatest(u, t)) on conflict do nothing;
  end if;
end $$;

-- Annuler une demande que j'ai envoyée
create or replace function public.friend_cancel(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := public.fr_ok(); t uuid := public.fr_target(p_id);
begin delete from public.friend_requests where from_id = u and to_id = t; end $$;

-- Supprimer un ami : délai de 7 jours avant toute nouvelle demande entre vous deux
create or replace function public.friend_remove(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := public.fr_ok(); t uuid := public.fr_target(p_id);
begin
  if t is null then return; end if;
  delete from public.friend_links where a = least(u, t) and b = greatest(u, t);
  delete from public.friend_requests where (from_id = u and to_id = t) or (from_id = t and to_id = u);
  insert into public.friend_cooldowns(a, b, until) values (least(u, t), greatest(u, t), now() + interval '7 days')
    on conflict (a, b) do update set until = excluded.until;
end $$;

-- Bloquer : plus d'amitié, plus de demande dans aucun sens, l'autre ne voit rien (et ne peut plus te trouver avec ton code)
create or replace function public.friend_block(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := public.fr_ok(); t uuid := public.fr_target(p_id);
begin
  if t is null or t = u then raise exception 'introuvable'; end if;
  delete from public.friend_links where a = least(u, t) and b = greatest(u, t);
  delete from public.friend_requests where (from_id = u and to_id = t) or (from_id = t and to_id = u);
  insert into public.friend_blocks(blocker, blocked) values (u, t) on conflict do nothing;
end $$;

create or replace function public.friend_unblock(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := public.fr_ok(); t uuid := public.fr_target(p_id);
begin delete from public.friend_blocks where blocker = u and blocked = t; end $$;

revoke all on function public.fr_ok(), public.fr_target(uuid), public.my_friend_code(), public.regen_friend_code(), public.friend_request_by_code(text), public.friends_state(), public.friend_respond(uuid, boolean), public.friend_cancel(uuid), public.friend_remove(uuid), public.friend_block(uuid), public.friend_unblock(uuid) from public, anon, authenticated;
grant execute on function public.my_friend_code(), public.regen_friend_code(), public.friend_request_by_code(text), public.friends_state(), public.friend_respond(uuid, boolean), public.friend_cancel(uuid), public.friend_remove(uuid), public.friend_block(uuid), public.friend_unblock(uuid) to authenticated;

-- === Ajout : profil partagé entre amis par MQTT (chiffré) ===
-- Chaque motard a une clé de profil (pkey) connue de lui et de ses amis seulement (via friends_state) ; elle change quand une amitié est retirée ou bloquée.
-- Le profil complet (photo, moto…) est publié chiffré (AES-GCM) sur un topic MQTT dérivé de cette clé ; le serveur ne stocke que la clé.
alter table public.friend_codes add column if not exists pkey text not null default replace(gen_random_uuid()::text, '-', '');
-- (friends_state renvoie 'me' {id, key} et 'pk' pour chaque ami ; friend_remove / friend_block renouvellent la clé des deux motards)
