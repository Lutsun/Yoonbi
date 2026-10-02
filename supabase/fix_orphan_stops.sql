-- Yoonbi — correctif ponctuel : arrêts orphelins (sans aucune ligne)
--
-- À exécuter une fois, après schema.sql / seed.sql / seed_osm.sql, dans
-- l'éditeur SQL Supabase. Rejouable sans risque.
--
-- Pourquoi ces arrêts étaient orphelins (vus sur la carte sans aucune ligne
-- renseignée, dont « Corniche Ouest » signalé en plein mer) :
--
-- 1. Trois sont des doublons laissés par seed.sql : son tracé estimé du BRT
--    B1 a été remplacé par le tracé réel de seed_osm.sql, qui orthographie
--    différemment les mêmes arrêts (« Sacré Cœur » / « Sacré Coeur »,
--    « Cardinal Hyacinthe » / « Hyancinthe » Thiandoum, « Dalal Jam » /
--    « Jamm »). La version de seed_osm.sql est la bonne (relevée sur le
--    terrain) ; l'autre ne sert plus à rien. Pareil pour « Marché Fass » et
--    « Stade Demba Diop » : ils venaient du tracé estimé des lignes 4 et 10,
--    remplacé depuis par le tracé réel de seed_osm.sql, qui ne les dessert
--    pas.
-- 2. « Corniche Ouest », « Fann Hock » et « Mermoz » devaient appartenir à
--    une ligne « TO1 » (Ouakam ↔ Palais de Justice) qui n'a en réalité
--    jamais été créée — et un de ses arrêts, « Fann Résidence », n'existait
--    pas du tout dans la table `stops`. Ce correctif crée la ligne et
--    l'arrêt manquant, puis rattache tout correctement.

-- 1. Doublons obsolètes, superseded par seed_osm.sql — supprimés -------------
delete from line_stops where stop_id in (
  select id from stops where name in (
    'Sacré Cœur', 'Cardinal Hyacinthe Thiandoum', 'Dalal Jam',
    'Marché Fass', 'Stade Demba Diop'
  )
);
delete from stops where name in (
  'Sacré Cœur', 'Cardinal Hyacinthe Thiandoum', 'Dalal Jam',
  'Marché Fass', 'Stade Demba Diop'
);

-- 2. « Corniche Ouest » était placé en mer — repositionné sur la route de
-- la Corniche Ouest elle-même (OpenStreetMap, way 108176356).
update stops set location = st_setsrid(st_point(-17.4599, 14.6793), 4326)
where name = 'Corniche Ouest';

-- 3. L'arrêt manquant pour la ligne TO1 (OpenStreetMap, quartier Fann Résidence).
insert into stops (name, location)
values ('Fann Résidence', st_setsrid(st_point(-17.4708650, 14.6897254), 4326))
on conflict (name) do nothing;

-- 4. La ligne TO1 elle-même, jamais créée, et son tracé réel.
insert into lines (operator_id, code, name)
select id, 'TO1', 'Ouakam ↔ Palais de Justice' from operators where short_name = 'DDD'
on conflict (operator_id, code) do update set name = excluded.name;

delete from line_stops where line_id = (
  select l.id from lines l join operators o on o.id = l.operator_id
  where o.short_name = 'DDD' and l.code = 'TO1'
);

insert into line_stops (line_id, stop_id, sequence)
select
  (select l.id from lines l join operators o on o.id = l.operator_id
     where o.short_name = 'DDD' and l.code = 'TO1'),
  s.id, v.seq
from (values
  ('Ouakam', 1),
  ('Mermoz', 2),
  ('Fann Résidence', 3),
  ('Fann Hock', 4),
  ('Corniche Ouest', 5),
  ('Palais de Justice', 6)
) as v(name, seq)
join stops s on s.name = v.name;
