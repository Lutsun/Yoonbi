-- Yoonbi — droits d'administration (console web, dossier admin/)
--
-- À exécuter APRÈS schema.sql, dans l'éditeur SQL Supabase. Rejouable.
--
-- Principe de sécurité : la console web utilise la même clé publique
-- (anon) que l'app mobile — jamais la clé service_role, qui contourne toute
-- la sécurité et serait lisible par n'importe qui dans le navigateur. Les
-- droits d'écriture viennent donc uniquement des règles ci-dessous, qui ne
-- s'ouvrent qu'aux comptes listés dans la table `admins`.
--
-- Créer un administrateur (une fois pour chaque personne) :
--   1. Dashboard Supabase › Authentication › Users › « Add user »
--      (e-mail + mot de passe, cocher « Auto Confirm User »).
--   2. Puis, ici :
--        insert into admins (user_id)
--        select id from auth.users where email = 'prenom@exemple.com';

-- 1. Liste des administrateurs -----------------------------------------------
create table if not exists admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;

-- Un compte peut seulement vérifier s'il est lui-même administrateur. Aucune
-- règle d'écriture : on ne devient admin que depuis l'éditeur SQL.
drop policy if exists "Un admin se voit lui-même" on admins;
create policy "Un admin se voit lui-même" on admins for select using (auth.uid() = user_id);

-- `security definer` : la fonction lit `admins` avec ses propres droits, pour
-- pouvoir être utilisée dans les règles des autres tables.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- 2. Écriture du réseau réservée aux administrateurs ---------------------------
-- La lecture reste publique (règles de schema.sql) ; ces règles ajoutent
-- l'insertion, la modification et la suppression, pour les admins seulement.
drop policy if exists "Écriture admin des opérateurs" on operators;
create policy "Écriture admin des opérateurs" on operators
  for all using (is_admin()) with check (is_admin());

drop policy if exists "Écriture admin des lignes" on lines;
create policy "Écriture admin des lignes" on lines
  for all using (is_admin()) with check (is_admin());

drop policy if exists "Écriture admin des arrêts" on stops;
create policy "Écriture admin des arrêts" on stops
  for all using (is_admin()) with check (is_admin());

drop policy if exists "Écriture admin des tracés" on line_stops;
create policy "Écriture admin des tracés" on line_stops
  for all using (is_admin()) with check (is_admin());

-- 3. Fonctions utilisées par la console ----------------------------------------

-- Tous les arrêts avec leurs coordonnées et le nombre de lignes qui les
-- desservent (données publiques : pas de contrôle d'accès nécessaire).
create or replace function admin_list_stops()
returns table (
  id uuid,
  name text,
  latitude double precision,
  longitude double precision,
  line_count int
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    st_y(s.location::geometry),
    st_x(s.location::geometry),
    (select count(distinct ls.line_id)::int from line_stops ls where ls.stop_id = s.id)
  from stops s
  order by s.name;
$$;

-- Crée (p_id null) ou modifie un arrêt à partir de coordonnées simples :
-- l'API REST ne sait pas écrire directement une colonne géographique.
create or replace function admin_save_stop(
  p_id uuid,
  p_name text,
  p_lat double precision,
  p_lng double precision
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'Accès réservé aux administrateurs' using errcode = '42501';
  end if;
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Le nom de l''arrêt est obligatoire' using errcode = '22023';
  end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Coordonnées invalides' using errcode = '22023';
  end if;

  if p_id is null then
    insert into stops (name, location)
    values (trim(p_name), st_setsrid(st_point(p_lng, p_lat), 4326)::geography)
    returning id into v_id;
  else
    update stops
    set name = trim(p_name),
        location = st_setsrid(st_point(p_lng, p_lat), 4326)::geography
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Remplace le tracé d'une ligne par une liste ordonnée d'arrêts. Le corps
-- d'une fonction s'exécute dans une seule transaction : le tracé n'est
-- jamais visible à moitié réécrit par l'app mobile.
create or replace function admin_set_line_stops(p_line_id uuid, p_stop_ids uuid[])
returns void
language plpgsql
as $$
begin
  if not is_admin() then
    raise exception 'Accès réservé aux administrateurs' using errcode = '42501';
  end if;

  delete from line_stops where line_id = p_line_id;

  insert into line_stops (line_id, stop_id, sequence)
  select p_line_id, s.stop_id, s.ord::int
  from unnest(p_stop_ids) with ordinality as s(stop_id, ord);
end;
$$;

-- Tableau de bord : uniquement des TOTAUX. `security definer` est nécessaire
-- pour compter les comptes et favoris (protégés par utilisateur), mais la
-- fonction ne renvoie jamais une donnée personnelle — ni nom, ni numéro.
create or replace function admin_stats()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Accès réservé aux administrateurs' using errcode = '42501';
  end if;

  return json_build_object(
    'operators', (select count(*) from operators),
    'lines', (select count(*) from lines),
    'stops', (select count(*) from stops),
    'users', (select count(*) from profiles),
    'saved_trips', (select count(*) from user_trips where is_saved),
    'favorite_lines', (select count(*) from favorite_lines),
    -- Qualité des données : ce qui rend le calcul d'itinéraire inopérant.
    'orphan_stops', (
      select count(*) from stops s
      where not exists (select 1 from line_stops ls where ls.stop_id = s.id)
    ),
    'short_lines', (
      select count(*) from lines l
      where (select count(*) from line_stops ls where ls.line_id = l.id) < 2
    ),
    'lines_by_operator', (
      select coalesce(json_agg(t order by t.lines desc), '[]'::json) from (
        select o.short_name as operator, o.color, count(l.id)::int as lines
        from operators o
        left join lines l on l.operator_id = o.id
        group by o.id
      ) t
    ),
    'popular_lines', (
      select coalesce(json_agg(t), '[]'::json) from (
        select l.code, l.name, o.short_name as operator, count(*)::int as favorites
        from favorite_lines f
        join lines l on l.id = f.line_id
        join operators o on o.id = l.operator_id
        group by l.id, o.short_name
        order by favorites desc
        limit 5
      ) t
    )
  );
end;
$$;

-- Liste des comptes Yoonbi. `security definer` est nécessaire pour lire le
-- téléphone (dans auth.users, jamais dupliqué dans profiles) et compter les
-- trajets/favoris de chacun — mais seul un admin peut appeler cette fonction,
-- et elle ne renvoie rien à un compte qui ne l'est pas.
create or replace function admin_list_users()
returns table (
  id uuid,
  full_name text,
  city text,
  phone text,
  created_at timestamptz,
  saved_trips int,
  favorite_lines int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Accès réservé aux administrateurs' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.city,
    u.phone,
    p.created_at,
    (select count(*)::int from user_trips t where t.user_id = p.id and t.is_saved),
    (select count(*)::int from favorite_lines f where f.user_id = p.id)
  from profiles p
  join auth.users u on u.id = p.id
  order by p.created_at desc;
end;
$$;
