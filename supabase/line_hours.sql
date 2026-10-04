-- Yoonbi — horaires des lignes
--
-- Les mêmes horaires que dans seed.sql et seed_osm.sql, à rejouer sur une
-- base où ces fichiers avaient été exécutés avant que les horaires y soient
-- ajoutés. Le planificateur s'en sert pour ne jamais proposer une ligne qui
-- ne circule pas à l'heure du départ (services/serviceHours.ts) : sans eux,
-- il recommandait le B3 un dimanche soir.
--
-- À exécuter après schema.sql, seed.sql et seed_osm.sql, dans l'éditeur SQL
-- Supabase. Rejouable sans risque.

-- BRT : horaires officiels par ligne, sunubrt.sn (relevé le 2026-09-23).
update lines set
  hours_label = 'Lun-Dim · 6h-21h',
  frequency_label = 'Lun-Sam : toutes les 6 min · Dim/fériés : 10 min puis 7 min',
  schedule_estimated = false
where operator_id = (select id from operators where short_name = 'BRT') and code = 'B1';

update lines set
  hours_label = 'Lun-Ven · heures de pointe (7h-11h, 16h-20h)',
  frequency_label = null,
  schedule_estimated = false
where operator_id = (select id from operators where short_name = 'BRT') and code = 'B3';

-- Dakar Dem Dikk et Tata AFTU : le réseau ne publie pas d'horaire par
-- ligne. Ce qui suit est l'amplitude générale du réseau classique (source :
-- demdikk.sn et pages de lignes AFTU), pas un horaire confirmé ligne par
-- ligne — d'où schedule_estimated = true : l'app propose quand même ces
-- lignes hors de cette amplitude, en prévenant que l'horaire est estimé.
update lines set
  hours_label = 'Estimation : tous les jours · 6h-20h',
  frequency_label = 'Estimation : toutes les 20 à 35 min',
  schedule_estimated = true
where operator_id = (select id from operators where short_name = 'DDD');

update lines set
  hours_label = 'Estimation : tous les jours · 6h-21h',
  frequency_label = 'Fréquence variable, plus dense aux heures de pointe (7h-9h, 17h-19h)',
  schedule_estimated = true
where operator_id = (select id from operators where short_name = 'AFTU');
