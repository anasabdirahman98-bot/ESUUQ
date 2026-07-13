# SUUQ — Phase 1

**Le moteur de recherche du commerce djiboutien.** PWA marketplace de découverte :
chaque commerçant a sa page boutique, le client cherche un produit et voit qui en a,
où, à quel prix — la commande se fait via WhatsApp.

## Stack

- HTML / CSS / JavaScript vanilla (ES modules) — **aucun framework, aucun build**
- Firebase : Auth, Firestore, Storage (SDK modulaire via CDN, chargé uniquement là où nécessaire)
- Déploiement : GitHub Pages (site statique)

## Lancer en local

Servir le dossier en statique (les modules ES exigent un serveur HTTP) :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Avancement des jalons (cahier des charges §11)

| Jalon | Contenu | État |
|---|---|---|
| M0 | Squelette, CSS de base, constantes, manifest, config Firebase, accueil statique | ✅ Fait |
| M1 | Auth + création de boutique + garde des pages `espace/` | ✅ Fait |
| M2 | CRUD produits, compression images, tableau de bord | ✅ Fait |
| M3 | Vitrine publique : recherche, fiches, WhatsApp, favoris, compteurs | ✅ Fait |
| M4 | Espace admin : validation, badge vérifié, modération | ✅ Fait |
| M5 | Service worker, hors-ligne, audit performance, déploiement | ✅ Fait |

Le cahier des charges complet est dans [`docs/cahier-des-charges-phase1.md`](docs/cahier-des-charges-phase1.md),
amendé par [`docs/avenant-1-cloudinary.md`](docs/avenant-1-cloudinary.md) puis
[`docs/avenant-2-supabase.md`](docs/avenant-2-supabase.md) (référentiel 2.0 —
en cas de conflit, le dernier avenant prévaut).

## 🚧 Migration Firebase → Supabase (avenant n°2, en cours)

Motivée par la **souveraineté des données** (PostgreSQL open-source,
auto-hébergeable sous juridiction africaine — seule `js/supabase-config.js`
changera à la bascule). Base repartie de zéro, aucune donnée migrée.
Cloudinary sera abandonné au profit de Supabase Storage. Firebase reste en
place et fonctionnel jusqu'à validation complète (§9 de l'avenant).

| Jalon | Contenu | État |
|---|---|---|
| S0 | Schéma SQL + RLS + bucket Storage + config client | ✅ Validé (SQL exécuté, RLS actif, REST → `[]`) |
| S1 | Auth Supabase (inscription, connexion, reset, garde) | ✅ Fait |
| S2 | Création de boutique (RPC transactionnelle) + tableau de bord | ⏳ À venir |
| S3 | CRUD produits + Storage (upload, miniatures, suppression) | ⏳ À venir |
| S4 | Vitrine publique + re-tests d'intrusion RLS | ⏳ À venir |
| S5 | Admin + service worker (suuq-v3) + audits | ⏳ À venir |

**État transitoire S1** : l'authentification et la lecture
`boutiqueDeProprietaire` sont sur Supabase (`user.id` UUID remplace
`user.uid`) ; le reste de la couche données (création de boutique, produits,
vitrine, admin) demeure Firebase jusqu'aux jalons S2–S5 — la création de
boutique et l'espace admin sont donc momentanément non fonctionnels avec un
compte Supabase, c'est attendu.

### Mise en route S0 (Dashboard Supabase → SQL Editor, dans cet ordre)

1. Exécuter [`supabase/schema.sql`](supabase/schema.sql) — tables, index,
   fonctions (`est_admin`, incréments atomiques).
2. Exécuter [`supabase/rls.sql`](supabase/rls.sql) — politiques Row Level
   Security (⚠️ contient 2 corrections par rapport au texte de l'avenant,
   documentées en tête de fichier : sous-requêtes WITH CHECK qualifiées,
   verrou `owner_id` sur la mise à jour admin).
3. Exécuter [`supabase/storage.sql`](supabase/storage.sql) — bucket public
   `boutiques` + politiques par propriétaire.
4. Vérifier (critère S0) : `curl -H "apikey: <clé anon>"
   "https://kkdpfarvzgookvgfsbya.supabase.co/rest/v1/produits?select=id"`
   doit renvoyer `[]` (vide mais autorisé), pas une erreur.

### Décisions prises avec Chen

- **Horaires (M1)** : deux plages par jour `{ouvert, de, a, de2, a2}` (la 2e plage est
  optionnelle) au lieu du modèle §5.1 à une seule plage — nécessaire pour représenter
  la coupure de midi (Sam–Jeu 08:00–13:00 / 16:00–20:00, Ven ouvert l'après-midi
  seulement). L'indicateur Ouvert/Fermé (M3) devra tenir compte des deux plages.
- **Base Firestore nommée `default` (correctif M1) — ne jamais retirer le 3ᵉ argument** :
  la base Firestore du projet est une base NOMMÉE d'ID `default` (sans parenthèses),
  pas la base par défaut `(default)`. `js/db.js` initialise donc :
  `initializeFirestore(app, { experimentalForceLongPolling: true }, "default")`.
  Sans ce 3ᵉ argument, le SDK vise `(default)` qui n'existe pas (404 NOT_FOUND) et
  toutes les opérations pendent en retry silencieux jusqu'au timeout. Le long-polling
  forcé est conservé par simple précaution (le diagnostic initial « WebChannel bloqué
  par le réseau » a été infirmé — REST instantané).
- **Timeout systématique (M1)** : **toute** lecture/écriture Firestore (jalons M2+
  compris) doit passer par le helper `avecDelai()` de `js/db.js` (15 s → erreur
  `delai-depasse`, message « Connexion instable, réessayez. »). Jamais d'opération
  sans feedback — c'est ce garde-fou qui a permis le diagnostic ci-dessus.
