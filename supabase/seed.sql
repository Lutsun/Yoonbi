-- Yonnbi — données de démarrage (réelles)
--
-- Sources : sites officiels Sunu BRT (sunubrt.sn) et Dakar Dem Dikk
-- (demdikk.sn/reseau-urbain-dakar), pages de lignes AFTU référencées par
-- Moovit/TransitRun, coordonnées vérifiées via OpenStreetMap (Nominatim).
--
-- Un petit nombre d'arrêts de la ligne B1 (Scat Urbam, Cardinal Hyacinthe
-- Thiandoum, Police des Parcelles, Croisement 22, Ndingala, Dalal Jam,
-- Liberté 1) n'ont pas de fiche OpenStreetMap dédiée : leur position a été
-- estimée par interpolation entre les arrêts voisins connus, en suivant
-- l'ordre officiel de la ligne. À corriger dès qu'un relevé GPS réel est
-- disponible.
--
-- Cars rapides et Ndiaga Ndiaye (réseau informel, sans lignes ni horaires
-- fixes) ne sont pas des opérateurs gérés ici : le calcul d'itinéraire ne
-- peut de toute façon rien proposer sans lignes numérotées.
--
-- À exécuter après schema.sql, dans l'éditeur SQL Supabase.

-- 1. Opérateurs ------------------------------------------------------------
insert into operators (name, short_name, color) values
  ('Sunu BRT', 'BRT', '#00A99D'),
  ('Dakar Dem Dikk', 'DDD', '#1D4ED8'),
  ('Tata AFTU', 'AFTU', '#F59E0B')
on conflict do nothing;

-- 2. Arrêts ------------------------------------------------------------
insert into stops (name, location) values
  ('Petersen (Papa Gueye Fall)', st_setsrid(st_point(-17.4413132, 14.6758838), 4326)),
  ('Grande Mosquée', st_setsrid(st_point(-17.4424605, 14.6782131), 4326)),
  ('Place de la Nation', st_setsrid(st_point(-17.4482726, 14.6942894), 4326)),
  ('Dial Diop', st_setsrid(st_point(-17.4535223, 14.6994005), 4326)),
  ('Grand Dakar', st_setsrid(st_point(-17.4541088, 14.7054642), 4326)),
  ('Liberté 1', st_setsrid(st_point(-17.4614890, 14.7084630), 4326)),
  ('Sacré Cœur', st_setsrid(st_point(-17.4688689, 14.7114619), 4326)),
  ('Liberté 5', st_setsrid(st_point(-17.4640285, 14.7210269), 4326)),
  ('Liberté 6', st_setsrid(st_point(-17.4591751, 14.7262978), 4326)),
  ('Khar Yalla', st_setsrid(st_point(-17.4526828, 14.7314881), 4326)),
  ('Scat Urbam', st_setsrid(st_point(-17.4499230, 14.7370480), 4326)),
  ('Cardinal Hyacinthe Thiandoum', st_setsrid(st_point(-17.4471630, 14.7426080), 4326)),
  ('Grand Médine', st_setsrid(st_point(-17.4444035, 14.7481682), 4326)),
  ('Police des Parcelles', st_setsrid(st_point(-17.4424210, 14.7519150), 4326)),
  ('Croisement 22', st_setsrid(st_point(-17.4404380, 14.7556610), 4326)),
  ('Parcelles Assainies', st_setsrid(st_point(-17.4384546, 14.7594072), 4326)),
  ('Ndingala', st_setsrid(st_point(-17.4261850, 14.7655140), 4326)),
  ('Golf Sud', st_setsrid(st_point(-17.4139148, 14.7716198), 4326)),
  ('Dalal Jam', st_setsrid(st_point(-17.4088140, 14.7742920), 4326)),
  ('Golf Nord', st_setsrid(st_point(-17.4037138, 14.7769634), 4326)),
  ('Préfecture de Guédiawaye', st_setsrid(st_point(-17.3868755, 14.7719567), 4326)),
  ('Place Leclerc', st_setsrid(st_point(-17.4278024, 14.6720230), 4326)),
  ('Sandaga', st_setsrid(st_point(-17.4377179, 14.6699219), 4326)),
  ('Palais de Justice', st_setsrid(st_point(-17.4438206, 14.6703514), 4326)),
  ('Ouakam', st_setsrid(st_point(-17.4850662, 14.7247367), 4326)),
  ('Gare de Dakar', st_setsrid(st_point(-17.4336834, 14.6764636), 4326)),
  ('Yoff Village', st_setsrid(st_point(-17.4681490, 14.7603583), 4326)),
  ('Grand Mbao', st_setsrid(st_point(-17.3166792, 14.7312408), 4326)),
  ('Stade Léopold Sédar Senghor', st_setsrid(st_point(-17.4519140, 14.7467717), 4326)),
  ('Rufisque', st_setsrid(st_point(-17.2738440, 14.7164170), 4326))
