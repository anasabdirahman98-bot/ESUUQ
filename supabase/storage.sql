-- =====================================================================
-- SUUQ — Supabase Storage (avenant n°2, §5.1-5.2) — jalon S0
-- À exécuter dans SQL Editor APRÈS rls.sql (ou créer le bucket via
-- Dashboard → Storage → New bucket : nom "boutiques", Public bucket ✓,
-- puis exécuter seulement les politiques ci-dessous).
--
-- Structure des chemins : {owner_id}/{boutique_id}/{type}-{timestamp}.jpg
-- Le préfixe owner_id permet les politiques par propriétaire.
-- =====================================================================

-- Bucket public en lecture (images produits/boutiques publiques par nature)
insert into storage.buckets (id, name, public)
values ('boutiques', 'boutiques', true)
on conflict (id) do update set public = true;

-- Lecture publique du bucket boutiques
create policy storage_read on storage.objects for select using (bucket_id = 'boutiques');

-- Écriture : uniquement dans son propre dossier (préfixe = owner_id)
create policy storage_write on storage.objects for insert with check (
  bucket_id = 'boutiques' and (storage.foldername(name))[1] = auth.uid()::text
);

-- Suppression : uniquement dans son propre dossier — permet le nettoyage
-- des images remplacées/supprimées (fini les orphelins de l'avenant n°1)
create policy storage_delete on storage.objects for delete using (
  bucket_id = 'boutiques' and (storage.foldername(name))[1] = auth.uid()::text
);
