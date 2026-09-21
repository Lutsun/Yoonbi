-- Yonnbi — tracés de lignes relevés sur le terrain
--
-- Source : OpenStreetMap (© les contributeurs OpenStreetMap), extrait via
-- l'API Overpass le 2026-09-16 sur l'emprise de Dakar.
-- Licence ODbL : la réutilisation impose de citer OpenStreetMap dans
-- l'application et dans le mémoire.
--
-- Contrairement au reste de seed.sql, rien n'est estimé ici : les
-- coordonnées de chaque arrêt et l'ordre des arrêts le long de chaque ligne
-- viennent de relevés. Ce fichier fait donc autorité sur les lignes qu'il
-- couvre et remplace leur tracé approximatif.
--
-- Seule retouche : les noms écrits tout en majuscules dans OSM sont passés
-- en casse normale, pour l'affichage. Aucun nom n'a été inventé.
--
-- À exécuter APRÈS schema.sql et seed.sql.

-- 1. Arrêts relevés ------------------------------------------------------
insert into stops (name, location) values
  ('Alybaba', st_setsrid(st_point(-17.4345883, 14.6694574), 4326)),
  ('Arret 2 voies Sacré coeur', st_setsrid(st_point(-17.4650039, 14.7196363), 4326)),
  ('Arret Bus Aftu', st_setsrid(st_point(-17.4597119, 14.6910578), 4326)),
  ('Arret Cite Montagne Parcelles', st_setsrid(st_point(-17.4456089, 14.7462716), 4326)),
  ('Arret Cite Soprim', st_setsrid(st_point(-17.4366257, 14.7518652), 4326)),
  ('Arret JVC', st_setsrid(st_point(-17.4638958, 14.7223125), 4326)),
  ('Arret Liberté 6', st_setsrid(st_point(-17.4636853, 14.7258135), 4326)),
  ('Arret PA U08', st_setsrid(st_point(-17.4356977, 14.7557106), 4326)),
  ('Arret Police Parcelles', st_setsrid(st_point(-17.4406336, 14.7503782), 4326)),
  ('Arret Rond Point 6', st_setsrid(st_point(-17.4565734, 14.7308875), 4326)),
  ('Arret Tally Bou Bess Parcelles', st_setsrid(st_point(-17.4438396, 14.7485016), 4326)),
  ('Arret Terrain liberté 6', st_setsrid(st_point(-17.4624771, 14.7268979), 4326)),
  ('Arret brioche dorée Liberté 6', st_setsrid(st_point(-17.4652062, 14.7233982), 4326)),
  ('Arret sacré coeur - BEM', st_setsrid(st_point(-17.4663856, 14.7163545), 4326)),
  ('Arrêt  PA U20', st_setsrid(st_point(-17.4444913, 14.7595475), 4326)),
  ('Arrêt Avenue Fahd Ben Abdel Aziz', st_setsrid(st_point(-17.455351, 14.7284268), 4326)),
  ('Arrêt Clémenceau', st_setsrid(st_point(-17.4369275, 14.6616769), 4326)),
  ('Arrêt Credit Mutuel', st_setsrid(st_point(-17.455744, 14.7354522), 4326)),
  ('Arrêt Croisement BrioheD''orée Diamalaye', st_setsrid(st_point(-17.4510514, 14.7589589), 4326)),
  ('Arrêt DDD Av Roi Fahd Ben Abdel Aziz', st_setsrid(st_point(-17.4504062, 14.7277425), 4326)),
  ('Arrêt DDD L23', st_setsrid(st_point(-17.4351526, 14.7538047), 4326)),
  ('Arrêt Ecole Elementaire', st_setsrid(st_point(-17.4496769, 14.7615744), 4326)),
  ('Arrêt El Malick', st_setsrid(st_point(-17.4404423, 14.671611), 4326)),
  ('Arrêt Limite Khar YALLA', st_setsrid(st_point(-17.4531514, 14.7281273), 4326)),
  ('Arrêt Mairie Parcelles Assainies', st_setsrid(st_point(-17.4369906, 14.757473), 4326)),
  ('Arrêt Mosquée Arafat5', st_setsrid(st_point(-17.4532981, 14.7396452), 4326)),
  ('Arrêt PA U17', st_setsrid(st_point(-17.4402797, 14.7567899), 4326)),
  ('Arrêt PA U19', st_setsrid(st_point(-17.4482103, 14.7604762), 4326)),
  ('Arrêt PA U21', st_setsrid(st_point(-17.4462618, 14.7555965), 4326)),
  ('Arrêt PA U23', st_setsrid(st_point(-17.4482508, 14.7612249), 4326)),
  ('Arrêt PA U24', st_setsrid(st_point(-17.4471002, 14.7558066), 4326)),
  ('Arrêt Terrain-Acapes', st_setsrid(st_point(-17.4472442, 14.7560153), 4326)),
  ('Arrêt autobus DDD 10', st_setsrid(st_point(-17.4655512, 14.6775748), 4326)),
  ('Arrêt autobus DDD 23-18', st_setsrid(st_point(-17.4516198, 14.6768192), 4326)),
  ('Arrêt école Dior', st_setsrid(st_point(-17.4471448, 14.7590235), 4326)),
  ('Cardinal Hyancinthe Thiandoum', st_setsrid(st_point(-17.451336, 14.7415853), 4326)),
  ('Croisement 22', st_setsrid(st_point(-17.4332535, 14.7539779), 4326)),
  ('Dalal Jamm', st_setsrid(st_point(-17.408201, 14.7719783), 4326)),
  ('Deuxième porte Mermoz', st_setsrid(st_point(-17.4733993, 14.7027722), 4326)),
  ('Dial Diop', st_setsrid(st_point(-17.4535498, 14.699379), 4326)),
  ('Eglise Saint Joseph', st_setsrid(st_point(-17.4554847, 14.6864512), 4326)),
  ('Fith Mith', st_setsrid(st_point(-17.4055188, 14.775328), 4326)),
  ('Gare Palais 1', st_setsrid(st_point(-17.433456, 14.6510408), 4326)),
  ('Gare Palais 2', st_setsrid(st_point(-17.433433, 14.652875), 4326)),
  ('Golf Nord', st_setsrid(st_point(-17.3984054, 14.7763179), 4326)),
  ('Golf Sud', st_setsrid(st_point(-17.4134425, 14.7675735), 4326)),
  ('Grand Dakar', st_setsrid(st_point(-17.4583342, 14.7049934), 4326)),
  ('Grand Médine', st_setsrid(st_point(-17.4444326, 14.7481903), 4326)),
  ('Grande Mosquée', st_setsrid(st_point(-17.4443248, 14.6824846), 4326)),
  ('Gueule Tapée', st_setsrid(st_point(-17.3921489, 14.7756271), 4326)),
  ('Hôtel de ville', st_setsrid(st_point(-17.4321923, 14.6718059), 4326)),
  ('Khar Yalla', st_setsrid(st_point(-17.4564326, 14.7320392), 4326)),
  ('Liberté 1', st_setsrid(st_point(-17.4624955, 14.7099321), 4326)),
  ('Liberté 5', st_setsrid(st_point(-17.464045, 14.7210415), 4326)),
  ('Liberté 6', st_setsrid(st_point(-17.4591976, 14.7263088), 4326)),
  ('Manguiers', st_setsrid(st_point(-17.4577499, 14.6890347), 4326)),
  ('Marché Tilène', st_setsrid(st_point(-17.4502967, 14.6814319), 4326)),
  ('Medina', st_setsrid(st_point(-17.4524284, 14.6833902), 4326)),
  ('Ndingala', st_setsrid(st_point(-17.4196781, 14.7646271), 4326)),
  ('Papa Gueye Fall', st_setsrid(st_point(-17.4406354, 14.6766438), 4326)),
  ('Parcelles', st_setsrid(st_point(-17.4242946, 14.7626996), 4326)),
  ('Patisen', st_setsrid(st_point(-17.4306741, 14.6728723), 4326)),
  ('Petersen', st_setsrid(st_point(-17.4412971, 14.6758222), 4326)),
  ('Place de la Nation', st_setsrid(st_point(-17.4506369, 14.6960909), 4326)),
  ('Place de l’Indépendance', st_setsrid(st_point(-17.4315741, 14.6695126), 4326)),
  ('Police des Parcelles', st_setsrid(st_point(-17.4387907, 14.751076), 4326)),
  ('Polyclinique', st_setsrid(st_point(-17.4463337, 14.6779668), 4326)),
  ('Port de Dakar', st_setsrid(st_point(-17.4320345, 14.6742772), 4326)),
  ('Préfecture de Guédiawaye', st_setsrid(st_point(-17.3868591, 14.7719791), 4326)),
  ('Sacré Coeur', st_setsrid(st_point(-17.4665407, 14.7169687), 4326)),
  ('Sahm', st_setsrid(st_point(-17.4542992, 14.6856378), 4326)),
  ('Scat Urbam', st_setsrid(st_point(-17.4552396, 14.7369859), 4326)),
  ('Stade', st_setsrid(st_point(-17.4471505, 14.6784889), 4326)),
  ('Terminus Parcelles-Assainies', st_setsrid(st_point(-17.439255, 14.7604342), 4326)),
  ('Ucad', st_setsrid(st_point(-17.4621614, 14.6930841), 4326)),
  ('Ville', st_setsrid(st_point(-17.4386278, 14.6691169), 4326))