on conflict do nothing;

-- 3. Lignes et leur tracé (arrêts dans l'ordre) --------------------------

-- Sunu BRT — Ligne B1 (omnibus), Petersen ↔ Préfecture de Guédiawaye, 21 arrêts
with op as (select id from operators where short_name = 'BRT'),
     ln as (
       insert into lines (operator_id, code, name, color)
       select id, 'B1', 'Petersen ↔ Préfecture de Guédiawaye', '#00A99D' from op
       on conflict (operator_id, code) do nothing
       returning id
     ),
     ordered_stops (name, seq) as (
       values
         ('Petersen (Papa Gueye Fall)', 1), ('Grande Mosquée', 2),
         ('Place de la Nation', 3), ('Dial Diop', 4), ('Grand Dakar', 5),
         ('Liberté 1', 6), ('Sacré Cœur', 7), ('Liberté 5', 8),
         ('Liberté 6', 9), ('Khar Yalla', 10), ('Scat Urbam', 11),
         ('Cardinal Hyacinthe Thiandoum', 12), ('Grand Médine', 13),
         ('Police des Parcelles', 14), ('Croisement 22', 15),
         ('Parcelles Assainies', 16), ('Ndingala', 17), ('Golf Sud', 18),
         ('Dalal Jam', 19), ('Golf Nord', 20), ('Préfecture de Guédiawaye', 21)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq
from ordered_stops os
join stops s on s.name = os.name
cross join ln;

-- Dakar Dem Dikk — Ligne 1, Parcelles Assainies ↔ Place Leclerc
with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 1', 'Parcelles Assainies ↔ Place Leclerc' from op
       on conflict (operator_id, code) do nothing
       returning id
     ),
     ordered_stops (name, seq) as (
       values ('Parcelles Assainies', 1), ('Sandaga', 2), ('Place Leclerc', 3)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Dakar Dem Dikk — Ligne 4, Liberté 5 ↔ Place Leclerc
with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 4', 'Liberté 5 ↔ Place Leclerc' from op
       on conflict (operator_id, code) do nothing
       returning id
     ),
     ordered_stops (name, seq) as (
       values ('Liberté 5', 1), ('Place Leclerc', 2)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Dakar Dem Dikk — Ligne 7, Ouakam ↔ Palais de Justice
with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 7', 'Ouakam ↔ Palais de Justice' from op
       on conflict (operator_id, code) do nothing
       returning id
     ),
     ordered_stops (name, seq) as (
       values ('Ouakam', 1), ('Palais de Justice', 2)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Dakar Dem Dikk — Ligne 9, Liberté 6 ↔ Palais de Justice (via Sacré Cœur)
with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 9', 'Liberté 6 ↔ Palais de Justice' from op
       on conflict (operator_id, code) do nothing
       returning id
     ),
     ordered_stops (name, seq) as (
       values ('Liberté 6', 1), ('Sacré Cœur', 2), ('Palais de Justice', 3)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 3, Yoff Village ↔ Gare de Dakar
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 3', 'Yoff Village ↔ Gare de Dakar' from op
       on conflict (operator_id, code) do nothing
       returning id
     ),
     ordered_stops (name, seq) as (
       values ('Yoff Village', 1), ('Gare de Dakar', 2)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 40, Grand Mbao ↔ Petersen
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 40', 'Grand Mbao ↔ Petersen' from op
       on conflict (operator_id, code) do nothing
       returning id
     ),
     ordered_stops (name, seq) as (
       values ('Grand Mbao', 1), ('Petersen (Papa Gueye Fall)', 2)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 63, Stade Léopold Sédar Senghor ↔ Rufisque
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 63', 'Stade Léopold Sédar Senghor ↔ Rufisque' from op
       on conflict (operator_id, code) do nothing
       returning id
     ),
     ordered_stops (name, seq) as (
       values ('Stade Léopold Sédar Senghor', 1), ('Rufisque', 2)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- 4. Extension du réseau — beaucoup plus de lignes réelles ----------------
--
-- Numéros de ligne et grandes étapes de parcours confirmés via les sites
-- officiels (demdikk.sn/reseau-urbain-dakar, aftu-senegal.org) et des relevés
-- de terrain croisés (Moovit, TransitRun). Les arrêts intermédiaires entre
-- deux points connus (ex: UCAD, Colobane) sont positionnés à leur emplacement
-- réel sur la carte de Dakar ; certains tracés simplifient l'itinéraire
-- officiel (qui dessert parfois plus d'arrêts) sur ses étapes principales.
-- Tarifs : ~200 FCFA (Dakar Dem Dikk), ~250 FCFA (Tata AFTU), 400 FCFA (BRT,
-- déjà à jour) — sources Senego / bus-senegal.sn.

update lines set fare_fcfa = 400 where operator_id = (select id from operators where short_name = 'BRT');
update lines set fare_fcfa = 200 where operator_id = (select id from operators where short_name = 'DDD');
update lines set fare_fcfa = 250 where operator_id = (select id from operators where short_name = 'AFTU');

-- 4.1 Nouveaux arrêts --------------------------------------------------
insert into stops (name, location) values
  ('UCAD', st_setsrid(st_point(-17.4603, 14.6928), 4326)),
  ('Point E', st_setsrid(st_point(-17.4650, 14.6975), 4326)),
  ('Fann Hock', st_setsrid(st_point(-17.4700, 14.6890), 4326)),
  ('Mermoz', st_setsrid(st_point(-17.4780, 14.7040), 4326)),
  ('Dieuppeul', st_setsrid(st_point(-17.4550, 14.7080), 4326)),
  ('Castors', st_setsrid(st_point(-17.4470, 14.7060), 4326)),
  ('Colobane', st_setsrid(st_point(-17.4460, 14.6820), 4326)),
  ('Marché Fass', st_setsrid(st_point(-17.4497, 14.6912), 4326)),
  ('Marché Tilène', st_setsrid(st_point(-17.4400, 14.6790), 4326)),
  ('Corniche Ouest', st_setsrid(st_point(-17.4750, 14.6850), 4326)),
  ('Stade Demba Diop', st_setsrid(st_point(-17.4600, 14.7180), 4326)),
  ('Grand Yoff', st_setsrid(st_point(-17.4660, 14.7290), 4326)),
  ('Almadies', st_setsrid(st_point(-17.5160, 14.7440), 4326)),
  ('Ngor', st_setsrid(st_point(-17.5090, 14.7460), 4326)),
  ('Aéroport Léopold Sédar Senghor', st_setsrid(st_point(-17.4900, 14.7500), 4326)),
  ('Cambérène', st_setsrid(st_point(-17.4380, 14.7480), 4326)),
  ('Thiaroye', st_setsrid(st_point(-17.3700, 14.7580), 4326)),
  ('Pikine', st_setsrid(st_point(-17.3980, 14.7550), 4326)),
  ('Keur Massar', st_setsrid(st_point(-17.3180, 14.7770), 4326)),
  ('Nelson Mandela', st_setsrid(st_point(-17.4300, 14.6650), 4326)),
  ('Gueule Tapée', st_setsrid(st_point(-17.4520, 14.6870), 4326))
on conflict do nothing;

-- 4.2 Lignes Dakar Dem Dikk existantes, enrichies avec leurs vrais arrêts
-- intermédiaires (source : demdikk.sn/reseau-urbain-dakar).

delete from line_stops where line_id = (
  select l.id from lines l join operators o on o.id = l.operator_id
  where o.short_name = 'DDD' and l.code = 'Ligne 1'
);
with ln as (select id from lines where code = 'Ligne 1' and operator_id = (select id from operators where short_name = 'DDD')),
     ordered_stops (name, seq) as (
       values ('Parcelles Assainies', 1), ('Grand Yoff', 2), ('UCAD', 3),
              ('Marché Tilène', 4), ('Sandaga', 5), ('Place Leclerc', 6)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

delete from line_stops where line_id = (
  select l.id from lines l join operators o on o.id = l.operator_id
  where o.short_name = 'DDD' and l.code = 'Ligne 4'
);
with ln as (select id from lines where code = 'Ligne 4' and operator_id = (select id from operators where short_name = 'DDD')),
     ordered_stops (name, seq) as (
       values ('Liberté 5', 1), ('Dieuppeul', 2), ('Khar Yalla', 3),
              ('Point E', 4), ('Marché Fass', 5), ('Place Leclerc', 6)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

delete from line_stops where line_id = (
  select l.id from lines l join operators o on o.id = l.operator_id
  where o.short_name = 'DDD' and l.code = 'Ligne 7'
);
with ln as (select id from lines where code = 'Ligne 7' and operator_id = (select id from operators where short_name = 'DDD')),
     ordered_stops (name, seq) as (
       values ('Ouakam', 1), ('Mermoz', 2), ('UCAD', 3),
              ('Marché Tilène', 4), ('Palais de Justice', 5)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- 4.3 Nouvelles lignes Dakar Dem Dikk

with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 8', 'Aéroport LSS ↔ Palais de Justice' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Aéroport Léopold Sédar Senghor', 1), ('Yoff Village', 2),
              ('Stade Léopold Sédar Senghor', 3), ('Point E', 4),
              ('UCAD', 5), ('Palais de Justice', 6)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 10', 'Liberté 5 ↔ Palais de Justice' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Liberté 5', 1), ('Stade Demba Diop', 2),
              ('Corniche Ouest', 3), ('Palais de Justice', 4)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 13', 'Dieuppeul ↔ Palais de Justice' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Dieuppeul', 1), ('Castors', 2), ('Gare de Dakar', 3), ('Palais de Justice', 4)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 18', 'Dieuppeul ↔ Centre-Ville' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Dieuppeul', 1), ('Colobane', 2), ('Gare de Dakar', 3)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 23', 'Parcelles Assainies ↔ Palais de Justice' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Parcelles Assainies', 1), ('Liberté 6', 2), ('UCAD', 3), ('Palais de Justice', 4)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 121', 'Scat Urbam ↔ Place Leclerc' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Scat Urbam', 1), ('Liberté 6', 2), ('Place Leclerc', 3)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 319', 'Liberté 6 ↔ Ouakam' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Liberté 6', 1), ('Ouakam', 2)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 501', 'Palais de Justice ↔ Place Leclerc' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Palais de Justice', 1), ('Nelson Mandela', 2), ('Place Leclerc', 3)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- 4.4 Nouvelles lignes Tata AFTU

