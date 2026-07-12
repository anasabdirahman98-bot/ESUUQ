-- =====================================================================
-- SUUQ — Schéma PostgreSQL (avenant n°2, §3) — jalon S0
-- À exécuter dans Dashboard Supabase → SQL Editor, AVANT rls.sql.
-- Écart au texte de l'avenant : "set search_path = ''" ajouté aux
-- fonctions SECURITY DEFINER (durcissement recommandé Supabase ; tous
-- les objets étant déjà qualifiés public./auth., c'est sans effet
-- fonctionnel).
-- =====================================================================

-- ---------- 3.1 Table boutiques ----------
create table public.boutiques (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  nom           text not null check (char_length(nom) <= 60),
  nom_lower     text not null,               -- normalisé (minuscule, sans accent) pour recherche
  slug          text not null unique,
  description   text default '' check (char_length(description) <= 280),
  categorie     text not null,
  quartier      text not null,
  repere        text not null check (char_length(repere) <= 120),
  geo_lat       double precision,
  geo_lng       double precision,
  whatsapp      text not null,               -- format "253XXXXXXXX"
  horaires      jsonb,                        -- { "lun": {"ouvert":true,"de":"08:00","a":"20:00","de2":...,"a2":...}, ... }
  logo_url      text,
  couverture_url text,
  statut        text not null default 'en_attente' check (statut in ('en_attente','active','suspendue')),
  badge_verifie boolean not null default false,
  vues          integer not null default 0,
  clics_whatsapp integer not null default 0,
  cree_le       timestamptz not null default now(),
  maj_le        timestamptz not null default now()
);
create index idx_boutiques_statut on public.boutiques(statut);
create index idx_boutiques_owner on public.boutiques(owner_id);
create unique index idx_boutiques_owner_unique on public.boutiques(owner_id); -- une seule boutique par compte

-- ---------- 3.2 Table produits ----------
create table public.produits (
  id            uuid primary key default gen_random_uuid(),
  boutique_id   uuid not null references public.boutiques(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  nom           text not null check (char_length(nom) <= 60),
  nom_lower     text not null,
  description   text default '' check (char_length(description) <= 280),
  prix          integer not null check (prix > 0),
  categorie     text not null,
  tags          text[] default '{}',          -- normalisés, max 5 (vérifié côté app)
  photos        text[] not null check (array_length(photos,1) between 1 and 3),
  thumb_url     text not null,
  disponible    boolean not null default true,
  visible       boolean not null default true,
  vues          integer not null default 0,
  clics_whatsapp integer not null default 0,
  cree_le       timestamptz not null default now(),
  maj_le        timestamptz not null default now()
);
create index idx_produits_boutique on public.produits(boutique_id);
create index idx_produits_owner on public.produits(owner_id);
create index idx_produits_visible on public.produits(visible, cree_le desc);
-- Recherche full-text (résout le plafond des ~2000 produits de la Phase 1) :
create index idx_produits_recherche on public.produits using gin (to_tsvector('simple', nom_lower));

-- ---------- 3.3 Table boutiques_prive ----------
create table public.boutiques_prive (
  boutique_id   uuid primary key references public.boutiques(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  email         text,
  tel_personnel text,
  notes_admin   text
);

-- ---------- 3.4 Table admins + fonction helper ----------
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cree_le timestamptz not null default now()
);

-- Fonction réutilisée par les politiques RLS : l'utilisateur courant est-il admin ?
-- SECURITY DEFINER pour lire public.admins sans être bloqué par le RLS de cette table.
create or replace function public.est_admin()
returns boolean language sql security definer stable
set search_path = ''
as $$
  select exists(select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- 3.5 Incréments atomiques (remplacent increment(1)) ----------
-- Seul moyen pour un visiteur anonyme d'incrémenter un compteur, sans droit
-- d'UPDATE direct sur les tables. Bornées (+1, conditionnées au statut
-- public), donc non abusables pour autre chose.

-- Compteur de vues boutique (public, +1)
create or replace function public.incr_vue_boutique(bid uuid)
returns void language sql security definer
set search_path = ''
as $$
  update public.boutiques set vues = vues + 1 where id = bid and statut = 'active';
$$;

-- Clic WhatsApp produit + boutique (public, +1 chacun)
create or replace function public.incr_clic_produit(pid uuid, bid uuid)
returns void language sql security definer
set search_path = ''
as $$
  update public.produits set clics_whatsapp = clics_whatsapp + 1 where id = pid and visible = true;
  update public.boutiques set clics_whatsapp = clics_whatsapp + 1 where id = bid and statut = 'active';
$$;

-- Vue produit (public, +1)
create or replace function public.incr_vue_produit(pid uuid)
returns void language sql security definer
set search_path = ''
as $$
  update public.produits set vues = vues + 1 where id = pid and visible = true;
$$;