on conflict (name) do nothing;

-- 2. Tracés réels --------------------------------------------------------

-- BRT — B1 : Préfecture de Guédiawaye ↔ Petersen (24 arrêts relevés)
insert into lines (operator_id, code, name)
select o.id, 'B1', 'Préfecture de Guédiawaye ↔ Petersen' from operators o where o.short_name = 'BRT'
on conflict (operator_id, code) do update set name = excluded.name;

delete from line_stops where line_id = (select l.id from lines l join operators o on o.id = l.operator_id
          where o.short_name = 'BRT' and l.code = 'B1');

insert into line_stops (line_id, stop_id, sequence)
select (select l.id from lines l join operators o on o.id = l.operator_id
          where o.short_name = 'BRT' and l.code = 'B1'),
       s.id, v.seq
from (values
  ('Préfecture de Guédiawaye', 1),
  ('Gueule Tapée', 2),
  ('Golf Nord', 3),
  ('Fith Mith', 4),
  ('Dalal Jamm', 5),
  ('Golf Sud', 6),
  ('Ndingala', 7),
  ('Parcelles', 8),
  ('Croisement 22', 9),
  ('Police des Parcelles', 10),
  ('Grand Médine', 11),
  ('Cardinal Hyancinthe Thiandoum', 12),
  ('Scat Urbam', 13),
  ('Khar Yalla', 14),
  ('Liberté 6', 15),
  ('Liberté 5', 16),
  ('Sacré Coeur', 17),
  ('Liberté 1', 18),
  ('Grand Dakar', 19),
  ('Dial Diop', 20),
  ('Place de la Nation', 21),
  ('Grande Mosquée', 22),
  ('Papa Gueye Fall', 23),
  ('Petersen', 24)
) as v(name, seq)
join stops s on s.name = v.name;

