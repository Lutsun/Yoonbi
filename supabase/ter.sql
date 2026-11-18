-- Yoonbi — Train Express Régional (TER) Dakar – AIBD
--
-- Généré par scripts/build_ter.py — ne pas modifier à la main.
-- À exécuter après schema.sql, seed.sql, seed_osm.sql et line_shapes.sql,
-- dans l'éditeur SQL Supabase. Rejouable sans risque.
--
-- 14 gares, 55.5 km de voie. Gares et tracé © les contributeurs
-- OpenStreetMap (ODbL) ; horaires : terdakar.sn. Les tarifs (zonaux) sont
-- calculés par l'app (services/fares.ts).

-- 1. Opérateur ------------------------------------------------------------------
insert into operators (name, short_name, color)
values ('Train Express Régional', 'TER', '#7C3AED')
on conflict (short_name) do update set name = excluded.name, color = excluded.color;

-- 2. Ligne ------------------------------------------------------------------------
insert into lines (operator_id, code, name, fare_fcfa)
select o.id, 'TER', 'Dakar ↔ AIBD', 500 from operators o where o.short_name = 'TER'
on conflict (operator_id, code) do update set name = excluded.name, fare_fcfa = excluded.fare_fcfa;

update lines set
  hours_label = 'Tous les jours · 5h40-22h',
  frequency_label = 'Toutes les 8 à 10 min jusqu''à Diamniadio · toutes les 24 min vers l''AIBD',
  schedule_estimated = false
where code = 'TER' and operator_id = (select id from operators where short_name = 'TER');

-- 3. Gares --------------------------------------------------------------------------
insert into stops (name, location) values
  ('Gare TER Dakar', st_setsrid(st_point(-17.4335181, 14.6759856), 4326)),
  ('Gare TER Colobane', st_setsrid(st_point(-17.4416523, 14.7003482), 4326)),
  ('Gare TER Hann', st_setsrid(st_point(-17.4320723, 14.7220913), 4326)),
  ('Gare TER Dalifort', st_setsrid(st_point(-17.4189983, 14.7342483), 4326)),
  ('Gare TER Baux Maraîchers', st_setsrid(st_point(-17.4036081, 14.7397124), 4326)),
  ('Gare TER Pikine', st_setsrid(st_point(-17.3916937, 14.7498644), 4326)),
  ('Gare TER Thiaroye', st_setsrid(st_point(-17.3802989, 14.758771), 4326)),
  ('Gare TER Yeumbeul', st_setsrid(st_point(-17.3565049, 14.764913), 4326)),
  ('Gare TER Keur Mbaye Fall', st_setsrid(st_point(-17.3138934, 14.744079), 4326)),
  ('Gare TER PNR', st_setsrid(st_point(-17.2839425, 14.7231692), 4326)),
  ('Gare TER Rufisque', st_setsrid(st_point(-17.2699985, 14.7159649), 4326)),
  ('Gare TER Bargny', st_setsrid(st_point(-17.2292043, 14.6981798), 4326)),
  ('Gare TER Diamniadio', st_setsrid(st_point(-17.1984512, 14.7160641), 4326)),
  ('Gare TER AIBD', st_setsrid(st_point(-17.0645552, 14.6722695), 4326))
on conflict (name) do update set location = excluded.location;

-- 4. Ordre des gares sur la ligne --------------------------------------------------
delete from line_stops where line_id = (select l.id from lines l join operators o on o.id = l.operator_id
  where o.short_name = 'TER' and l.code = 'TER');

insert into line_stops (line_id, stop_id, sequence)
select (select l.id from lines l join operators o on o.id = l.operator_id where o.short_name = 'TER' and l.code = 'TER'),
       s.id, v.seq
from (values
  ('Gare TER Dakar', 1),
  ('Gare TER Colobane', 2),
  ('Gare TER Hann', 3),
  ('Gare TER Dalifort', 4),
  ('Gare TER Baux Maraîchers', 5),
  ('Gare TER Pikine', 6),
  ('Gare TER Thiaroye', 7),
  ('Gare TER Yeumbeul', 8),
  ('Gare TER Keur Mbaye Fall', 9),
  ('Gare TER PNR', 10),
  ('Gare TER Rufisque', 11),
  ('Gare TER Bargny', 12),
  ('Gare TER Diamniadio', 13),
  ('Gare TER AIBD', 14)) as v(name, seq)
join stops s on s.name = v.name;

