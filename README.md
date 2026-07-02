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
| M1 | Auth + création de boutique + garde des pages `espace/` | ⏳ À venir |
| M2 | CRUD produits, compression images, tableau de bord | ⏳ À venir |
| M3 | Vitrine publique : recherche, fiches, WhatsApp, favoris, compteurs | ⏳ À venir |
| M4 | Espace admin : validation, badge vérifié, modération | ⏳ À venir |
| M5 | Service worker, hors-ligne, audit performance, déploiement | ⏳ À venir |

Le cahier des charges complet est dans [`docs/cahier-des-charges-phase1.md`](docs/cahier-des-charges-phase1.md).

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