-- DDD — Ligne 1 : Terminus Parcelles-Assainies ↔ Patisen (13 arrêts relevés)
insert into lines (operator_id, code, name)
select o.id, 'Ligne 1', 'Terminus Parcelles-Assainies ↔ Patisen' from operators o where o.short_name = 'DDD'
on conflict (operator_id, code) do update set name = excluded.name;

delete from line_stops where line_id = (select l.id from lines l join operators o on o.id = l.operator_id
          where o.short_name = 'DDD' and l.code = 'Ligne 1');

insert into line_stops (line_id, stop_id, sequence)
select (select l.id from lines l join operators o on o.id = l.operator_id
          where o.short_name = 'DDD' and l.code = 'Ligne 1'),
       s.id, v.seq
from (values
  ('Terminus Parcelles-Assainies', 1),
  ('Arrêt PA U19', 2),
  ('Arrêt Terrain-Acapes', 3),
  ('Ucad', 4),
  ('Arret Bus Aftu', 5),
  ('Manguiers', 6),
  ('Eglise Saint Joseph', 7),
  ('Medina', 8),
  ('Marché Tilène', 9),
  ('Stade', 10),
  ('Ville', 11),
  ('Place de l’Indépendance', 12),
  ('Patisen', 13)
) as v(name, seq)
join stops s on s.name = v.name;

