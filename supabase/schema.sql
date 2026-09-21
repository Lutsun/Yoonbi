-- Yonnbi — schéma de base de données
--
-- À exécuter dans l'éditeur SQL de ton projet Supabase (Project > SQL Editor
-- > New query), ou via `supabase db push` si tu utilises la CLI plus tard.
--
-- Architecture volontairement simple : 7 tables.
--   operators       -> les réseaux de transport (Tata AFTU, Dakar Dem Dikk, ...)
--   lines           -> les lignes de bus (ex: "Ligne 40", "B1")
--   stops           -> les arrêts, avec leur position GPS (PostGIS)
--   line_stops      -> l'ordre des arrêts sur chaque ligne
--   profiles        -> infos Yonnbi (nom, ville) liées à un compte Supabase Auth
--   user_trips      -> les trajets recherchés / enregistrés par un utilisateur
--   favorite_lines  -> les lignes de bus mises en favori par un utilisateur

-- 1. PostGIS gère tout ce qui est géographique : distances, "arrêt le plus
--    proche", tracés de ligne. Supabase l'a déjà intégré, on l'active juste.
create extension if not exists postgis;

-- 2. Réseaux de transport --------------------------------------------------
create table if not exists operators (
  id uuid primary key default gen_random_uuid(),
  name text not null,               -- "Dakar Dem Dikk"
  short_name text not null unique,  -- "DDD"
  color text not null,              -- couleur pour l'afficher sur la carte
  created_at timestamptz not null default now()
);