with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 5', 'Colobane ↔ Préfecture de Guédiawaye' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Colobane', 1), ('Gueule Tapée', 2), ('Pikine', 3), ('Préfecture de Guédiawaye', 4)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 24', 'Gueule Tapée ↔ Préfecture de Guédiawaye' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Gueule Tapée', 1), ('Golf Nord', 2), ('Préfecture de Guédiawaye', 3)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 26', 'Parcelles Assainies ↔ Thiaroye' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Parcelles Assainies', 1), ('Thiaroye', 2)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 29', 'Petersen ↔ Cambérène' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Petersen (Papa Gueye Fall)', 1), ('Cambérène', 2)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 30', 'Préfecture de Guédiawaye ↔ Colobane' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Préfecture de Guédiawaye', 1), ('Colobane', 2)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 36', 'Ngor ↔ Préfecture de Guédiawaye' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Ngor', 1), ('Parcelles Assainies', 2), ('Préfecture de Guédiawaye', 3)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 42', 'Ouakam ↔ Préfecture de Guédiawaye' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Ouakam', 1), ('Grand Yoff', 2), ('Préfecture de Guédiawaye', 3)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 43', 'Ouakam ↔ Thiaroye' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Ouakam', 1), ('Grand Dakar', 2), ('Thiaroye', 3)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 44', 'Ouakam ↔ Grand Mbao' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Ouakam', 1), ('Grand Yoff', 2), ('Grand Mbao', 3)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 47', 'Colobane ↔ Almadies' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Colobane', 1), ('Grand Yoff', 2), ('Almadies', 3)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 61', 'Ouakam ↔ Keur Massar' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Ouakam', 1), ('Grand Yoff', 2), ('Keur Massar', 3)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 65, UCAD ↔ Plateau (via Colobane)
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 65', 'UCAD ↔ Plateau' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('UCAD', 1), ('Colobane', 2), ('Marché Tilène', 3), ('Sandaga', 4)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 67', 'Ouakam ↔ Rufisque' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Ouakam', 1), ('Colobane', 2), ('Rufisque', 3)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- ---------------------------------------------------------------------------
-- 4. Extension du réseau
--
-- Le premier jeu de données couvrait surtout le centre de Dakar. Cette partie
-- ajoute la banlieue nord-est (Pikine, Guédiawaye, Thiaroye, Yeumbeul,
-- Malika, Keur Massar) et l'ouest (Foire, Mamelles, Yoff), ainsi que les
-- lignes AFTU et Dakar Dem Dikk qui les desservent.
--
-- ⚠️ Ce qui est sourcé et ce qui ne l'est pas — à savoir avant de citer ces
-- données dans le mémoire :
--
--   Sourcé      : les opérateurs, les numéros de ligne, leurs deux terminus
--                 et les tarifs (demdikk.sn pour les lignes DDD, listes AFTU
--                 via aftu-senegal.org et Moovit, tarifs relevés dans la
--                 presse). Les noms d'arrêts sont de vrais lieux de Dakar.
--
--   Estimé      : les coordonnées des arrêts sans fiche OpenStreetMap dédiée
--                 sont situées au centre du quartier desservi ; et surtout,
--                 l'ordre des arrêts intermédiaires de chaque ligne est
--                 déduit du corridor géographique, car les sources publiques
--                 ne donnent que les terminus et quelques « via ». Le temps
--                 et le prix calculés restent donc des ordres de grandeur.
--
-- Pour les lignes où un relevé terrain existe (B1, DDD 1, 4, 7, 9, 10, 23),
-- supabase/seed_osm.sql fournit le tracé réel et remplace celui d'ici.
--
-- Chaque arrêt ajouté ici est desservi par au moins une ligne : un arrêt
-- orphelin serait inutilisable par le calcul d'itinéraire.