-- DDD — Ligne 10 : Gare Palais 2 ↔ Arrêt Avenue Fahd Ben Abdel Aziz (5 arrêts relevés)
insert into lines (operator_id, code, name)
select o.id, 'Ligne 10', 'Gare Palais 2 ↔ Arrêt Avenue Fahd Ben Abdel Aziz' from operators o where o.short_name = 'DDD'
on conflict (operator_id, code) do update set name = excluded.name;

delete from line_stops where line_id = (select l.id from lines l join operators o on o.id = l.operator_id
          where o.short_name = 'DDD' and l.code = 'Ligne 10');

insert into line_stops (line_id, stop_id, sequence)
select (select l.id from lines l join operators o on o.id = l.operator_id
          where o.short_name = 'DDD' and l.code = 'Ligne 10'),
       s.id, v.seq
from (values
  ('Gare Palais 2', 1),
  ('Arrêt Clémenceau', 2),
  ('Arrêt autobus DDD 10', 3),
  ('Arrêt Limite Khar YALLA', 4),
  ('Arrêt Avenue Fahd Ben Abdel Aziz', 5)
) as v(name, seq)
join stops s on s.name = v.name;

-- DDD — Ligne 23 : Gare Palais 1 ↔ Terminus Parcelles-Assainies (31 arrêts relevés)
insert into lines (operator_id, code, name)
select o.id, 'Ligne 23', 'Gare Palais 1 ↔ Terminus Parcelles-Assainies' from operators o where o.short_name = 'DDD'
on conflict (operator_id, code) do update set name = excluded.name;

delete from line_stops where line_id = (select l.id from lines l join operators o on o.id = l.operator_id
          where o.short_name = 'DDD' and l.code = 'Ligne 23');

insert into line_stops (line_id, stop_id, sequence)
select (select l.id from lines l join operators o on o.id = l.operator_id
          where o.short_name = 'DDD' and l.code = 'Ligne 23'),
       s.id, v.seq
from (values
  ('Gare Palais 1', 1),
  ('Arrêt Clémenceau', 2),
  ('Arrêt El Malick', 3),
  ('Ville', 4),
  ('Arrêt autobus DDD 23-18', 5),
  ('Sahm', 6),
  ('Manguiers', 7),
  ('Arret Bus Aftu', 8),
  ('Ucad', 9),
  ('Arrêt DDD Av Roi Fahd Ben Abdel Aziz', 10),
  ('Arrêt Limite Khar YALLA', 11),
  ('Arrêt Avenue Fahd Ben Abdel Aziz', 12),
  ('Arret Rond Point 6', 13),
  ('Arrêt Credit Mutuel', 14),
  ('Arrêt Mosquée Arafat5', 15),
  ('Arret Cite Montagne Parcelles', 16),
  ('Arret Tally Bou Bess Parcelles', 17),
  ('Arret Police Parcelles', 18),
  ('Arret Cite Soprim', 19),
  ('Arrêt DDD L23', 20),
  ('Arret PA U08', 21),
  ('Arrêt Mairie Parcelles Assainies', 22),
  ('Arrêt PA U17', 23),
  ('Arrêt PA U21', 24),
  ('Arrêt PA U24', 25),
  ('Arrêt PA U23', 26),
  ('Arrêt Ecole Elementaire', 27),
  ('Arrêt Croisement BrioheD''orée Diamalaye', 28),
  ('Arrêt école Dior', 29),
  ('Arrêt  PA U20', 30),
  ('Terminus Parcelles-Assainies', 31)
) as v(name, seq)
join stops s on s.name = v.name;

