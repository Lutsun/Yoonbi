-- Yoonbi — arrêts de bus devant les gares TER
--
-- Généré par scripts/build_ter_connections.py — ne pas modifier à la main.
-- À exécuter après ter.sql, dans l'éditeur SQL Supabase. Rejouable sans
-- risque : un arrêt déjà présent sur une ligne n'y est pas ajouté deux fois.
--
-- Positions © les contributeurs OpenStreetMap (ODbL) quand un arrêt y est
-- relevé ; sinon, le point de passage de la ligne au plus près de la gare.

-- Gare TER Hann
insert into stops (name, location) values ('Arrêt Gare TER Hann', st_setsrid(st_point(-17.4317379, 14.7209996), 4326))
on conflict (name) do update set location = excluded.location;

do $$
declare
  v_line uuid := (select l.id from lines l join operators o on o.id = l.operator_id
                  where o.short_name = 'AFTU' and l.code = 'Ligne 43');
  v_stop uuid := (select id from stops where name = 'Arrêt Gare TER Hann');
  v_after int := (select ls.sequence from line_stops ls join stops s on s.id = ls.stop_id
                  where ls.line_id = v_line and s.name = 'Grand Dakar' order by ls.sequence limit 1);
begin
  if v_line is null or v_stop is null or v_after is null then return; end if;
  if exists (select 1 from line_stops where line_id = v_line and stop_id = v_stop) then return; end if;
  -- Décale les arrêts suivants (en deux temps : la clé (ligne, ordre) est unique).
  update line_stops set sequence = sequence + 100000 where line_id = v_line and sequence > v_after;
  update line_stops set sequence = sequence - 99999 where line_id = v_line and sequence > 100000;
  insert into line_stops (line_id, stop_id, sequence) values (v_line, v_stop, v_after + 1);
end $$;

-- Gare TER Thiaroye
insert into stops (name, location) values ('Arrêt Gare TER Thiaroye', st_setsrid(st_point(-17.3803112, 14.7582120), 4326))
on conflict (name) do update set location = excluded.location;

do $$
declare
  v_line uuid := (select l.id from lines l join operators o on o.id = l.operator_id
                  where o.short_name = 'AFTU' and l.code = 'Ligne 26');
  v_stop uuid := (select id from stops where name = 'Arrêt Gare TER Thiaroye');
  v_after int := (select ls.sequence from line_stops ls join stops s on s.id = ls.stop_id
                  where ls.line_id = v_line and s.name = 'Parcelles Assainies' order by ls.sequence limit 1);
begin
  if v_line is null or v_stop is null or v_after is null then return; end if;
  if exists (select 1 from line_stops where line_id = v_line and stop_id = v_stop) then return; end if;
  -- Décale les arrêts suivants (en deux temps : la clé (ligne, ordre) est unique).
  update line_stops set sequence = sequence + 100000 where line_id = v_line and sequence > v_after;
  update line_stops set sequence = sequence - 99999 where line_id = v_line and sequence > 100000;
  insert into line_stops (line_id, stop_id, sequence) values (v_line, v_stop, v_after + 1);
end $$;

-- Gare TER Yeumbeul
insert into stops (name, location) values ('Arrêt Gare TER Yeumbeul', st_setsrid(st_point(-17.3563799, 14.7645525), 4326))
on conflict (name) do update set location = excluded.location;

do $$
declare
  v_line uuid := (select l.id from lines l join operators o on o.id = l.operator_id
                  where o.short_name = 'AFTU' and l.code = 'Ligne 61');
  v_stop uuid := (select id from stops where name = 'Arrêt Gare TER Yeumbeul');
  v_after int := (select ls.sequence from line_stops ls join stops s on s.id = ls.stop_id
                  where ls.line_id = v_line and s.name = 'Grand Yoff' order by ls.sequence limit 1);
begin
  if v_line is null or v_stop is null or v_after is null then return; end if;
  if exists (select 1 from line_stops where line_id = v_line and stop_id = v_stop) then return; end if;
  -- Décale les arrêts suivants (en deux temps : la clé (ligne, ordre) est unique).
  update line_stops set sequence = sequence + 100000 where line_id = v_line and sequence > v_after;
  update line_stops set sequence = sequence - 99999 where line_id = v_line and sequence > 100000;
  insert into line_stops (line_id, stop_id, sequence) values (v_line, v_stop, v_after + 1);
end $$;

