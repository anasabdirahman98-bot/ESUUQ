# SUUQ — Avenant n°2 : Migration Firebase → Supabase
**Objet : remplacement complet du backend (Firestore + Firebase Auth + Cloudinary) par Supabase (PostgreSQL + Supabase Auth + Supabase Storage)**
**Référentiel : cahier des charges 1.1 + avenant n°1 + cet avenant = version 2.0 — Juillet 2026**

---

## 0. Instructions pour l'agent de développement (Claude Code)

1. **Lis ce document en entier avant d'écrire du code.** Il remplace les sections backend du cahier des charges et de l'avenant n°1. Place-le dans `docs/avenant-2-supabase.md`.
2. **Motivation (à respecter dans les choix d'architecture)** : la migration est motivée par la **souveraineté des données** — PostgreSQL open-source, auto-hébergeable à terme sous juridiction africaine. Toute décision doit préserver la portabilité (pas de dépendance à un service tiers propriétaire). Supabase Cloud maintenant ; auto-hébergement plus tard sans réécriture applicative.
3. **On repart d'une base vide.** Aucune donnée à migrer depuis Firebase. La boutique de test « Sporting » sera recréée par l'utilisateur via l'app migrée (ce qui teste le parcours de création). Ne pas écrire de script de transfert de données.
4. **Tout le stockage passe sous Supabase** (décision utilisateur) : Cloudinary est **entièrement abandonné**. Les images (produits, logo, couverture) vont dans **Supabase Storage**. Supprimer `js/cloudinary-config.js` et le code Cloudinary de `js/images.js`.
5. **Stack front INCHANGÉE** : HTML/CSS/JavaScript vanilla (ES modules), déploiement GitHub Pages, aucun framework, aucun bundler. Seule la **couche d'accès aux données** change. Le client Supabase se charge via CDN ESM (`https://esm.sh/@supabase/supabase-js@2`).
6. **Migration jalon par jalon**, validée en conditions réelles à chaque étape (section 8). Ne pas tout migrer d'un coup. Attendre la validation de l'utilisateur entre chaque jalon.
7. **Langue** : interface en français, messages d'erreur en français, commentaires en français.
8. **Le réseau djiboutien a été testé** : l'API REST Supabase répond correctement depuis Djibouti (test de connectivité validé). Supabase utilise HTTP/REST et WebSocket standard — pas de réglage spécial anticipé, mais garder `avecDelai()` et `decrireErreur()` (voir §6).

---

## 1. Configuration Supabase

Nouveau fichier `js/supabase-config.js` :
```js
// Valeurs publiques par nature (comme firebaseConfig l'était) : la sécurité
// repose sur les politiques RLS de PostgreSQL (§4), pas sur le secret de ces clés.
// La clé "anon" est conçue pour vivre dans le code client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://kkdpfarvzgookvgfsbya.supabase.co";
const SUPABASE_ANON_KEY = "A_REMPLIR_PAR_CHEN"; // clé "anon public" du dashboard

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
```

**Demander à Chen la clé `anon public`** au début du jalon S0 (Dashboard Supabase → Settings → API → Project API keys → `anon` `public`). L'URL est déjà connue. **Ne jamais** introduire la clé `service_role` côté client (elle contourne le RLS — usage serveur uniquement).

---

## 2. Correspondance des concepts Firebase → Supabase

| Firebase (Phase 1) | Supabase (cible) | Note |
|---|---|---|
| Firestore (NoSQL, collections/documents) | PostgreSQL (tables/lignes) | Schéma explicite, typé (§3) |
| Règles de sécurité Firestore | Row Level Security (RLS) en SQL | Politiques par table (§4) |
| Firebase Auth (email/mot de passe) | Supabase Auth (email/mot de passe) | `auth.users` intégré |
| UID Firebase (`request.auth.uid`) | `auth.uid()` (UUID) | Type UUID, pas string |
| Cloudinary (images) | Supabase Storage (bucket) | Bucket `boutiques` (§5) |
| `increment(1)` compteurs | Fonction RPC PostgreSQL (§3.4) | Incrément atomique côté serveur |
| `serverTimestamp()` | `default now()` / `timestamptz` | Géré par PostgreSQL |
| ID auto-généré Firestore | `uuid` `default gen_random_uuid()` | Clé primaire UUID |
| `collection("x")` + `where` | `supabase.from("x").select().eq(...)` | API `supabase-js` |

**Point d'attention majeur** : dans Firestore, l'ID du document `admins/{uid}` était l'UID. En Postgres, on lie via une colonne `user_id UUID` référençant `auth.users(id)`.

---

## 3. Schéma PostgreSQL

À exécuter dans **Dashboard Supabase → SQL Editor**. Fournir ce script à Chen pour exécution (ou l'exécuter via migration). Le versionner dans `supabase/schema.sql`.

### 3.1 Table `boutiques`
```sql
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
```

### 3.2 Table `produits`
```sql
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
```

### 3.3 Table `boutiques_prive`
```sql
create table public.boutiques_prive (
  boutique_id   uuid primary key references public.boutiques(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  email         text,
  tel_personnel text,
  notes_admin   text
);
```

### 3.4 Table `admins` + fonction helper
```sql
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cree_le timestamptz not null default now()
);

-- Fonction réutilisée par les politiques RLS : l'utilisateur courant est-il admin ?
-- SECURITY DEFINER pour lire public.admins sans être bloqué par le RLS de cette table.
create or replace function public.est_admin()
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.admins where user_id = auth.uid());
$$;
```

### 3.5 Incréments atomiques (remplacent `increment(1)`)
```sql
-- Compteur de vues boutique (public, +1)
create or replace function public.incr_vue_boutique(bid uuid)
returns void language sql security definer as $$
  update public.boutiques set vues = vues + 1 where id = bid and statut = 'active';
$$;

-- Clic WhatsApp produit + boutique (public, +1 chacun)
create or replace function public.incr_clic_produit(pid uuid, bid uuid)
returns void language sql security definer as $$
  update public.produits set clics_whatsapp = clics_whatsapp + 1 where id = pid and visible = true;
  update public.boutiques set clics_whatsapp = clics_whatsapp + 1 where id = bid and statut = 'active';
$$;

-- Vue produit (public, +1)
create or replace function public.incr_vue_produit(pid uuid)
returns void language sql security definer as $$
  update public.produits set vues = vues + 1 where id = pid and visible = true;
$$;
```
Ces fonctions `security definer` sont le seul moyen pour un visiteur anonyme d'incrémenter un compteur, sans lui donner de droit d'UPDATE direct sur les tables (voir §4). Elles sont bornées (`+1`, et conditionnées au statut public), donc non abusables pour autre chose.

---

## 4. Sécurité : politiques Row Level Security (RLS)

C'est l'équivalent des règles Firestore §7.1 — **la pièce la plus critique**. Le RLS auto a été activé à la création du projet ; il faut néanmoins activer explicitement le RLS sur chaque table et écrire les politiques. À exécuter dans SQL Editor, versionner dans `supabase/rls.sql`.

**Principe conservé de la Phase 1** : un commerçant ne peut jamais modifier `statut`, `badge_verifie`, ni les compteurs, ni toucher les données d'un autre commerçant. Ces protections ont été validées par tests d'intrusion en Phase 1 et **doivent être re-testées** (§8, jalon S4).

```sql
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
-- MAJ proprio : interdiction de changer statut/badge/compteurs/owner
-- (WITH CHECK compare aux valeurs existantes via une sous-requête)
create policy boutiques_update_proprio on public.boutiques for update using (
  owner_id = auth.uid()
) with check (
  owner_id = auth.uid()
  and statut = (select statut from public.boutiques b where b.id = id)
  and badge_verifie = (select badge_verifie from public.boutiques b where b.id = id)
  and vues = (select vues from public.boutiques b where b.id = id)
  and clics_whatsapp = (select clics_whatsapp from public.boutiques b where b.id = id)
);
-- MAJ admin : tout sauf owner_id
create policy boutiques_update_admin on public.boutiques for update using (
  public.est_admin()
) with check (public.est_admin());
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
  and visible = (select visible from public.produits p where p.id = id)
  and vues = (select vues from public.produits p where p.id = id)
  and clics_whatsapp = (select clics_whatsapp from public.produits p where p.id = id)
  and boutique_id = (select boutique_id from public.produits p where p.id = id)
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
-- Lecture : chacun peut vérifier s'il est lui-même admin ; aucune écriture via l'API
create policy admins_select on public.admins for select using (user_id = auth.uid() or public.est_admin());
-- Pas de policy insert/update/delete => écriture impossible via l'API cliente.
-- La promotion admin se fait dans le Dashboard Supabase (SQL Editor) uniquement.
```

**Note cruciale sur les compteurs** : aucune politique n'autorise un UPDATE direct des colonnes `vues`/`clics_whatsapp` par un anonyme. Les compteurs sont incrémentés **uniquement** via les fonctions RPC `security definer` du §3.5. C'est plus propre que Firestore (où on autorisait un UPDATE borné à +1) : ici, l'anonyme n'a aucun droit d'écriture sur les tables, seulement le droit d'appeler des fonctions bornées.

**Exécution des RPC côté client** : `await supabase.rpc('incr_clic_produit', { pid: produitId, bid: boutiqueId })`.

---

## 5. Supabase Storage (remplace Cloudinary)

### 5.1 Création du bucket (Dashboard → Storage, ou SQL)
- Bucket **`boutiques`**, **public en lecture** (les images produits/boutiques sont publiques).
- Structure des chemins : `{owner_id}/{boutique_id}/{type}-{timestamp}.jpg` (ex. `uuid/uuid/produit-1720800000.jpg`). Le préfixe `owner_id` permet des politiques Storage par propriétaire.

### 5.2 Politiques Storage
```sql
-- Lecture publique du bucket boutiques
create policy storage_read on storage.objects for select using (bucket_id = 'boutiques');
-- Écriture : uniquement dans son propre dossier (préfixe = owner_id)
create policy storage_write on storage.objects for insert with check (
  bucket_id = 'boutiques' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy storage_delete on storage.objects for delete using (
  bucket_id = 'boutiques' and (storage.foldername(name))[1] = auth.uid()::text
);
```

### 5.3 Réécriture de `js/images.js`
- **Compression client conservée et renforcée** (canvas → JPEG) : photo produit/couverture côté max 800 px qualité 0.72 ; logo 200 px.
- **Miniature générée côté client** : puisqu'on perd les transformations d'URL Cloudinary, générer une 2ᵉ image 200 px (carré, qualité 0.6) à l'upload, et l'uploader séparément → son URL publique va dans `thumb_url`. (Retour au modèle « 2 uploads » de la Phase 1 pré-avenant-1, assumé.)
- **Upload** : `await supabase.storage.from('boutiques').upload(chemin, blob, { contentType: 'image/jpeg' })` puis récupérer l'URL publique via `supabase.storage.from('boutiques').getPublicUrl(chemin)`.
- Enveloppé dans `avecDelai(…, 30000)`, messages d'erreur français.
- **Suppression d'images** : contrairement à Cloudinary, Supabase Storage **permet la suppression côté client** (politique `storage_delete` ci-dessus). Donc : quand un produit est supprimé ou une photo remplacée, **supprimer l'ancienne image du bucket** (`supabase.storage.from('boutiques').remove([chemin])`). Fini les orphelins de l'avenant n°1 — c'est un gain de la migration, à implémenter.

---

## 6. Réécriture de la couche données (`js/db.js`)

Remplacer toute l'API Firestore par `supabase-js`. Conserver l'architecture (fonctions centralisées, tout confiné dans `db.js`). Correspondances :

| Fonction Phase 1 (Firestore) | Version Supabase |
|---|---|
| `boutiqueDeProprietaire(uid)` | `supabase.from('boutiques').select('*').eq('owner_id', uid).maybeSingle()` |
| `produitsDeBoutique(bid)` — **avec** `owner_id` (bug M4 corrigé) | pour le tableau de bord : `.eq('boutique_id', bid).eq('owner_id', user.id)` ; le RLS proprio suffit, mais garder le filtre explicite |
| Index catalogue (limite 600) | **remplacé par la vraie recherche** : `supabase.from('produits').select('...').eq('visible', true).order('cree_le', {ascending:false})` + recherche full-text via `.textSearch('nom_lower', terme)` ou `.ilike('nom_lower', '%terme%')` |
| `increment(1)` | `supabase.rpc('incr_...')` (§3.5) |
| Écriture séquentielle boutique puis boutiques_prive | Idéalement une **fonction RPC transactionnelle** `creer_boutique(...)` qui insère les deux en une transaction — plus robuste que les 2 `await` de la Phase 1. Sinon, 2 appels séquentiels comme avant. |

**Amélioration à saisir** : le §7.3 du cahier des charges d'origine notait qu'il fallait créer `boutiques` puis `boutiques_prive` en 2 écritures séquentielles (jamais en batch) à cause du `get()` de la règle Firestore. En PostgreSQL, une **fonction RPC `creer_boutique` transactionnelle** résout ça proprement : les deux insertions réussissent ou échouent ensemble, atomiquement. Recommandé.

**Conserver tel quel** : `avecDelai()` (timeout 15 s) et `decrireErreur()` (messages différenciés : hors-ligne via `navigator.onLine`, permission refusée, délai, inconnu). Adapter `decrireErreur()` aux codes d'erreur Supabase/PostgREST (ex. code `42501` = permission refusée RLS ; erreurs réseau `fetch` = hors-ligne).

---

## 7. Auth (`js/auth.js`)

Remplacer Firebase Auth par Supabase Auth (email/mot de passe) :

| Firebase | Supabase |
|---|---|
| `createUserWithEmailAndPassword` | `supabase.auth.signUp({ email, password })` |
| `signInWithEmailAndPassword` | `supabase.auth.signInWithPassword({ email, password })` |
| `signOut()` | `supabase.auth.signOut()` |
| `onAuthStateChanged` | `supabase.auth.onAuthStateChange((event, session) => ...)` |
| `sendPasswordResetEmail` | `supabase.auth.resetPasswordForEmail(email, { redirectTo })` |
| `user.uid` | `session.user.id` (UUID) |

- **Garde des pages** (`espace/`, `admin.html`) : vérifier `supabase.auth.getSession()` ; pour l'admin, appeler `supabase.rpc('est_admin')` ou requêter `admins`.
- **Traduire les erreurs Supabase en français** (« email déjà utilisé », « identifiants incorrects », etc.).
- ⚠️ **Confirmation d'email** : par défaut, Supabase Auth exige une confirmation d'email à l'inscription. Pour l'onboarding assisté de commerçants (souvent avec de fausses adresses, constaté en Phase 1), **désactiver la confirmation d'email obligatoire** dans Dashboard → Authentication → Providers → Email → décocher « Confirm email ». À faire par Chen au jalon S1. (Sinon les commerçants ne pourraient pas se connecter sans valider un email qu'ils ne reçoivent pas.)

---

## 8. Jalons de migration (validés un par un en conditions réelles)

| Jalon | Contenu | Validation |
|---|---|---|
| **S0** | Schéma SQL (§3) + RLS (§4) + bucket Storage (§5.1-5.2) exécutés dans Supabase ; `js/supabase-config.js` avec la clé anon ; client Supabase chargé | Les tables existent, RLS actif ; une requête REST anonyme sur `produits` renvoie `[]` (vide mais autorisé) et non une erreur |
| **S1** | Auth : inscription, connexion, déconnexion, reset, garde des pages ; confirmation email désactivée | Un compte se crée, se connecte, accède à `espace/` ; un non-connecté est redirigé |
| **S2** | Création de boutique (RPC transactionnelle) + tableau de bord + « Modifier ma boutique » | Boutique créée (`en_attente`), visible dans le dashboard ; `boutiques` + `boutiques_prive` peuplées |
| **S3** | CRUD produits + upload/compression/miniature Storage + suppression d'images | Produit créé avec photo < 150 Ko dans le bucket, miniature générée ; suppression retire l'image du bucket |
| **S4** | Vitrine publique : recherche (full-text), fiches boutique/produit, WhatsApp, compteurs via RPC, favoris. **+ RE-TESTS D'INTRUSION** (auto-badge, modif produit d'autrui, écriture `admins`) → doivent échouer | Parcours visiteur complet ; les 3 attaques renvoient une erreur RLS (`42501`) |
| **S5** | Admin : garde via `est_admin()`, validation, badge, suspension, modération ; service worker (adapter `CACHE_VERSION` → `suuq-v3`, retirer le SDK Firebase du precache, ajouter le CDN Supabase) ; re-audit hors-ligne et performance | Admin fonctionnel ; PWA installable ; hors-ligne OK ; le compte non-admin accède à son dashboard sans erreur |