-- 5. Tracé réel de la voie -------------------------------------------------------------
insert into line_shapes (line_id, coords, source)
select l.id, '[[-17.433467,14.676075],[-17.436746,14.682035],[-17.438638,14.687115],[-17.441285,14.692299],[-17.441791,14.69383],[-17.441938,14.694957],[-17.441934,14.695802],[-17.441564,14.701361],[-17.441541,14.703212],[-17.44104,14.710807],[-17.440852,14.711901],[-17.44056,14.71268],[-17.440134,14.713382],[-17.439465,14.714167],[-17.438926,14.714613],[-17.438106,14.715092],[-17.435769,14.716033],[-17.435012,14.71659],[-17.434569,14.717066],[-17.434069,14.717912],[-17.431668,14.722869],[-17.429591,14.726885],[-17.428816,14.727918],[-17.4283,14.728419],[-17.427517,14.729003],[-17.414377,14.737112],[-17.413023,14.737871],[-17.411832,14.738215],[-17.401261,14.740105],[-17.40047,14.740344],[-17.399894,14.740643],[-17.399379,14.741023],[-17.397989,14.74233],[-17.393927,14.747478],[-17.387101,14.754666],[-17.385694,14.755833],[-17.384285,14.756765],[-17.379552,14.759113],[-17.375235,14.761184],[-17.373931,14.761738],[-17.371713,14.762553],[-17.369418,14.763179],[-17.367531,14.763573],[-17.365737,14.763844],[-17.353729,14.765212],[-17.35146,14.765411],[-17.350275,14.765323],[-17.349356,14.765123],[-17.346089,14.764048],[-17.345077,14.763613],[-17.344492,14.763237],[-17.343731,14.762533],[-17.342283,14.760413],[-17.341796,14.759867],[-17.341064,14.759328],[-17.340477,14.759043],[-17.339451,14.758755],[-17.332632,14.75728],[-17.33078,14.756612],[-17.329053,14.755686],[-17.328255,14.755155],[-17.327214,14.754314],[-17.322647,14.750142],[-17.321308,14.749024],[-17.320166,14.748337],[-17.31734,14.747066],[-17.316593,14.746608],[-17.315535,14.745788],[-17.31425,14.744449],[-17.307007,14.736331],[-17.306394,14.735725],[-17.305334,14.734909],[-17.272447,14.716799],[-17.271038,14.716233],[-17.266171,14.714889],[-17.265058,14.714413],[-17.249207,14.704907],[-17.247049,14.70355],[-17.238693,14.697142],[-17.23773,14.696663],[-17.236339,14.696309],[-17.235209,14.696268],[-17.234386,14.696377],[-17.233665,14.696558],[-17.212114,14.70429],[-17.210884,14.704813],[-17.209878,14.705422],[-17.209054,14.706077],[-17.198439,14.716056],[-17.196717,14.717609],[-17.195705,14.718331],[-17.194696,14.71886],[-17.193759,14.719236],[-17.160361,14.731794],[-17.158914,14.732599],[-17.157681,14.733534],[-17.156617,14.734616],[-17.155266,14.736385],[-17.154663,14.737054],[-17.154228,14.737483],[-17.153045,14.738417],[-17.151716,14.73921],[-17.149088,14.74024],[-17.14752,14.74077],[-17.145785,14.74111],[-17.142458,14.741233],[-17.140176,14.741195],[-17.139127,14.741041],[-17.1379,14.740722],[-17.135102,14.739574],[-17.133862,14.739244],[-17.124046,14.738249],[-17.122323,14.737919],[-17.119701,14.737212],[-17.117767,14.73651],[-17.115696,14.735553],[-17.088746,14.720228],[-17.086928,14.719351],[-17.073152,14.713357],[-17.071667,14.712488],[-17.071054,14.711993],[-17.070277,14.711202],[-17.069408,14.710012],[-17.068842,14.708906],[-17.0685,14.707916],[-17.067814,14.705274],[-17.067221,14.703759],[-17.066619,14.702732],[-17.065243,14.700906],[-17.064646,14.699953],[-17.064097,14.698704],[-17.0638,14.697531],[-17.063683,14.696676],[-17.063653,14.695745],[-17.063705,14.694935],[-17.064192,14.691378],[-17.064395,14.687646],[-17.064336,14.673331]]'::jsonb, 'OpenStreetMap, relation 13645077'
from lines l join operators o on o.id = l.operator_id
where o.short_name = 'TER' and l.code = 'TER'
on conflict (line_id) do update set coords = excluded.coords, source = excluded.source, updated_at = now();