-- 3. Lignes -----------------------------------------------------------------
create table if not exists lines (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references operators (id) on delete cascade,
  code text not null,                -- "B1", "Ligne 40"
  name text not null,                -- "Petersen ↔ Préfecture de Guédiawaye"
  color text,                        -- couleur spécifique (sinon celle de l'opérateur)
  created_at timestamptz not null default now()
);

create index if not exists lines_operator_id_idx on lines (operator_id);
create unique index if not exists lines_operator_code_idx on lines (operator_id, code);

-- Prix du ticket (FCFA), forfaitaire par ligne — utilisé par le planificateur
-- d'itinéraire pour estimer le coût total d'un trajet.
alter table lines add column if not exists fare_fcfa int not null default 200;

-- 4. Arrêts -------------------------------------------------------------
create table if not exists stops (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,         -- "Place de la Nation"
  location geography(point, 4326) not null,
  created_at timestamptz not null default now()
);

-- Index géographique : indispensable pour les requêtes "arrêts proches de moi"
create index if not exists stops_location_idx on stops using gist (location);

-- 5. Ordre des arrêts sur chaque ligne ---------------------------------
create table if not exists line_stops (
  line_id uuid not null references lines (id) on delete cascade,
  stop_id uuid not null references stops (id) on delete cascade,
  sequence int not null,             -- 1, 2, 3... position sur la ligne
  primary key (line_id, sequence)
);

create index if not exists line_stops_stop_id_idx on line_stops (stop_id);

-- Vue pratique : le tracé complet de chaque ligne, reconstruit à partir de
-- ses arrêts dans l'ordre (une LineString PostGIS). Permet de dessiner
-- chaque ligne sur la carte sans dupliquer la donnée.
create or replace view line_paths as
select
  l.id as line_id,
  l.code,
  l.name,
  st_makeline(array_agg(s.location::geometry order by ls.sequence)) as path
from lines l
join line_stops ls on ls.line_id = l.id
join stops s on s.id = ls.stop_id
group by l.id, l.code, l.name;

-- Fonction : arrêts les plus proches d'un point donné (position de
-- l'utilisateur), triés par distance. C'est ce que l'écran d'accueil
-- appelle pour afficher les arrêts autour de soi.
--
-- `drop function` d'abord : Postgres refuse de changer les colonnes d'une
-- fonction existante via `create or replace` (seul son corps peut changer).
drop function if exists nearby_stops(double precision, double precision, int);
create or replace function nearby_stops(
  lat double precision,
  lng double precision,
  radius_meters int default 1500
)
returns table (
  id uuid,
  name text,
  latitude double precision,
  longitude double precision,
  distance_meters double precision,
  lines text[],
  operator_colors text[]
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    st_y(s.location::geometry) as latitude,
    st_x(s.location::geometry) as longitude,
    st_distance(s.location, st_setsrid(st_point(lng, lat), 4326)::geography) as distance_meters,
    coalesce(
      (select array_agg(l.code order by l.code)
       from line_stops ls
       join lines l on l.id = ls.line_id
       where ls.stop_id = s.id),
      '{}'
    ) as lines,
    coalesce(
      (select array_agg(distinct o.color order by o.color)
       from line_stops ls
       join lines l on l.id = ls.line_id
       join operators o on o.id = l.operator_id
       where ls.stop_id = s.id),
      '{}'
    ) as operator_colors
  from stops s
  where st_dwithin(s.location, st_setsrid(st_point(lng, lat), 4326)::geography, radius_meters)
  order by distance_meters asc;
$$;

-- Fonction : arrêts d'une ligne, dans l'ordre, avec leurs coordonnées
-- (utilisée par l'écran de détail d'une ligne).
create or replace function get_line_stops(p_line_id uuid)
returns table (
  id uuid,
  name text,
  latitude double precision,
  longitude double precision,
  sequence int
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    st_y(s.location::geometry) as latitude,
    st_x(s.location::geometry) as longitude,
    ls.sequence
  from line_stops ls
  join stops s on s.id = ls.stop_id
  where ls.line_id = p_line_id
  order by ls.sequence;
$$;

-- Fonction : recherche d'arrêts par nom (utilisée par la barre "Où
-- voulez-vous aller ?" de l'écran d'accueil).
drop function if exists search_stops(text);
create or replace function search_stops(query text)
returns table (
  id uuid,
  name text,
  latitude double precision,
  longitude double precision,
  lines text[],
  operator_colors text[]
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    st_y(s.location::geometry) as latitude,
    st_x(s.location::geometry) as longitude,
    coalesce(
      (select array_agg(l.code order by l.code)
       from line_stops ls
       join lines l on l.id = ls.line_id
       where ls.stop_id = s.id),
      '{}'
    ) as lines,
    coalesce(
      (select array_agg(distinct o.color order by o.color)
       from line_stops ls
       join lines l on l.id = ls.line_id
       join operators o on o.id = l.operator_id
       where ls.stop_id = s.id),
      '{}'
    ) as operator_colors
  from stops s
  where s.name ilike '%' || query || '%'
  order by s.name
  limit 8;
$$;

-- Fonction : le réseau complet (chaque ligne et ses arrêts, dans l'ordre),
-- en un seul aller-retour réseau. C'est ce que le planificateur d'itinéraire
-- (services/routing.ts) utilise pour construire son graphe de trajet et
-- calculer le meilleur itinéraire, les correspondances, le temps et le coût.
create or replace function get_route_graph()
returns table (
  line_id uuid,
  line_code text,
  line_name text,
  line_color text,
  fare_fcfa int,
  operator_short_name text,
  operator_color text,
  stop_id uuid,
  stop_name text,
  latitude double precision,
  longitude double precision,
  sequence int
)
language sql
stable
as $$
  select
    l.id, l.code, l.name, l.color, l.fare_fcfa,
    o.short_name, o.color,
    s.id, s.name,
    st_y(s.location::geometry), st_x(s.location::geometry),
    ls.sequence
  from line_stops ls
  join lines l on l.id = ls.line_id
  join operators o on o.id = l.operator_id
  join stops s on s.id = ls.stop_id
  order by l.id, ls.sequence;
$$;

-- 6. Utilisateurs -------------------------------------------------------
-- Vraie authentification Supabase Auth (téléphone + code SMS, voir
-- Authentication > Providers > Phone dans le dashboard) — pas de mot de
-- passe, pas d'e-mail requis. Chaque compte est un vrai `auth.users`;
-- `profiles` ne stocke que les infos propres à Yonnbi (nom, ville), liées
-- par le même id. Le téléphone n'est pas dupliqué ici : il vit déjà dans
-- `auth.users` et l'app le lit via `session.user.phone`.
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  city text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "Lecture de son propre profil" on profiles;
create policy "Lecture de son propre profil" on profiles for select using (auth.uid() = id);
drop policy if exists "Création de son propre profil" on profiles;
create policy "Création de son propre profil" on profiles for insert with check (auth.uid() = id);
drop policy if exists "Mise à jour de son propre profil" on profiles;
create policy "Mise à jour de son propre profil" on profiles for update using (auth.uid() = id);

-- 7. Trajets recherchés / enregistrés par un utilisateur -----------------
create table if not exists user_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  origin_label text not null,
  origin_location geography(point, 4326) not null,
  destination_label text not null,
  destination_location geography(point, 4326) not null,
  is_saved boolean not null default false,   -- true = "Maison", "Travail"... enregistré exprès
  created_at timestamptz not null default now()
);

create index if not exists user_trips_user_id_idx on user_trips (user_id);

-- Si cette table existait déjà avec une clé étrangère vers l'ancienne table
-- `users`, on la remplace par une référence à `profiles` (rejouable sans
-- erreur, y compris sur une base neuve où c'est déjà le cas).
alter table user_trips drop constraint if exists user_trips_user_id_fkey;
alter table user_trips
  add constraint user_trips_user_id_fkey foreign key (user_id) references profiles (id) on delete cascade;

-- Fonction : enregistrer un trajet en favori (utilisée par le bouton
-- "Enregistrer" quand on choisit une destination sur l'écran d'accueil).
create or replace function save_trip(
  p_user_id uuid,
  p_origin_label text,
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_destination_label text,
  p_destination_lat double precision,
  p_destination_lng double precision
)
returns uuid
language sql
as $$
  insert into user_trips (
    user_id, origin_label, origin_location,
    destination_label, destination_location, is_saved
  ) values (
    p_user_id,
    p_origin_label,
    st_setsrid(st_point(p_origin_lng, p_origin_lat), 4326)::geography,
    p_destination_label,
    st_setsrid(st_point(p_destination_lng, p_destination_lat), 4326)::geography,
    true
  )
  returning id;
$$;

-- 8. Lignes favorites ----------------------------------------------------
create table if not exists favorite_lines (
  user_id uuid not null references profiles (id) on delete cascade,
  line_id uuid not null references lines (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, line_id)
);

alter table favorite_lines drop constraint if exists favorite_lines_user_id_fkey;
alter table favorite_lines
  add constraint favorite_lines_user_id_fkey foreign key (user_id) references profiles (id) on delete cascade;

-- 9. Sécurité (Row Level Security) ---------------------------------------
-- Les données de transport (lignes, arrêts) sont publiques en lecture.
-- Les données utilisateur sont privées.
alter table operators enable row level security;
alter table lines enable row level security;
alter table stops enable row level security;
alter table line_stops enable row level security;
alter table user_trips enable row level security;
alter table favorite_lines enable row level security;

-- (chaque policy est précédée d'un DROP POLICY IF EXISTS pour que ce fichier
-- reste rejouable sans erreur si on l'exécute plusieurs fois)
drop policy if exists "Lecture publique des opérateurs" on operators;
create policy "Lecture publique des opérateurs" on operators for select using (true);
drop policy if exists "Lecture publique des lignes" on lines;
create policy "Lecture publique des lignes" on lines for select using (true);
drop policy if exists "Lecture publique des arrêts" on stops;
create policy "Lecture publique des arrêts" on stops for select using (true);
drop policy if exists "Lecture publique des arrêts de ligne" on line_stops;
create policy "Lecture publique des arrêts de ligne" on line_stops for select using (true);

-- Vraie authentification Supabase Auth : chaque requête porte le jeton de
-- l'utilisateur connecté, donc auth.uid() est fiable — les données d'un
-- utilisateur ne sont plus jamais lisibles ou modifiables par un autre.
drop policy if exists "Lecture de ses propres trajets" on user_trips;
create policy "Lecture de ses propres trajets" on user_trips for select using (auth.uid() = user_id);
drop policy if exists "Création de ses propres trajets" on user_trips;
create policy "Création de ses propres trajets" on user_trips for insert with check (auth.uid() = user_id);
drop policy if exists "Suppression de ses propres trajets" on user_trips;
create policy "Suppression de ses propres trajets" on user_trips for delete using (auth.uid() = user_id);

drop policy if exists "Lecture de ses lignes favorites" on favorite_lines;
create policy "Lecture de ses lignes favorites" on favorite_lines for select using (auth.uid() = user_id);
drop policy if exists "Ajout d'une ligne favorite" on favorite_lines;
create policy "Ajout d'une ligne favorite" on favorite_lines for insert with check (auth.uid() = user_id);
drop policy if exists "Retrait d'une ligne favorite" on favorite_lines;
create policy "Retrait d'une ligne favorite" on favorite_lines for delete using (auth.uid() = user_id);