À chaque jalon : fournir le SQL à exécuter dans le Dashboard s'il évolue, et une courte liste de tests manuels.

---

## 9. Nettoyage Firebase (après validation complète, PAS avant)

Une fois S0–S5 validés et l'app 100 % sur Supabase :
- Retirer du code : SDK Firebase, `js/firebase-config.js`, imports gstatic Firebase.
- Retirer `js/cloudinary-config.js` et tout reste Cloudinary.
- Mettre à jour le README (nouvelle architecture, mise en route Supabase, exigence `CACHE_VERSION`).
- Le projet Firebase et le compte Cloudinary peuvent être conservés en veille quelques semaines par prudence, puis supprimés.
- **Ne rien supprimer côté Firebase tant que la migration n'est pas intégralement validée en production.**

---

## 10. Vers l'auto-hébergement (note de cap, hors périmètre de cet avenant)

Supabase étant open-source, l'objectif de souveraineté (hébergement en Afrique / à Djibouti) se fera plus tard en déplaçant l'instance Supabase sur un serveur sous juridiction africaine. Comme c'est le **même logiciel**, la bascule Cloud → auto-hébergé ne nécessitera **aucune réécriture applicative** : seules les valeurs de `js/supabase-config.js` (URL + clé) changeront. Garder cette portabilité en tête : ne jamais utiliser de fonctionnalité Supabase Cloud propriétaire non disponible en self-hosting.

---

*Fin de l'avenant n°2 — Migration Supabase. Toute ambiguïté : trancher avec Chen avant implémentation.*
