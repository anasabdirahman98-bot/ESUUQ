-- =====================================================================
-- SUUQ — Politiques Row Level Security (avenant n°2, §4) — jalon S0
-- À exécuter dans SQL Editor APRÈS schema.sql. Pièce la plus critique :
-- équivalent des règles Firestore §7.1, mêmes garanties (un commerçant
-- ne touche jamais statut / badge / compteurs / données d'autrui).
--
-- ÉCARTS au texte de l'avenant (bugs corrigés, intention préservée) :
-- 1. Dans les sous-requêtes des WITH CHECK, « where b.id = id » est une
--    tautologie PostgreSQL (le « id » non qualifié se résout sur b.id) :
--    la sous-requête renverrait TOUTES les lignes visibles → erreur
--    « more than one row returned by a subquery » dès 2 boutiques.
--    Correction : référence externe qualifiée « b.id = boutiques.id »
--    (la ligne en cours de vérification). Idem pour produits.
-- 2. boutiques_update_admin : le commentaire de l'avenant dit « tout
--    sauf owner_id » mais la politique ne l'imposait pas. Le verrou
--    owner_id est ajouté (parité avec les règles Firestore §7.1).
-- =====================================================================

alter table public.boutiques enable row level security;
alter table public.produits enable row level security;
alter table public.boutiques_prive enable row level security;
alter table public.admins enable row level security;

-- ===== BOUTIQUES =====
-- Lecture : publique si active, sinon proprio ou admin
create policy boutiques_select on public.boutiques for select using (
  statut = 'active' or owner_id = auth.uid() or public.est_admin()
);

-- Création : par le proprio, statut/badge/compteurs forcés aux valeurs initiales
create policy boutiques_insert on public.boutiques for insert with check (
  owner_id = auth.uid()
  and statut = 'en_attente'
  and badge_verifie = false
  and vues = 0 and clics_whatsapp = 0
);

-- MAJ proprio : interdiction de changer statut/badge/compteurs/owner.
-- Le WITH CHECK compare la NOUVELLE ligne aux valeurs existantes : la
-- sous-requête (non affectée par les modifications du même ordre UPDATE)
-- lit la ligne d'origine via « boutiques.id » (référence externe).
create policy boutiques_update_proprio on public.boutiques for update using (
  owner_id = auth.uid()
) with check (
  owner_id = auth.uid()
  and statut = (select b.statut from public.boutiques b where b.id = boutiques.id)
  and badge_verifie = (select b.badge_verifie from public.boutiques b where b.id = boutiques.id)
  and vues = (select b.vues from public.boutiques b where b.id = boutiques.id)
  and clics_whatsapp = (select b.clics_whatsapp from public.boutiques b where b.id = boutiques.id)
);

-- MAJ admin : tout sauf owner_id
create policy boutiques_update_admin on public.boutiques for update using (
  public.est_admin()
) with check (
  public.est_admin()
  and owner_id = (select b.owner_id from public.boutiques b where b.id = boutiques.id)
);

-- Suppression : admin uniquement
create policy boutiques_delete on public.boutiques for delete using (public.est_admin());

-- ===== PRODUITS =====
create policy produits_select on public.produits for select using (
  (visible = true and exists (select 1 from public.boutiques b where b.id = boutique_id and b.statut = 'active'))
  or owner_id = auth.uid() or public.est_admin()
);

create policy produits_insert on public.produits for insert with check (
  owner_id = auth.uid()
  and visible = true
  and vues = 0 and clics_whatsapp = 0
  and exists (select 1 from public.boutiques b where b.id = boutique_id and b.owner_id = auth.uid())
);

-- MAJ proprio : interdiction de changer visible/compteurs/owner/boutique
create policy produits_update_proprio on public.produits for update using (
  owner_id = auth.uid()
) with check (
  owner_id = auth.uid()
  and visible = (select p.visible from public.produits p where p.id = produits.id)
  and vues = (select p.vues from public.produits p where p.id = produits.id)
  and clics_whatsapp = (select p.clics_whatsapp from public.produits p where p.id = produits.id)
  and boutique_id = (select p.boutique_id from public.produits p where p.id = produits.id)
);

create policy produits_update_admin on public.produits for update using (
  public.est_admin()
) with check (public.est_admin());

create policy produits_delete on public.produits for delete using (
  owner_id = auth.uid() or public.est_admin()
);

-- ===== BOUTIQUES_PRIVE =====
create policy prive_all on public.boutiques_prive for all using (
  owner_id = auth.uid() or public.est_admin()
) with check (
  owner_id = auth.uid() or public.est_admin()
);

-- ===== ADMINS =====
-- Lecture : chacun peut vérifier s'il est lui-même admin ; aucune écriture via l'API.
create policy admins_select on public.admins for select using (user_id = auth.uid() or public.est_admin());
-- Pas de policy insert/update/delete => écriture impossible via l'API cliente.
-- La promotion admin se fait dans le Dashboard Supabase (SQL Editor) uniquement.
