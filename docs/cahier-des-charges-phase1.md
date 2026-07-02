# SUUQ — Cahier des charges Phase 1
**Version 1.1 — Juillet 2026 — Rédigé pour développement via Claude Code**

---

## 0. Instructions pour l'agent de développement (Claude Code)

Tu vas développer la Phase 1 de SUUQ, une PWA marketplace pour le commerce local de Djibouti. Avant d'écrire la moindre ligne de code :

1. **Lis ce document en entier.** Chaque décision technique y est justifiée par une contrainte locale (coût de la data, adressage, confiance).
2. **Stack imposée, non négociable** : HTML / CSS / JavaScript vanilla (ES modules), Firebase (Auth, Firestore, Storage), déploiement GitHub Pages. **Aucun framework** (pas de React, Vue, etc.), **aucun bundler ni étape de build** (pas de npm/webpack/vite). Le projet doit tourner en ouvrant `index.html` servi statiquement.
3. **Travaille jalon par jalon** (section 11). Termine et fais valider chaque jalon avant de passer au suivant.
4. **Demande au développeur (Chen)** : sa configuration Firebase (`firebaseConfig`) au moment du jalon M0. Utilise un fichier `js/firebase-config.js` avec un placeholder clair en attendant.
5. **Langue** : toute l'interface utilisateur est en **français**. Les commentaires de code sont en français simple. Les noms de variables/fonctions en anglais ou français, mais cohérents.
6. **Mobile-first absolu** : conçois chaque écran pour un smartphone Android d'entrée de gamme (viewport 360px, connexion 3G). Le desktop est une adaptation secondaire.
7. **Aucune fonctionnalité hors périmètre** (section 13), même si elle semble facile à ajouter. La discipline de scope est une exigence du client.

---

## 1. Contexte et vision

### 1.1 Le problème
Le commerce de détail djiboutien est déjà digital, mais **éclaté** : chaque commerçant vend via statuts WhatsApp, groupes Facebook ou compte Instagram. Il n'existe **aucune couche d'agrégation**. Pour trouver un produit précis, le client fait plusieurs boutiques à pied ou poste dans un groupe Facebook en espérant une réponse.

### 1.2 La solution Phase 1
SUUQ ("le marché" en somali) est **le moteur de recherche du commerce djiboutien** :

- Chaque commerçant dispose d'une **page boutique** : produits, prix, localisation par repères, horaires, badge vérifié.
- Le client **cherche un produit** ("Samsung S24", "chaussures 45") et voit instantanément qui en a, où, à quel prix.
- La commande se fait via un **bouton WhatsApp** avec message pré-rempli. La transaction (paiement, livraison) se déroule hors application, comme aujourd'hui.

**Phase 1 = découverte, pas transaction.** Pas de panier, pas de paiement, pas de livraison, pas de comptes clients. Ces briques arrivent en Phases 2 à 4.

### 1.3 Contraintes locales structurantes
| Contrainte | Réponse produit |
|---|---|
| Data mobile chère | PWA ultra-légère, images compressées, cache agressif, polices système |
| Adressage postal inexistant | Localisation par quartier + repère textuel ("en face de la pharmacie X") + position GPS optionnelle |
| Confiance faible envers l'achat en ligne | Badge "Vérifié" attribué manuellement par l'admin, photos réelles, contact WhatsApp direct (canal déjà familier) |
| Commerçants peu à l'aise avec le digital | Onboarding assisté : l'admin peut créer des boutiques pour le compte des commerçants ; formulaires ultra-simples |
| Smartphones Android d'entrée de gamme | Performance budget strict (section 8) |

---

## 2. Périmètre Phase 1

### 2.1 Inclus
- Vitrine publique : accueil, recherche, filtres, fiche boutique, fiche produit, favoris locaux, partage
- Espace commerçant : inscription, création de boutique, gestion des produits (CRUD), mini-statistiques, partage de sa page
- Espace admin : validation des boutiques, attribution du badge vérifié, suspension/modération
- Contact via deep link WhatsApp avec message pré-rempli
- PWA installable, consultable avec cache hors ligne
- Compteurs de vues et de clics WhatsApp

### 2.2 Exclus (voir section 13)
Comptes clients, avis/notes, panier, commande in-app, paiement, livraison, chat interne, notifications push, multilingue, synchronisation DUKA.

