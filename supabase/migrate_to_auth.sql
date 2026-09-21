-- Yoonbi — migration ponctuelle vers Supabase Auth
--
-- À exécuter UNE SEULE FOIS, dans l'éditeur SQL Supabase, AVANT de
-- ré-exécuter schema.sql. Utile uniquement si ton projet a déjà l'ancienne
-- table `users` faite main (comptes créés directement en base, sans passer
-- par un vrai système d'authentification).
--
-- Ce que ça fait : supprime l'ancienne table `users` (et sa contrainte vers
-- user_trips/favorite_lines, via CASCADE) et vide les trajets/lignes
-- favorites de test qui pointaient vers ces faux comptes — ils n'ont plus
-- de sens une fois basculé sur de vrais comptes Supabase Auth (téléphone +
-- code SMS). schema.sql recrée ensuite `profiles` à la bonne place et
-- reconnecte user_trips/favorite_lines dessus.
--
-- Si tu pars d'un projet Supabase tout neuf (jamais exécuté l'ancien
-- schema.sql), ce fichier n'a rien à faire : passe directement à schema.sql.

truncate table user_trips, favorite_lines;
drop table if exists users cascade;