- **« Rules are not filters » (correctif M4)** : toute requête Firestore doit être
  PROUVABLE par les règles §7.1 pour le compte qui l'exécute. Un commerçant doit
  toujours filtrer `where("ownerUid","==",uid)` (branche `estProprio`) ; le public
  doit toujours filtrer `visible == true` / `statut == "active"`. Un compte admin
  rend TOUTES les requêtes prouvables — ne jamais tester les parcours commerçant
  avec un compte admin. Les écrans d'erreur passent par `decrireErreur()` (db.js)
  qui distingue délai réseau / permission refusée / erreur inconnue.
- **Images sur Cloudinary (avenant n°1, M2)** : pas de plan Blaze en Phase 1, donc
  pas de Firebase Storage. Upload non signé vers Cloudinary, confiné dans
  `js/images.js` + `js/cloudinary-config.js` (aucun autre module ne connaît
  Cloudinary). Miniatures = transformations d'URL (`w_200,h_200,c_fill,q_auto,f_auto`),
  plus aucune miniature uploadée. `firebase/storage.rules` supprimé (§7.2 obsolète).
  **Écart au §4 de l'avenant (note Chen)** : le garde-fou serveur
  `c_limit,w_1200,h_1200` n'a PAS pu être configuré (champ introuvable dans la
  nouvelle console Cloudinary) — la compression client 800 px est la SEULE limite
  active. Le reste du §4 est en place (Unsigned, folder `suuq`, IDs indevinables).

## Mise en route (à faire une fois)

1. **Firebase → Authentication** → Sign-in method → activer **E-mail/Mot de passe**.
2. **Firebase → Firestore Database** : la base du projet est la base **nommée `default`**
   (voir Décisions) → onglet *Règles* → coller le contenu de
   [`firebase/firestore.rules`](firebase/firestore.rules) → Publier (sur la base `default`).
3. **Cloudinary** : preset `suuq_produits` en mode **Unsigned**, folder `suuq`,
   formats jpg/png/webp (déjà configuré par Chen — voir avenant §4 et l'écart
   documenté dans Décisions).
4. (Recommandé) **Authentication → Settings → Domaines autorisés** : vérifier que
   `anasabdirahman98-bot.github.io` et `localhost` figurent dans la liste.
5. **Index composite Firestore (requis par le M3)** : la requête de l'index
   catalogue (`produits` où `visible == true`, tri `creeLe desc`, §6) exige un
   index composite. Console Firestore (base `default`) → *Index* → *Créer un
   index* : collection `produits`, champs `visible` (croissant) puis `creeLe`
   (décroissant), portée Collection. Sans lui, la recherche publique échoue —
   la console navigateur affiche alors un lien de création directe.
6. **GitHub Pages** : Settings → Pages → Source = **GitHub Actions** (workflow
   [`deploy-pages.yml`](.github/workflows/deploy-pages.yml) — déploie `main`
   à chaque push).
7. **Compte admin (M4)** : créer le compte email/mot de passe dans Authentication,
   copier son UID, puis dans Firestore (base `default`) créer le document
   `admins/{UID}` avec le champ `role` = `"admin"`. L'écriture de cette collection
   n'est possible que depuis la console (règles §7.1). La page `admin.html`
   redirige vers l'accueil tout utilisateur non admin.

### Jeu d'essai (§14)

`js/seed.js` — jamais chargé par les pages. Connecté en admin sur `admin.html`,
dans la console navigateur :

```js
const seed = await import("./js/seed.js");
await seed.executer();
```

Crée 3 boutiques (2 actives dont 1 vérifiée, 1 en attente) et 12 produits
(photos placeholder locales, numéros WhatsApp factices `2537700xxxx`).

## Structure

```
├── index.html                 # Accueil + recherche
├── boutique.html              # Fiche boutique publique
├── produit.html               # Fiche produit publique
├── favoris.html
├── connexion.html
├── hors-ligne.html
├── admin.html
├── espace/                    # Espace commerçant (protégé à partir de M1)
│   ├── index.html             # Tableau de bord
│   ├── boutique.html          # Créer / modifier ma boutique
│   └── produit.html           # Ajouter / modifier un produit
├── css/                       # variables.css, base.css, composants.css
├── js/                        # configs (Firebase, Cloudinary), constantes, modules (db, auth, recherche, images, ui)
├── firebase/                  # firestore.rules (à coller dans la console)
├── docs/                      # cahier des charges + avenant n°1 (Cloudinary)
├── assets/                    # icônes PWA, logo, placeholder produit
└── manifest.json
```

## Service worker et déploiement (M5)

- `sw.js` : précache du shell (pages, CSS, JS, icônes — jamais `js/seed.js`),
  images Cloudinary en *cache-first* plafonné à 60 entrées (purge FIFO),
  SDK Firebase (URLs versionnées immuables) en *cache-first*, pages HTML en
  *réseau d'abord* avec repli cache puis `hors-ligne.html`. Les API dynamiques
  (Firestore, Auth, upload Cloudinary) ne sont jamais interceptées.
- **À chaque déploiement qui modifie HTML/CSS/JS : incrémenter `CACHE_VERSION`
  dans `sw.js`** (suuq-v1 → suuq-v2…), sinon les utilisateurs gardent
  l'ancien shell en cache.
- Budget premier chargement (hors images produits) : < 250 Ko — voir l'audit
  dans le commit M5 ; vérifiable en ligne via Lighthouse (mobile).
<!-- deploy M2 -->