---

## 3. Rôles

| Rôle | Authentification | Capacités |
|---|---|---|
| **Visiteur** | Aucune (jamais de compte client en Phase 1) | Rechercher, consulter boutiques et produits, favoris (localStorage), cliquer WhatsApp, partager |
| **Commerçant** | Firebase Auth email + mot de passe | Créer et gérer **une seule** boutique, gérer ses produits, voir ses statistiques |
| **Admin** | Firebase Auth + document dans la collection `admins` | Valider/refuser/suspendre les boutiques, attribuer le badge vérifié, masquer un produit, vue d'ensemble |

Note : l'authentification par email/mot de passe est retenue pour sa simplicité (la Phone Auth Firebase exige un plan facturé et reCAPTCHA). L'onboarding étant assisté au départ, l'admin crée l'email du commerçant si besoin. Migration Phone Auth envisageable en Phase 2.

---

## 4. Parcours et fonctionnalités détaillées

### 4.1 Visiteur (public, sans compte)

#### Accueil (`index.html`)
- Header : logo SUUQ + bouton "Espace commerçant".
- **Barre de recherche proéminente** (élément central de l'écran).
- Rangée de **chips catégories** défilable horizontalement.
- Section "Boutiques vérifiées" : cartes horizontales défilables (logo, nom, quartier, badge).
- Section "Nouveautés" : grille 2 colonnes des derniers produits ajoutés (photo, nom, prix, nom boutique).
- Footer discret : "SUUQ — le commerce djiboutien, en un seul endroit" + lien "Devenir commerçant".

#### Recherche et résultats
- Recherche déclenchée à la saisie (debounce 300 ms) sur l'index catalogue (stratégie section 6).
- Correspondance insensible à la casse **et aux accents**, par inclusion de sous-chaîne sur le nom du produit et ses tags.
- **Filtres** : catégorie, quartier, fourchette de prix (min/max). **Tri** : plus récents (défaut), prix croissant, prix décroissant.
- Carte résultat produit : photo (thumbnail), nom, prix formaté ("12 500 FDJ"), nom boutique + badge éventuel, quartier, pastille "Rupture" si indisponible.
- État vide : "Aucun résultat pour « X ». Essayez un autre mot ou parcourez les catégories."

#### Fiche boutique (`boutique.html?id=…` ou `?s=slug`)
- Photo de couverture, logo, nom + badge "✓ Vérifié" le cas échéant, catégorie, description.
- **Localisation** : quartier + repère textuel. Si position GPS renseignée : bouton "Itinéraire" ouvrant `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`.
- **Horaires** : tableau repliable + indicateur calculé "🟢 Ouvert" / "🔴 Fermé" selon l'heure locale (Africa/Djibouti, UTC+3).
- Boutons : **"Contacter sur WhatsApp"** (message pré-rempli générique) et **"Partager"** (Web Share API, repli copie du lien).
- Catalogue de la boutique : grille des produits disponibles d'abord, indisponibles grisés en fin de liste.
- À l'ouverture : incrément du compteur `stats.vues` de la boutique (au plus 1 fois par session, via sessionStorage).

#### Fiche produit (`produit.html?id=…`)
- Galerie photos (1 à 3, défilement tactile, indicateurs points).
- Nom, prix, disponibilité, description, catégorie, lien vers la boutique (nom + badge + quartier).
- **Bouton principal "Commander sur WhatsApp"** : ouvre `https://wa.me/253XXXXXXXX?text=…` avec le message pré-rempli encodé :
  `Salam ! J'ai vu « {nom produit} » à {prix} FDJ sur SUUQ. C'est toujours disponible ?`
  Au clic : incrément de `stats.clicsWhatsapp` du produit **et** de la boutique.
- Bouton cœur "Favori" (localStorage) + bouton "Partager".
- Section "Autres produits de cette boutique" (4 max).

#### Favoris (`favoris.html`)
- Liste des produits enregistrés dans `localStorage` (clé `suuq_favoris` : tableau d'IDs). Résolution des données via l'index catalogue en cache ; produit disparu = retiré silencieusement.

### 4.2 Commerçant (authentifié)

#### Inscription / connexion (`connexion.html`)
- Onglets "Connexion" / "Créer un compte". Champs : email, mot de passe (min 6). Messages d'erreur Firebase traduits en français clair ("Email déjà utilisé", "Mot de passe incorrect", etc.).
- Après création de compte : redirection vers le formulaire "Créer ma boutique".
- Lien "Mot de passe oublié" (email de réinitialisation Firebase).

#### Création de boutique (première connexion)
Formulaire en une page, champs :
- Nom de la boutique* — Catégorie* (liste, section 5.4) — Description (280 car. max)
- Quartier* (liste déroulante, section 5.5) — Repère* (texte libre, placeholder : "Ex : en face de la pharmacie d'Einguela")
- Position GPS (bouton "📍 Utiliser ma position" → `navigator.geolocation`, optionnel, affichage lat/lng + possibilité d'effacer)
- Numéro WhatsApp* (champ tel : préfixe fixe +253 affiché, 8 chiffres saisis, validation `^77\d{6}$` — format mobile djiboutien)
- Horaires : pour chaque jour, interrupteur Ouvert/Fermé + heures de/à (valeurs par défaut proposées Sam–Jeu 08:00–13:00 / 16:00–20:00, Ven fermé matin) + bouton "Renseigner plus tard"
- Logo (optionnel) et photo de couverture (optionnel) — upload avec compression (section 8.3)

À la soumission : boutique créée avec `statut: "en_attente"`, écran de confirmation : "Votre boutique est en cours de vérification par l'équipe SUUQ. Vous pouvez déjà ajouter vos produits."

#### Tableau de bord (`espace/index.html`)
- Bandeau statut : "⏳ En attente de validation" / "✅ En ligne" / "⛔ Suspendue — contactez SUUQ".
- 3 compteurs : vues boutique, clics WhatsApp, nombre de produits.
- Boutons : "➕ Ajouter un produit", "Modifier ma boutique", "📤 Partager ma boutique" (lien public + Web Share API — canal d'acquisition clé : le commerçant diffuse sa page sur ses statuts WhatsApp).
- Liste de ses produits : miniature, nom, prix, interrupteur **Disponible/Rupture** (mise à jour immédiate), boutons Modifier / Supprimer (confirmation).

#### Ajout / édition produit (`espace/produit.html`)
- Champs : nom* (60 car.), prix* (entier FDJ > 0), catégorie* (héritée boutique par défaut, modifiable), description (280 car.), tags (jusqu'à 5, saisie libre séparée par virgules — servent à la recherche), photos (1 à 3*, compression client obligatoire), disponibilité (défaut : disponible).
- Suppression photo individuelle possible en édition.

### 4.3 Admin (`admin.html`)
Accès : utilisateur connecté dont l'UID existe dans la collection `admins`. Sinon : redirection accueil.
- **File de validation** : boutiques `en_attente` (fiche complète consultable) → boutons "✅ Activer" / "❌ Refuser" (motif texte, stocké dans `boutiques_prive.notesAdmin`).
- **Toutes les boutiques** : recherche par nom, actions : Suspendre / Réactiver, **attribuer/retirer le badge "Vérifié"** (interrupteur distinct — l'activation rend visible, le badge atteste d'un contrôle physique de la patente).
- **Modération produits** : possibilité de masquer un produit (`visible: false`) depuis la fiche boutique admin.
- Compteurs globaux : boutiques actives / en attente, produits, clics WhatsApp cumulés.

---

## 5. Modèle de données Firestore

### 5.1 Collection `boutiques/{boutiqueId}`
Lecture publique si `statut == "active"`. Une seule boutique par compte (contrainte applicative + règle).

```
ownerUid        string    UID Firebase du propriétaire
nom             string    max 60
nomLower        string    nom normalisé (minuscules, sans accents) — pour recherche/tri
slug            string    généré depuis le nom (kebab-case + 4 car. aléatoires), unique
description     string    max 280
categorie       string    une valeur de la liste 5.4
quartier        string    une valeur de la liste 5.5
repere          string    max 120
geo             map|null  { lat: number, lng: number }
whatsapp        string    format "253XXXXXXXX" (validé côté client et règles)
horaires        map|null  { lun: {ouvert:bool, de:"08:00", a:"20:00"}, mar:…, …, dim:… }
logoUrl         string|null
couvertureUrl   string|null
statut          string    "en_attente" | "active" | "suspendue"   (admin uniquement)
badgeVerifie    bool      défaut false                            (admin uniquement)
stats           map       { vues: number, clicsWhatsapp: number }
creeLe, majLe   timestamp serverTimestamp()
```

### 5.2 Collection `produits/{produitId}`
```
boutiqueId      string
ownerUid        string    dénormalisé pour les règles de sécurité
nom             string    max 60
nomLower        string    normalisé pour recherche
description     string    max 280
prix            number    entier, FDJ
categorie       string
tags            array<string>  max 5, normalisés en minuscules sans accents
photos          array<string>  1 à 3 URLs Storage
thumbUrl        string    miniature de la 1re photo (~200px)
disponible      bool
visible         bool      défaut true — passe à false si modération admin
stats           map       { vues: number, clicsWhatsapp: number }
creeLe, majLe   timestamp
```

### 5.3 Collections annexes
```
boutiques_prive/{boutiqueId}   lecture/écriture : propriétaire + admin uniquement
  email           string
  telPersonnel    string|null
  notesAdmin      string|null   (motifs de refus, remarques)

admins/{uid}                   lecture : le user lui-même ; écriture : personne (console Firebase)
  role: "admin"
```

### 5.4 Catégories (constante partagée `js/constantes.js`)
`Téléphones & Électronique · Mode & Vêtements · Sport · Beauté & Cosmétiques · Maison & Déco · Alimentation · Auto & Moto · Bébé & Enfants · Services · Autre`

### 5.5 Quartiers (même fichier, liste modifiable facilement)
`Balbala · Quartier 1 · Quartier 2 · Quartier 3 · Quartier 4 · Quartier 5 · Quartier 6 · Quartier 7 · Quartier 7 bis · Einguela · Hayabley · PK12 · Arhiba · Ambouli · Gabode · Héron · Plateau du Serpent · Marabout · Salines · Djebel · Autre / Hors Djibouti-ville`

### 5.6 Formatage
- Prix : `new Intl.NumberFormat('fr-FR').format(prix) + " FDJ"` → "12 500 FDJ".
- Normalisation recherche : `s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")` (fonction unique `normaliser()` réutilisée partout : écriture ET lecture).

---

## 6. Stratégie de recherche (décision technique importante)

Firestore ne propose pas de recherche full-text. Pour la Phase 1, la stratégie retenue est **l'index catalogue léger filtré côté client** :

1. Au chargement (accueil ou page recherche), l'app requête : `produits` où `visible == true`, tri `creeLe desc`, **limite 600**, en ne conservant en mémoire que les champs utiles à la liste : `id, nom, nomLower, tags, prix, categorie, thumbUrl, disponible, boutiqueId`.
2. En parallèle, requête des boutiques `statut == "active"` (champs : `id, nom, slug, quartier, badgeVerifie, nomLower`). Les produits dont la boutique n'est pas active sont exclus des résultats.
3. L'index est mis en cache `localStorage` (clé `suuq_index`, TTL **15 minutes**) pour ne pas re-télécharger à chaque navigation. Poids estimé : ~60–90 Ko pour 600 produits — acceptable, et amorti par le cache.
4. La recherche, les filtres et le tri s'exécutent **en mémoire** : inclusion de sous-chaîne sur `nomLower` et `tags` après `normaliser(saisie)`.

**Limite assumée et documentée** : cette approche est valide jusqu'à ~1 500–2 000 produits. Au-delà (Phase 2), migration vers un index précalculé par catégorie ou un service de recherche (Typesense/Algolia). Inscrire ce seuil en commentaire dans `js/recherche.js`.

---

## 7. Sécurité Firebase (exigence critique du client)

Principes : moindre privilège, champs sensibles verrouillés côté règles (jamais uniquement côté client), séparation stricte des rôles, compteurs publics contrôlés.

### 7.1 Règles Firestore — squelette à implémenter tel quel
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function connecte() { return request.auth != null; }
    function estAdmin() {
      return connecte() && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }
    function estProprio(data) { return connecte() && data.ownerUid == request.auth.uid; }

    match /boutiques/{id} {
      // Lecture : publique si active ; sinon proprio ou admin
      allow read: if resource.data.statut == "active"
                  || estProprio(resource.data) || estAdmin();

      // Création : par le proprio, statut et badge forcés, une boutique par compte (vérifié côté app)
      allow create: if estProprio(request.resource.data)
                    && request.resource.data.statut == "en_attente"
                    && request.resource.data.badgeVerifie == false
                    && request.resource.data.stats.vues == 0
                    && request.resource.data.stats.clicsWhatsapp == 0;

      // Mise à jour par le proprio : interdiction de toucher statut, badge, stats, ownerUid
      allow update: if estProprio(resource.data)
                    && !request.resource.data.diff(resource.data).affectedKeys()
                         .hasAny(['statut','badgeVerifie','stats','ownerUid']);

      // Mise à jour admin : tout sauf ownerUid
      allow update: if estAdmin()
                    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['ownerUid']);

      // Compteurs publics : SEULE modification autorisée sans être proprio/admin,
      // uniquement le champ stats, incréments de 0 ou +1
      allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['stats'])
                    && request.resource.data.stats.vues >= resource.data.stats.vues
                    && request.resource.data.stats.vues <= resource.data.stats.vues + 1
                    && request.resource.data.stats.clicsWhatsapp >= resource.data.stats.clicsWhatsapp
                    && request.resource.data.stats.clicsWhatsapp <= resource.data.stats.clicsWhatsapp + 1;

      allow delete: if estAdmin();
    }

    match /produits/{id} {
      allow read: if resource.data.visible == true
                  || estProprio(resource.data) || estAdmin();
      allow create: if estProprio(request.resource.data)
                    && request.resource.data.visible == true
                    && request.resource.data.stats.vues == 0
                    && request.resource.data.stats.clicsWhatsapp == 0
                    && request.resource.data.photos.size() >= 1
                    && request.resource.data.photos.size() <= 3;
      allow update: if estProprio(resource.data)
                    && !request.resource.data.diff(resource.data).affectedKeys()
                         .hasAny(['visible','stats','ownerUid','boutiqueId']);
      allow update: if estAdmin();
      // Compteurs publics, même logique que boutiques
      allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['stats'])
                    && request.resource.data.stats.vues >= resource.data.stats.vues
                    && request.resource.data.stats.vues <= resource.data.stats.vues + 1
                    && request.resource.data.stats.clicsWhatsapp >= resource.data.stats.clicsWhatsapp
                    && request.resource.data.stats.clicsWhatsapp <= resource.data.stats.clicsWhatsapp + 1;
      allow delete: if estProprio(resource.data) || estAdmin();
    }

    match /boutiques_prive/{id} {
      allow read, write: if estAdmin()
        || (connecte() && get(/databases/$(database)/documents/boutiques/$(id)).data.ownerUid == request.auth.uid);
    }

    match /admins/{uid} {
      allow read: if connecte() && request.auth.uid == uid;
      allow write: if false;   // gestion uniquement via console Firebase
    }
  }
}
```

### 7.2 Règles Storage
Chemin d'upload : `uploads/{uid}/{fichier}` — le dossier appartient à l'utilisateur.
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /uploads/{uid}/{fichier} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == uid
                   && request.resource.size < 600 * 1024
                   && request.resource.contentType.matches('image/.*');
      allow delete: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

### 7.3 Rappels d'implémentation
- Les incréments de compteurs utilisent `increment(1)` de Firestore, jamais lecture-puis-écriture.
- Aucune donnée privée (email, tel perso, notes admin) ne transite dans `boutiques` ou `produits`.
- Le numéro WhatsApp de la boutique est **public par nature** (c'est le canal de commande) — il vit donc dans `boutiques`, c'est assumé.
- L'unicité "une boutique par compte" est vérifiée à la création (requête `where ownerUid ==`) ; la règle Firestore ne peut pas la garantir seule, c'est accepté en Phase 1.
- **Ordre de création à l'inscription (jalon M1), impératif** : créer d'abord le document `boutiques/{id}`, puis `boutiques_prive/{id}`, en **deux écritures séquentielles** (deux `await` distincts). Ne JAMAIS grouper ces deux créations dans un `writeBatch` ou une transaction : la règle de sécurité de `boutiques_prive` effectue un `get()` sur `boutiques/{id}`, et dans un batch ce `get()` évalue l'état d'avant le batch — la boutique n'existerait pas encore et la création du document privé serait refusée. Même logique en cas de suppression/recréation.

---

## 8. PWA et performance (contrainte data Djibouti)

### 8.1 PWA
- `manifest.json` : nom "SUUQ", `short_name` "SUUQ", `display: standalone`, `theme_color` et `background_color` (section 9), icônes 192/512 (générer des icônes simples : lettre S sur fond couleur primaire).
- `sw.js` (service worker vanilla, sans Workbox) :
  - **Precache** du shell à l'installation : pages HTML, CSS, JS, icônes.
  - **Cache runtime images** (Storage) : stratégie *cache-first* avec plafond ~60 entrées (purge FIFO simple).
  - **Réseau d'abord** pour les pages HTML avec repli cache, et page `hors-ligne.html` en dernier recours.
  - Versionnement du cache par constante `CACHE_VERSION` à incrémenter à chaque déploiement.

### 8.2 Budget performance
- Premier chargement (hors images produits) : **< 250 Ko** transférés.
- Zéro police externe : pile système `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- `loading="lazy"` sur toutes les images de listes ; dimensions réservées (éviter les sauts de mise en page) ; squelettes de chargement (skeleton) sur les grilles.
- SDK Firebase : imports modulaires v10+ via CDN (`firebase-app`, `firebase-auth`, `firebase-firestore`, `firebase-storage`), chargés **uniquement sur les pages qui en ont besoin** (l'accueil peut s'afficher avant l'init Firebase).

### 8.3 Compression d'images côté client (obligatoire, module `js/images.js`)
À l'upload : lecture du fichier → dessin sur `<canvas>` → export JPEG.
- Photo produit/couverture : côté max **800 px**, qualité 0.72.
- Miniature (`thumbUrl`) : côté max **200 px**, qualité 0.6 — générée et uploadée en même temps que la photo principale.
- Logo : 200 px max.
- Refus des fichiers non-image ; poids final attendu 40–120 Ko par photo.

---

## 9. Design

### 9.1 Direction
Chaleureux, marchand, moderne — l'énergie d'un souk, la lisibilité d'une app fintech. Sobre : la marchandise (photos) est la star, l'interface s'efface.

### 9.2 Variables CSS (`css/variables.css`)
```
--suuq-primaire: #D95F18;    /* safran/terracotta — boutons, accents, prix */
--suuq-primaire-fonce: #B34A0F;
--suuq-fond: #FAF6F0;        /* sable clair */
--suuq-surface: #FFFFFF;     /* cartes */
--suuq-texte: #211A14;
--suuq-texte-2: #6E6259;
--suuq-vert: #1F7A4D;        /* badge vérifié, statut ouvert */
--suuq-rouge: #C0392B;       /* rupture, fermé */
--suuq-whatsapp: #25D366;    /* uniquement les boutons WhatsApp */
--suuq-bordure: #EBE2D6;
--suuq-radius: 14px;
--suuq-ombre: 0 2px 10px rgba(33,26,20,.07);
```

### 9.3 Composants clés
- **Carte produit** (grille 2 col. mobile) : image ratio 1:1 coins arrondis, nom sur 2 lignes max (ellipse), prix en gras couleur primaire, ligne boutique en petit avec ✓ vert si vérifiée.
- **Bouton WhatsApp** : plein `--suuq-whatsapp`, texte blanc, icône, pleine largeur sur fiche produit, position collante (sticky) en bas de la fiche.
- **Badge Vérifié** : pastille verte "✓ Vérifié" — ne jamais l'afficher pour une boutique non vérifiée (pas de badge gris).
- Cibles tactiles ≥ 44 px, formulaires à gros champs, une action principale par écran.

---

## 10. Structure du projet
```
suuq/
├── index.html                 # Accueil + recherche
├── boutique.html              # Fiche boutique publique
├── produit.html               # Fiche produit publique
├── favoris.html
├── connexion.html
├── hors-ligne.html
├── admin.html
├── espace/
│   ├── index.html             # Tableau de bord commerçant
│   ├── boutique.html          # Créer / modifier ma boutique
│   └── produit.html           # Ajouter / modifier un produit
├── css/  (variables.css, base.css, composants.css)
├── js/
│   ├── firebase-config.js     # Placeholder à remplir par Chen
│   ├── constantes.js          # Catégories, quartiers, helpers (normaliser, formatPrix)
│   ├── db.js                  # Accès Firestore centralisé
│   ├── auth.js                # Auth + garde de pages
│   ├── recherche.js           # Index catalogue + filtrage client
│   ├── images.js              # Compression canvas + upload Storage
│   └── ui.js                  # Rendus de cartes, squelettes, toasts
├── assets/ (icônes, logo, placeholder produit)
├── manifest.json
└── sw.js
```
Navigation par pages statiques + paramètres d'URL (`?id=`) — compatible GitHub Pages sans configuration serveur.

---

## 11. Jalons de développement

| Jalon | Contenu | Critère de validation |
|---|---|---|
| **M0** | Squelette du projet, CSS de base, constantes, manifest, config Firebase placeholder, page accueil statique | Le shell s'affiche proprement sur mobile 360 px |
| **M1** | Auth (inscription/connexion/réinit), création de boutique, garde des pages `espace/` | Un commerçant crée son compte et sa boutique (`en_attente`) |
| **M2** | CRUD produits avec compression images + miniatures, tableau de bord, interrupteur dispo | Produits créés avec photos < 120 Ko, visibles dans le dashboard |
| **M3** | Vitrine publique : accueil dynamique, recherche + filtres + tri, fiches boutique et produit, boutons WhatsApp, favoris, partage, compteurs | Parcours visiteur complet : chercher → trouver → cliquer WhatsApp |
| **M4** | Espace admin : validation, badge, suspension, modération, compteurs globaux | Une boutique `en_attente` passe `active` et apparaît publiquement |
| **M5** | Service worker, hors-ligne, audit performance (< 250 Ko), polissage, états vides, déploiement GitHub Pages | Lighthouse mobile : Performance ≥ 90, PWA installable |

À chaque jalon : fournir les règles de sécurité à coller dans la console Firebase si elles ont évolué, et une courte liste de tests manuels.

---

## 12. Critères d'acceptation Phase 1 (tests manuels de recette)

1. Un visiteur **sans compte** cherche "s24" et trouve un produit nommé "Samsung Galaxy S24" (insensible casse/accents).
2. Le clic "Commander sur WhatsApp" ouvre WhatsApp avec le message pré-rempli contenant le nom du produit et le prix.
3. Une boutique `en_attente` ou `suspendue` est **introuvable** publiquement (recherche, accueil, URL directe → message "Boutique indisponible").
4. Un commerçant ne peut pas modifier `statut`, `badgeVerifie` ou `stats` (test direct Firestore refusé par les règles).
5. Un commerçant ne peut pas créer une deuxième boutique.
6. Une photo uploadée de 4 Mo ressort à moins de 150 Ko ; sa miniature charge dans les grilles.
7. Le compteur de clics WhatsApp s'incrémente ; un visiteur ne peut pas modifier d'autres champs (règles).
8. L'admin voit la file d'attente, active une boutique, lui attribue le badge — le "✓ Vérifié" apparaît publiquement.
9. L'interrupteur Rupture grise immédiatement le produit côté public.
10. App installable (Android/Chrome) ; en mode avion, les pages déjà visitées s'affichent depuis le cache.
11. Accueil premier chargement < 250 Ko hors images produits (onglet Réseau).
12. Le lien partagé d'une boutique s'ouvre correctement depuis WhatsApp.

---

## 13. Hors périmètre Phase 1 — ne pas implémenter
Comptes clients et avis/notes (Phase 2) · panier et commande in-app (Phase 2) · paiement D-Money/Waafi/CAC Pay (Phase 2) · livraison et réseau de livreurs (Phase 3) · synchronisation DUKA back-office (Phase 4) · chat interne · notifications push · multilingue (somali/arabe) · application native.

Si une demande semble l'exiger, poser la question plutôt que d'anticiper.

---

## 14. Données de démarrage (jeu d'essai)
Fournir un module `js/seed.js` (exécutable une fois depuis la console navigateur par un admin connecté, jamais chargé en production) créant :
- 3 boutiques fictives dans des quartiers différents (ex. électronique à Einguela, sportswear à Balbala, cosmétiques Quartier 4), 2 actives dont 1 vérifiée, 1 en attente ;
- 12 produits répartis, prix réalistes en FDJ (ex. téléphone 45 000–180 000, maillot 2 500–6 000), photos = images placeholder locales ;
- numéros WhatsApp factices au format `2537700xxxx`.

---

*Fin du cahier des charges Phase 1 — SUUQ. Toute ambiguïté rencontrée en cours de développement doit être tranchée avec Chen avant implémentation.*
