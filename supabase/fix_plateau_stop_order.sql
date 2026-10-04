-- Yoonbi — ordre des arrêts « Arrêt El Malick » et « Ville » au Plateau
--
-- Correctif ponctuel. Sur les lignes Dakar Dem Dikk 4, 7, 9 et 23,
-- seed_osm.sql (repris de la liste d'arrêts des relations OpenStreetMap)
-- place « Arrêt El Malick » avant « Ville ». Le chemin réel du bus, lui, passe
-- à Ville environ 400 m avant El Malick ; l'ordre enregistré lui faisait faire
-- un aller-retour (El Malick, retour vers Ville, puis Polyclinique) :
-- 470 à 620 m de trop selon la ligne. Conséquence dans l'app : le tracé réel
-- de ces lignes était refusé pour près de la moitié des trajets, et le
-- guidage annonçait les deux arrêts dans le mauvais ordre.
--
-- On échange les deux arrêts (pas les numéros d'ordre, qui forment la clé de
-- line_stops), seulement là où El Malick est encore avant Ville : rejouer ce
-- fichier ne remet donc pas l'ancien ordre.
--
-- À exécuter après seed_osm.sql (et à rejouer si seed_osm.sql est rejoué),
-- dans l'éditeur SQL Supabase.

with
  el_malick as (select id from stops where name = 'Arrêt El Malick'),
  ville as (select id from stops where name = 'Ville'),
  to_fix as (
    select m.line_id
    from line_stops m
    join line_stops v on v.line_id = m.line_id
    join lines l on l.id = m.line_id
    join operators o on o.id = l.operator_id
    where o.short_name = 'DDD'
      and l.code in ('Ligne 4', 'Ligne 7', 'Ligne 9', 'Ligne 23')
      and m.stop_id = (select id from el_malick)
      and v.stop_id = (select id from ville)
      and m.sequence < v.sequence
  )
update line_stops ls
set stop_id = case
  when ls.stop_id = (select id from el_malick) then (select id from ville)
  else (select id from el_malick)
end
where ls.line_id in (select line_id from to_fix)
  and ls.stop_id in ((select id from el_malick), (select id from ville));

-- Vérification : pour chaque ligne, Ville doit maintenant précéder El Malick.
select l.code,
       max(ls.sequence) filter (where s.name = 'Ville') as sequence_ville,
       max(ls.sequence) filter (where s.name = 'Arrêt El Malick') as sequence_el_malick
from line_stops ls
join stops s on s.id = ls.stop_id
join lines l on l.id = ls.line_id
join operators o on o.id = l.operator_id
where o.short_name = 'DDD' and l.code in ('Ligne 4', 'Ligne 7', 'Ligne 9', 'Ligne 23')
group by l.code
order by l.code;