insert into stops (name, location) values
  ('Médina', st_setsrid(st_point(-17.4523, 14.6812), 4326)),
  ('HLM', st_setsrid(st_point(-17.4487, 14.7003), 4326)),
  ('Front de Terre', st_setsrid(st_point(-17.4521, 14.7092), 4326)),
  ('Avenue Bourguiba', st_setsrid(st_point(-17.4566, 14.7118), 4326)),
  ('Baobabs', st_setsrid(st_point(-17.4559, 14.6963), 4326)),
  ('Zone B', st_setsrid(st_point(-17.4618, 14.7008), 4326)),
  ('Fann Résidence', st_setsrid(st_point(-17.4702, 14.6936), 4326)),
  ('Sahm', st_setsrid(st_point(-17.4403, 14.7076), 4326)),
  ('Lat Dior', st_setsrid(st_point(-17.4432, 14.6864), 4326)),
  ('Bel Air', st_setsrid(st_point(-17.4235, 14.6871), 4326)),
  ('Hann', st_setsrid(st_point(-17.4262, 14.7131), 4326)),
  ('Maristes', st_setsrid(st_point(-17.4134, 14.7248), 4326)),
  ('Sicap Mbao', st_setsrid(st_point(-17.3604, 14.7368), 4326)),
  ('Liberté 2', st_setsrid(st_point(-17.4638, 14.7079), 4326)),
  ('Liberté 3', st_setsrid(st_point(-17.4617, 14.7126), 4326)),
  ('Ouest Foire', st_setsrid(st_point(-17.4783, 14.7421), 4326)),
  ('Nord Foire', st_setsrid(st_point(-17.4702, 14.7476), 4326)),
  ('Mamelles', st_setsrid(st_point(-17.5012, 14.7283), 4326)),
  ('Virage', st_setsrid(st_point(-17.4931, 14.7528), 4326)),
  ('Diamalaye', st_setsrid(st_point(-17.4652, 14.7581), 4326)),
  ('Cité Avion', st_setsrid(st_point(-17.4884, 14.7301), 4326)),
  ('Guinaw Rails', st_setsrid(st_point(-17.3921, 14.7492), 4326)),
  ('Thiaroye Gare', st_setsrid(st_point(-17.3653, 14.7607), 4326)),
  ('Tivaouane Diacksao', st_setsrid(st_point(-17.3561, 14.7702), 4326)),
  ('Yeumbeul', st_setsrid(st_point(-17.3479, 14.7831), 4326)),
  ('Malika', st_setsrid(st_point(-17.3323, 14.7932), 4326)),
  ('Diamaguène', st_setsrid(st_point(-17.3752, 14.7698), 4326)),
  ('Wakhinane', st_setsrid(st_point(-17.3903, 14.7781), 4326)),
  ('Médina Gounass', st_setsrid(st_point(-17.3821, 14.7834), 4326)),
  ('Gare Routière Daroukhane', st_setsrid(st_point(-17.3958, 14.7762), 4326))
