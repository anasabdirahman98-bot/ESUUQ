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
| M2 | CRUD produits, compression images, tableau de bord | ⏳ À venir |
| M3 | Vitrine publique : recherche, fiches, WhatsApp, favoris, compteurs | ⏳ À venir |
| M4 | Espace admin : validation, badge vérifié, modération | ⏳ À venir |
| M5 | Service worker, hors-ligne, audit performance, déploiement | ⏳ À venir |

Le cahier des charges complet est dans [`docs/cahier-des-charges-phase1.md`](docs/cahier-des-charges-phase1.md).

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

## Mise en route Firebase (à faire une fois, console Firebase)

1. **Authentication** → Sign-in method → activer **E-mail/Mot de passe**.
2. **Firestore Database** → créer la base (mode production) → onglet *Règles* →
   coller le contenu de [`firebase/firestore.rules`](firebase/firestore.rules) → Publier.
3. **Storage** → démarrer → onglet *Règles* →
   coller le contenu de [`firebase/storage.rules`](firebase/storage.rules) → Publier.
4. (Recommandé) **Authentication → Settings → Domaines autorisés** : vérifier que
   `anasabdirahman98-bot.github.io` et `localhost` figurent dans la liste.

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
├── js/                        # config Firebase, constantes, modules (db, auth, recherche, images, ui)
├── assets/                    # icônes PWA, logo, placeholder produit
└── manifest.json
```

Le service worker (`sw.js`) arrive au jalon M5.
