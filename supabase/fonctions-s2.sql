-- =====================================================================
-- SUUQ — Jalon S2 : création de boutique transactionnelle (avenant §6)
-- À exécuter dans Dashboard Supabase → SQL Editor (après schema.sql/rls.sql).
--
-- Remplace les deux écritures séquentielles de la Phase 1 (§7.3 du cahier
-- des charges) : boutiques + boutiques_prive sont insérées dans UNE
-- transaction — tout réussit ou tout échoue, plus de document privé
-- orphelin ni de fonction de réparation.
--
-- SECURITY INVOKER (volontaire, ≠ des fonctions incr_*) : la fonction
-- s'exécute avec les droits de l'appelant, donc les politiques RLS
-- s'appliquent aux deux INSERT (owner_id = auth.uid() imposé, statut
-- 'en_attente' / badge false / compteurs 0 par défaut de colonne).
-- L'unicité une-boutique-par-compte est garantie par l'index unique
-- (idx_boutiques_owner_unique) → erreur 23505 en cas de doublon.
-- =====================================================================
create or replace function public.creer_boutique(
  p_nom            text,
  p_nom_lower      text,
  p_slug           text,
  p_description    text,
  p_categorie      text,
  p_quartier       text,
  p_repere         text,
  p_geo_lat        double precision,
  p_geo_lng        double precision,
  p_whatsapp       text,
  p_horaires       jsonb,
  p_logo_url       text,
  p_couverture_url text,
  p_email          text
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.boutiques
    (owner_id, nom, nom_lower, slug, description, categorie, quartier, repere,
     geo_lat, geo_lng, whatsapp, horaires, logo_url, couverture_url)
  values
    (auth.uid(), p_nom, p_nom_lower, p_slug, p_description, p_categorie,
     p_quartier, p_repere, p_geo_lat, p_geo_lng, p_whatsapp, p_horaires,
     p_logo_url, p_couverture_url)
  returning id into v_id;

  insert into public.boutiques_prive (boutique_id, owner_id, email)
  values (v_id, auth.uid(), p_email);

  return v_id;
end;
$$;