-- DDD — Ligne 4 : Port de Dakar ↔ Arrêt Avenue Fahd Ben Abdel Aziz (9 arrêts relevés)
insert into lines (operator_id, code, name)
select o.id, 'Ligne 4', 'Port de Dakar ↔ Arrêt Avenue Fahd Ben Abdel Aziz' from operators o where o.short_name = 'DDD'
on conflict (operator_id, code) do update set name = excluded.name;

delete from line_stops where line_id = (select l.id from lines l join operators o on o.id = l.operator_id
          where o.short_name = 'DDD' and l.code = 'Ligne 4');

insert into line_stops (line_id, stop_id, sequence)
select (select l.id from lines l join operators o on o.id = l.operator_id
          where o.short_name = 'DDD' and l.code = 'Ligne 4'),
       s.id, v.seq
from (values
  ('Port de Dakar', 1),
  ('Hôtel de ville', 2),
  ('Arrêt El Malick', 3),
  ('Ville', 4),
  ('Polyclinique', 5),
  ('Marché Tilène', 6),
  ('Medina', 7),
  ('Arrêt Limite Khar YALLA', 8),
  ('Arrêt Avenue Fahd Ben Abdel Aziz', 9)
) as v(name, seq)
join stops s on s.name = v.name;

-- DDD — Ligne 7 : Gare Palais 2 ↔ Deuxième porte Mermoz (13 arrêts relevés)
insert into lines (operator_id, code, name)
select o.id, 'Ligne 7', 'Gare Palais 2 ↔ Deuxième porte Mermoz' from operators o where o.short_name = 'DDD'
on conflict (operator_id, code) do update set name = excluded.name;

delete from line_stops where line_id = (select l.id from lines l join operators o on o.id = l.operator_id
          where o.short_name = 'DDD' and l.code = 'Ligne 7');

insert into line_stops (line_id, stop_id, sequence)
select (select l.id from lines l join operators o on o.id = l.operator_id
          where o.short_name = 'DDD' and l.code = 'Ligne 7'),
       s.id, v.seq
from (values
  ('Gare Palais 2', 1),
  ('Arrêt Clémenceau', 2),
  ('Alybaba', 3),
  ('Arrêt El Malick', 4),
  ('Ville', 5),
  ('Polyclinique', 6),
  ('Marché Tilène', 7),
  ('Medina', 8),
  ('Sahm', 9),
  ('Manguiers', 10),
  ('Arret Bus Aftu', 11),
  ('Ucad', 12),
  ('Deuxième porte Mermoz', 13)
) as v(name, seq)
join stops s on s.name = v.name;

-- DDD — Ligne 9 : Arrêt Clémenceau ↔ Arret Terrain liberté 6 (10 arrêts relevés)
insert into lines (operator_id, code, name)
select o.id, 'Ligne 9', 'Arrêt Clémenceau ↔ Arret Terrain liberté 6' from operators o where o.short_name = 'DDD'
on conflict (operator_id, code) do update set name = excluded.name;

delete from line_stops where line_id = (select l.id from lines l join operators o on o.id = l.operator_id
          where o.short_name = 'DDD' and l.code = 'Ligne 9');

insert into line_stops (line_id, stop_id, sequence)
select (select l.id from lines l join operators o on o.id = l.operator_id
          where o.short_name = 'DDD' and l.code = 'Ligne 9'),
       s.id, v.seq
from (values
  ('Arrêt Clémenceau', 1),
  ('Alybaba', 2),
  ('Arrêt El Malick', 3),
  ('Ville', 4),
  ('Arret sacré coeur - BEM', 5),
  ('Arret 2 voies Sacré coeur', 6),
  ('Arret JVC', 7),
  ('Arret brioche dorée Liberté 6', 8),
  ('Arret Liberté 6', 9),
  ('Arret Terrain liberté 6', 10)
) as v(name, seq)
join stops s on s.name = v.name;