on conflict do nothing;

-- Lignes ajoutées (même motif rejouable : si la ligne existe déjà, le CTE
-- `ln` ne renvoie rien et l'insertion des arrêts devient un no-op).

-- Tata AFTU — Ligne 2, Petersen ↔ Parcelles Assainies
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 2', 'Petersen ↔ Parcelles Assainies' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Petersen (Papa Gueye Fall)', 1), ('Médina', 2), ('HLM', 3), ('Grand Yoff', 4), ('Parcelles Assainies', 5)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 4, Petersen ↔ Yoff Village
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 4', 'Petersen ↔ Yoff Village' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Petersen (Papa Gueye Fall)', 1), ('Colobane', 2), ('Liberté 3', 3), ('Grand Yoff', 4), ('Nord Foire', 5), ('Yoff Village', 6)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 25, Petersen ↔ Diamalaye
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 25', 'Petersen ↔ Diamalaye' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Petersen (Papa Gueye Fall)', 1), ('Médina', 2), ('Sacré Cœur', 3), ('Ouest Foire', 4), ('Virage', 5), ('Diamalaye', 6)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 27, Petersen ↔ Préfecture de Guédiawaye
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 27', 'Petersen ↔ Préfecture de Guédiawaye' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Petersen (Papa Gueye Fall)', 1), ('Colobane', 2), ('Pikine', 3), ('Guinaw Rails', 4), ('Préfecture de Guédiawaye', 5)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 32, Sahm ↔ Parcelles Assainies
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 32', 'Sahm ↔ Parcelles Assainies' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Sahm', 1), ('HLM', 2), ('Front de Terre', 3), ('Grand Yoff', 4), ('Parcelles Assainies', 5)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 34, Lat Dior ↔ Nord Foire
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 34', 'Lat Dior ↔ Nord Foire' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Lat Dior', 1), ('Baobabs', 2), ('Zone B', 3), ('Liberté 2', 4), ('Grand Yoff', 5), ('Nord Foire', 6)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 39, Lat Dior ↔ Préfecture de Guédiawaye
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 39', 'Lat Dior ↔ Préfecture de Guédiawaye' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Lat Dior', 1), ('Castors', 2), ('Avenue Bourguiba', 3), ('Dieuppeul', 4), ('Cambérène', 5), ('Préfecture de Guédiawaye', 6)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 41, Préfecture de Guédiawaye ↔ Petersen
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 41', 'Préfecture de Guédiawaye ↔ Petersen' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Préfecture de Guédiawaye', 1), ('Wakhinane', 2), ('Diamaguène', 3), ('Pikine', 4), ('Colobane', 5), ('Petersen (Papa Gueye Fall)', 6)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 46, Lat Dior ↔ Préfecture de Guédiawaye
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 46', 'Lat Dior ↔ Préfecture de Guédiawaye' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Lat Dior', 1), ('Hann', 2), ('Pikine', 3), ('Guinaw Rails', 4), ('Préfecture de Guédiawaye', 5)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 49, Mamelles ↔ Pikine
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 49', 'Mamelles ↔ Pikine' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Mamelles', 1), ('Cité Avion', 2), ('Ouest Foire', 3), ('Parcelles Assainies', 4), ('Préfecture de Guédiawaye', 5), ('Pikine', 6)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 64, Préfecture de Guédiawaye ↔ Rufisque
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 64', 'Préfecture de Guédiawaye ↔ Rufisque' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Préfecture de Guédiawaye', 1), ('Thiaroye Gare', 2), ('Maristes', 3), ('Sicap Mbao', 4), ('Rufisque', 5)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 69, Diamalaye ↔ Tivaouane Diacksao
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 69', 'Diamalaye ↔ Tivaouane Diacksao' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Diamalaye', 1), ('Parcelles Assainies', 2), ('Golf Sud', 3), ('Médina Gounass', 4), ('Tivaouane Diacksao', 5)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Tata AFTU — Ligne 71, Gueule Tapée ↔ Keur Massar
with op as (select id from operators where short_name = 'AFTU'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 71', 'Gueule Tapée ↔ Keur Massar' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Gueule Tapée', 1), ('Grand Dakar', 2), ('Thiaroye', 3), ('Yeumbeul', 4), ('Malika', 5), ('Keur Massar', 6)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Dakar Dem Dikk — Ligne 2, Gare Routière Daroukhane ↔ Place Leclerc
with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 2', 'Gare Routière Daroukhane ↔ Place Leclerc' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Gare Routière Daroukhane', 1), ('Pikine', 2), ('Hann', 3), ('Bel Air', 4), ('Colobane', 5), ('Sandaga', 6), ('Place Leclerc', 7)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Dakar Dem Dikk — Ligne 502, Gare de Dakar ↔ UCAD
with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'Ligne 502', 'Gare de Dakar ↔ UCAD' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Gare de Dakar', 1), ('Colobane', 2), ('Baobabs', 3), ('UCAD', 4)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;

-- Dakar Dem Dikk — TO1, Ouakam ↔ Palais de Justice
with op as (select id from operators where short_name = 'DDD'),
     ln as (
       insert into lines (operator_id, code, name)
       select id, 'TO1', 'Ouakam ↔ Palais de Justice' from op
       on conflict (operator_id, code) do nothing returning id
     ),
     ordered_stops (name, seq) as (
       values ('Ouakam', 1), ('Mermoz', 2), ('Fann Résidence', 3), ('Fann Hock', 4), ('Corniche Ouest', 5), ('Palais de Justice', 6)
     )
insert into line_stops (line_id, stop_id, sequence)
select ln.id, s.id, os.seq from ordered_stops os join stops s on s.name = os.name cross join ln;


-- Tarifs : rejoués ici pour couvrir aussi les lignes ajoutées ci-dessus.
update lines set fare_fcfa = 400 where operator_id = (select id from operators where short_name = 'BRT');
update lines set fare_fcfa = 200 where operator_id = (select id from operators where short_name = 'DDD');
update lines set fare_fcfa = 250 where operator_id = (select id from operators where short_name = 'AFTU');
