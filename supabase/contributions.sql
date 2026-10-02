-- Yoonbi — contributions des usagers (lignes proposées par la communauté)
--
-- À exécuter APRÈS schema.sql et admin.sql, dans l'éditeur SQL Supabase.
-- Rejouable.
--
-- Principe : un usager qui prend un bus absent de Yoonbi peut le signaler —
-- en marquant chaque arrêt au moment où il y est (position GPS captée sur
-- l'instant, pas un tracé continu à enregistrer). Sa contribution n'écrit
-- jamais dans les vraies tables (`lines`, `stops`, `line_stops`) : elle reste
-- dans cette zone d'attente jusqu'à ce qu'un administrateur la valide ou la
-- refuse, depuis la console web. Rien n'est jamais fusionné automatiquement.

-- 1. Contributions -----------------------------------------------------------
create table if not exists line_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references profiles (id) on delete cascade,
  -- Description libre : le contributeur ne connaît pas forcément le nom
  -- officiel de la ligne ni son opérateur exact.
  line_label text not null,
  operator_hint text,
  fare_fcfa int,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references admins (user_id),
  reviewed_at timestamptz,
  -- Renseigné à la validation : la ligne réellement créée à partir de cette
  -- contribution, pour garder la trace de qui a permis quoi.
  resulting_line_id uuid references lines (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists line_submissions_status_idx on line_submissions (status, created_at);
create index if not exists line_submissions_submitted_by_idx on line_submissions (submitted_by);

-- 2. Arrêts proposés, dans l'ordre où ils ont été marqués --------------------
create table if not exists line_submission_stops (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references line_submissions (id) on delete cascade,
  sequence int not null,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  -- Précision rapportée par le téléphone au moment du relevé (mètres) — sert
  -- à l'administrateur pour juger de la fiabilité du point.
  accuracy_meters double precision,
  captured_at timestamptz not null default now(),
  unique (submission_id, sequence)
);

alter table line_submissions enable row level security;
alter table line_submission_stops enable row level security;

-- Un contributeur voit et gère ses propres contributions ; un administrateur
-- voit tout. Mise à jour du statut réservée à l'administrateur : un usager
-- ne peut pas s'auto-valider.
drop policy if exists "Lecture de ses contributions" on line_submissions;
create policy "Lecture de ses contributions" on line_submissions
  for select using (auth.uid() = submitted_by or is_admin());

drop policy if exists "Envoi d'une contribution" on line_submissions;
create policy "Envoi d'une contribution" on line_submissions
  for insert with check (auth.uid() = submitted_by);

drop policy if exists "Retrait de sa contribution en attente" on line_submissions;
create policy "Retrait de sa contribution en attente" on line_submissions
  for delete using (auth.uid() = submitted_by and status = 'pending');

drop policy if exists "Révision admin d'une contribution" on line_submissions;
create policy "Révision admin d'une contribution" on line_submissions
  for update using (is_admin()) with check (is_admin());

drop policy if exists "Lecture des arrêts de ses contributions" on line_submission_stops;
create policy "Lecture des arrêts de ses contributions" on line_submission_stops
  for select using (
    is_admin() or exists (
      select 1 from line_submissions s
      where s.id = submission_id and s.submitted_by = auth.uid()
    )
  );

drop policy if exists "Ajout d'arrêts à sa contribution" on line_submission_stops;
create policy "Ajout d'arrêts à sa contribution" on line_submission_stops
  for insert with check (
    exists (
      select 1 from line_submissions s
      where s.id = submission_id and s.submitted_by = auth.uid() and s.status = 'pending'
    )
  );

drop policy if exists "Retrait des arrêts de sa contribution en attente" on line_submission_stops;
create policy "Retrait des arrêts de sa contribution en attente" on line_submission_stops
  for delete using (
    exists (
      select 1 from line_submissions s
      where s.id = submission_id and s.submitted_by = auth.uid() and s.status = 'pending'
    )
  );

-- 3. Envoi d'une contribution -------------------------------------------------
-- `security definer` pour appliquer une limite anti-spam (3 contributions en
-- attente maximum par personne) que les policies seules ne peuvent pas
-- exprimer proprement. Insère la contribution et ses arrêts d'un seul coup.
create or replace function submit_line_contribution(
  p_line_label text,
  p_operator_hint text,
  p_fare_fcfa int,
  p_note text,
  p_stops jsonb -- [{ "name": text, "latitude": float, "longitude": float, "accuracy_meters": float }, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission_id uuid;
  v_pending_count int;
  v_stop_count int;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;

  select count(*) into v_pending_count
  from line_submissions
  where submitted_by = auth.uid() and status = 'pending';

  if v_pending_count >= 3 then
    raise exception 'Tu as déjà 3 contributions en attente de validation — attends leur relecture avant d''en envoyer une nouvelle.'
      using errcode = 'P0001';
  end if;

  v_stop_count := jsonb_array_length(p_stops);
  if v_stop_count < 2 then
    raise exception 'Il faut au moins 2 arrêts marqués.' using errcode = 'P0001';
  end if;

  -- Un point hors de cette emprise (GPS resté bloqué sur une position par
  -- défaut, bug de simulateur...) ne doit jamais devenir un arrêt réel une
  -- fois validé par un admin.
  if exists (
    select 1 from jsonb_array_elements(p_stops) as stop
    where (stop->>'latitude')::double precision not between 12 and 17
       or (stop->>'longitude')::double precision not between -18 and -11
  ) then
    raise exception 'Un des arrêts marqués est en dehors du Sénégal — vérifie ta position.'
      using errcode = 'P0001';
  end if;

  insert into line_submissions (submitted_by, line_label, operator_hint, fare_fcfa, note)
  values (auth.uid(), trim(p_line_label), nullif(trim(coalesce(p_operator_hint, '')), ''), p_fare_fcfa, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_submission_id;

  insert into line_submission_stops (submission_id, sequence, name, latitude, longitude, accuracy_meters)
  select
    v_submission_id,
    row_number() over (),
    stop->>'name',
    (stop->>'latitude')::double precision,
    (stop->>'longitude')::double precision,
    (stop->>'accuracy_meters')::double precision
  from jsonb_array_elements(p_stops) as stop;

  return v_submission_id;
end;
$$;

-- 4. Mes contributions (usager) ----------------------------------------------
create or replace function my_line_submissions()
returns table (
  id uuid,
  line_label text,
  operator_hint text,
  fare_fcfa int,
  status text,
  review_note text,
  stop_count int,
  created_at timestamptz
)
language sql
stable
security invoker
as $$
  select
    s.id, s.line_label, s.operator_hint, s.fare_fcfa, s.status, s.review_note,
    (select count(*)::int from line_submission_stops ls where ls.submission_id = s.id),
    s.created_at
  from line_submissions s
  where s.submitted_by = auth.uid()
  order by s.created_at desc;
$$;

-- 5. Relecture admin -----------------------------------------------------------
create or replace function admin_list_submissions(p_status text default 'pending')
returns table (
  id uuid,
  line_label text,
  operator_hint text,
  fare_fcfa int,
  note text,
  status text,
  contributor_name text,
  contributor_phone text,
  stop_count int,
  created_at timestamptz
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
    s.id, s.line_label, s.operator_hint, s.fare_fcfa, s.note, s.status,
    p.full_name, u.phone,
    (select count(*)::int from line_submission_stops ls where ls.submission_id = s.id),
    s.created_at
  from line_submissions s
  join profiles p on p.id = s.submitted_by
  join auth.users u on u.id = s.submitted_by
  where p_status is null or s.status = p_status
  order by s.created_at asc;
end;
$$;

create or replace function admin_get_submission_stops(p_submission_id uuid)
returns table (
  sequence int,
  name text,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision
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
  select ls.sequence, ls.name, ls.latitude, ls.longitude, ls.accuracy_meters
  from line_submission_stops ls
  where ls.submission_id = p_submission_id
  order by ls.sequence;
end;
$$;

-- Valide ou refuse une contribution. `p_line_id` n'est renseigné que pour une
-- validation (la ligne que l'admin vient de créer ou de compléter à partir
-- des arrêts proposés) — la création de la ligne elle-même passe par les
-- fonctions admin existantes (admin_save_stop, etc.), pas par celle-ci.
create or replace function admin_review_submission(
  p_submission_id uuid,
  p_approve boolean,
  p_review_note text,
  p_line_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Accès réservé aux administrateurs' using errcode = '42501';
  end if;

  update line_submissions
  set
    status = case when p_approve then 'approved' else 'rejected' end,
    review_note = nullif(trim(coalesce(p_review_note, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    resulting_line_id = p_line_id
  where id = p_submission_id;
end;
$$;

-- 6. Compteur de contributions en attente sur le tableau de bord -------------
-- Redéfinit `admin_stats` (déjà créée dans admin.sql) pour y ajouter le
-- nombre de contributions en attente de relecture.
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
    'pending_submissions', (select count(*) from line_submissions where status = 'pending'),
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
