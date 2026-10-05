-- Yoonbi — signalements des usagers
--
-- À exécuter APRÈS schema.sql et admin.sql, dans l'éditeur SQL Supabase.
-- Rejouable.
--
-- Principe : un usager signale un problème sur le réseau (arrêt mal placé,
-- ligne qui ne passe plus, grève, retard…). Le signalement reste en attente
-- jusqu'à ce qu'un administrateur l'examine depuis la console web :
--
--   En attente → En cours de vérification → Validé / Rejeté → Résolu
--
-- Un signalement VALIDÉ devient une information fiable, copiée dans
-- `network_incidents` : c'est cette table — pas les signalements bruts, qui
-- peuvent être faux — que l'app pourra lire plus tard pour annoncer les
-- perturbations et en tenir compte dans le calcul des itinéraires. Quand le
-- signalement est marqué résolu, l'incident est clos (`resolved_at`).

-- 1. Signalements ----------------------------------------------------------------
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid not null references profiles (id) on delete cascade,
  type text not null check (type in ('wrong_stop', 'line_issue', 'disruption', 'strike', 'delay', 'other')),
  -- Facultatifs : l'usager ne sait pas toujours de quelle ligne ou de quel
  -- arrêt il s'agit (et une ligne supprimée ne doit pas effacer l'historique).
  line_id uuid references lines (id) on delete set null,
  stop_id uuid references stops (id) on delete set null,
  description text not null,
  -- Position du téléphone au moment du signalement, si disponible.
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'validated', 'rejected', 'resolved')),
  -- Message de l'administrateur, visible par l'usager (motif d'un rejet…).
  review_note text,
  reviewed_by uuid references admins (user_id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reports_status_idx on reports (status, created_at);
create index if not exists reports_reported_by_idx on reports (reported_by, created_at);

alter table reports enable row level security;

-- Un usager lit ses propres signalements, un administrateur les lit tous.
-- Aucune écriture directe : l'envoi et le changement de statut passent par
-- les fonctions ci-dessous, qui vérifient tout (limite d'envoi, transitions).
drop policy if exists "Lecture de ses signalements" on reports;
create policy "Lecture de ses signalements" on reports
  for select using (auth.uid() = reported_by or is_admin());

-- 2. Informations fiables (signalements validés) ------------------------------------
create table if not exists network_incidents (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references reports (id) on delete cascade,
  type text not null,
  line_id uuid references lines (id) on delete set null,
  stop_id uuid references stops (id) on delete set null,
  description text not null,
  latitude double precision,
  longitude double precision,
  validated_by uuid references admins (user_id),
  validated_at timestamptz not null default now(),
  -- Renseigné quand le signalement est marqué résolu : l'incident n'est plus
  -- d'actualité.
  resolved_at timestamptz
);

create index if not exists network_incidents_active_idx on network_incidents (resolved_at, validated_at);

alter table network_incidents enable row level security;

-- Lecture publique : ces informations ont été vérifiées par un administrateur
-- et ne contiennent rien de personnel (pas l'auteur du signalement).
drop policy if exists "Lecture publique des incidents" on network_incidents;
create policy "Lecture publique des incidents" on network_incidents
  for select using (true);

-- 3. Envoi d'un signalement (usager) ------------------------------------------------
-- `security definer` pour appliquer une limite anti-abus que les policies
-- seules n'expriment pas proprement : 5 signalements par période de 24 h.
create or replace function submit_report(
  p_type text,
  p_line_id uuid,
  p_stop_id uuid,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_description text := trim(coalesce(p_description, ''));
  v_recent int;
  v_id uuid;
  v_in_senegal boolean;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;

  if p_type not in ('wrong_stop', 'line_issue', 'disruption', 'strike', 'delay', 'other') then
    raise exception 'Type de signalement inconnu.' using errcode = 'P0001';
  end if;

  if char_length(v_description) < 10 then
    raise exception 'Décrivez le problème en quelques mots (10 caractères au moins).' using errcode = 'P0001';
  end if;
  if char_length(v_description) > 1000 then
    raise exception 'La description est trop longue (1 000 caractères au plus).' using errcode = 'P0001';
  end if;

  select count(*) into v_recent
  from reports
  where reported_by = auth.uid() and created_at > now() - interval '24 hours';

  if v_recent >= 5 then
    raise exception 'Vous avez déjà envoyé 5 signalements ces dernières 24 heures — merci, ils sont en cours d''examen. Réessayez plus tard.'
      using errcode = 'P0001';
  end if;

  -- Une position hors du Sénégal (GPS bloqué sur une valeur par défaut,
  -- simulateur…) n'apporte rien : on ne la garde pas, sans bloquer l'envoi.
  v_in_senegal := p_latitude between 12 and 17 and p_longitude between -18 and -11;

  insert into reports (reported_by, type, line_id, stop_id, description, latitude, longitude, accuracy_meters)
  values (
    auth.uid(),
    p_type,
    p_line_id,
    p_stop_id,
    v_description,
    case when v_in_senegal then p_latitude end,
    case when v_in_senegal then p_longitude end,
    case when v_in_senegal then p_accuracy_meters end
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 4. Mes signalements (usager) -----------------------------------------------------
create or replace function my_reports()
returns table (
  id uuid,
  type text,
  line_code text,
  stop_name text,
  description text,
  status text,
  review_note text,
  created_at timestamptz
)
language sql
stable
security invoker
as $$
  select r.id, r.type, l.code, s.name, r.description, r.status, r.review_note, r.created_at
  from reports r
  left join lines l on l.id = r.line_id
  left join stops s on s.id = r.stop_id
  where r.reported_by = auth.uid()
  order by r.created_at desc;
$$;

-- 5. Examen par l'administrateur ----------------------------------------------------
create or replace function admin_list_reports(p_status text default null)
returns table (
  id uuid,
  type text,
  line_id uuid,
  line_code text,
  line_name text,
  stop_id uuid,
  stop_name text,
  description text,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  status text,
  review_note text,
  reviewed_at timestamptz,
  reporter_name text,
  reporter_phone text,
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
    r.id, r.type, r.line_id, l.code, l.name, r.stop_id, s.name, r.description,
    r.latitude, r.longitude, r.accuracy_meters, r.status, r.review_note, r.reviewed_at,
    p.full_name, u.phone::text, r.created_at
  from reports r
  join profiles p on p.id = r.reported_by
  join auth.users u on u.id = r.reported_by
  left join lines l on l.id = r.line_id
  left join stops s on s.id = r.stop_id
  where p_status is null or r.status = p_status
  order by r.created_at desc;
end;
$$;

-- Change le statut d'un signalement, en respectant le parcours
--   En attente → En cours de vérification → Validé / Rejeté → Résolu
-- La validation enregistre le signalement comme information fiable ; la
-- résolution clôt cette information.
create or replace function admin_set_report_status(
  p_report_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report reports%rowtype;
  v_allowed boolean;
begin
  if not is_admin() then
    raise exception 'Accès réservé aux administrateurs' using errcode = '42501';
  end if;

  select * into v_report from reports where id = p_report_id for update;
  if not found then
    raise exception 'Signalement introuvable.' using errcode = 'P0001';
  end if;

  v_allowed := case p_status
    when 'reviewing' then v_report.status = 'pending'
    when 'validated' then v_report.status = 'reviewing'
    when 'rejected' then v_report.status = 'reviewing'
    when 'resolved' then v_report.status in ('validated', 'rejected')
    else false
  end;
  if not v_allowed then
    raise exception 'Changement de statut impossible depuis « % ».', v_report.status using errcode = 'P0001';
  end if;

  update reports
  set status = p_status,
      review_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), review_note),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_report_id;

  if p_status = 'validated' then
    insert into network_incidents (report_id, type, line_id, stop_id, description, latitude, longitude, validated_by)
    values (v_report.id, v_report.type, v_report.line_id, v_report.stop_id, v_report.description,
            v_report.latitude, v_report.longitude, auth.uid())
    on conflict (report_id) do nothing;
  elsif p_status = 'resolved' then
    update network_incidents set resolved_at = now() where report_id = p_report_id and resolved_at is null;
  end if;
end;
$$;
