# SUUQ — Avenant n°1 au cahier des charges Phase 1
**Objet : hébergement des images sur Cloudinary (remplace Firebase Storage)**
**Version : le cahier des charges 1.1 + cet avenant = référentiel 1.2 — Juillet 2026**

---

## 0. Instructions pour l'agent de développement (Claude Code)

1. Ce document **amende** le cahier des charges Phase 1 (v1.1). Le lire après lui ; en cas de conflit, **l'avenant prévaut**. Le placer dans `docs/` à côté du cahier des charges.
2. Décision du client : **pas de plan Blaze en Phase 1** (Firebase Storage requiert un compte de facturation). Les images sont hébergées sur **Cloudinary** (offre gratuite, upload non signé depuis le navigateur). Firebase Auth et Firestore ne changent pas.
3. Cet avenant s'applique **au M2 et aux jalons suivants**, et impose **une correction rétroactive au M1** : les uploads logo/couverture du formulaire boutique doivent viser Cloudinary (Firebase Storage n'a jamais été provisionné — tout appel au SDK Storage échouerait).
4. La migration future vers Firebase Storage (à l'échelle, une fois Blaze activé) est prévue : **tout le code d'upload doit rester confiné dans `js/images.js`** + un fichier de config. Aucun autre module ne doit connaître Cloudinary.

---

## 1. Sections du cahier des charges modifiées

| Section | Sort |
|---|---|
| §7.2 Règles Storage | **Obsolète.** Supprimer `firebase/storage.rules` du repo. Remplacé par les garde-fous du preset Cloudinary (§4 ci-dessous) |
| §8.3 Compression d'images | **Modifié** : compression client conservée, mais une seule image uploadée par photo — la miniature devient une transformation d'URL (§3.3) |
| §5.2 `produits.thumbUrl` | **Inchangé dans le modèle**, mais la valeur stockée est désormais une URL de transformation Cloudinary |
| §12 Critère n°9 | **Remplacé** par le critère du §6 ci-dessous |
| §11 Jalon M2 | Inclut la correction rétroactive M1 (logo/couverture → Cloudinary) |

Aucun changement : modèle Firestore, règles Firestore §7.1, parcours, design, jalons M3–M5.

---

## 2. Configuration (fournie par Chen)

Nouveau fichier `js/cloudinary-config.js` :
```js
// Valeurs publiques par nature (comme firebaseConfig) : la protection
// vient des restrictions du preset côté Cloudinary, pas du secret.
export const CLOUDINARY = {
  cloudName: "A_REMPLIR",
  uploadPreset: "suuq_produits",
};
```
Demander les deux valeurs à Chen au début du M2 si elles manquent. **Ne jamais** introduire d'API key/secret Cloudinary côté client.

---

## 3. Spécification `js/images.js` (réécriture)

### 3.1 Compression côté client — inchangée sur le principe
Canvas → JPEG : photos produit et couverture côté max **800 px**, qualité 0.72 ; logo côté max **200 px**. Refus des fichiers non-image. Plus **aucune miniature générée ni uploadée** côté client.

### 3.2 Upload
```
POST https://api.cloudinary.com/v1_1/{cloudName}/image/upload
FormData : file = <blob compressé>, upload_preset = <uploadPreset>
```
- Enveloppé dans `avecDelai(…, 30000)` — mêmes messages d'erreur français que le reste de l'app.
- Réponse JSON → conserver `secure_url` (c'est la valeur stockée dans `photos[]`, `logoUrl`, `couvertureUrl`).
- Échec réseau/HTTP ≠ 200 → erreur propre, bouton réactivé, jamais de spinner infini.

### 3.3 Miniatures et affichage par transformation d'URL
Helper unique :
```js
// Insère une transformation juste après "/upload/" dans une URL Cloudinary.
export function urlTransformee(url, transfo) {
  return url.replace("/upload/", `/upload/${transfo}/`);
}
```
- `thumbUrl` stocké en Firestore = `urlTransformee(secureUrl, "w_200,h_200,c_fill,q_auto,f_auto")` (carré, cohérent avec les cartes ratio 1:1 du §9.3).
- Affichage fiche produit : `urlTransformee(url, "w_800,q_auto,f_auto")`.
- `q_auto,f_auto` sert automatiquement WebP/AVIF aux navigateurs compatibles — économie de data bienvenue pour le contexte local.

---

## 4. Réglages du preset Cloudinary (garde-fous, faits par Chen dans la console)

Le preset est **non signé** : son nom est visible dans le code, n'importe qui peut techniquement uploader. Les restrictions suivantes bornent le risque :
- **Signing mode : Unsigned** (obligatoire pour l'upload navigateur sans backend).
- **Folder : `suuq`** — tous les uploads atterrissent dans un dossier identifiable.
- **Incoming transformation : `c_limit,w_1200,h_1200`** — plafonne la taille stockée quoi qu'envoie le client.
- **Formats autorisés : jpg, png, webp** uniquement.
- Overwrite désactivé / identifiants uniques (comportement par défaut : conserver).

---

## 5. Limites assumées en Phase 1 (documentées, acceptées)

1. **Pas de suppression d'images côté client** : la suppression Cloudinary exige une signature (API secret), impossible dans une app 100% front. Quand un produit est supprimé ou une photo remplacée, l'ancienne image devient orpheline chez Cloudinary. Accepté en Phase 1 (stockage gratuit large) ; nettoyage manuel possible via la console Cloudinary (dossier `suuq`), ou script signé exécuté par Chen plus tard.
2. **Preset public** : risque d'upload abusif accepté en Phase 1. Parades si abus constaté : renommer le preset (+ mise à jour config), puis à terme uploads signés ou migration Firebase Storage/Blaze.
3. **Quota** : offre gratuite à crédits (~25/mois ; 1 crédit ≈ 1 Go de stockage, 1 Go de bande passante ou 1 000 transformations). La Phase 1 (photos 40–120 Ko, catalogue de quelques centaines de produits) tient très largement dedans. Si un email de quota arrive : en parler avant toute décision.

---

## 6. Critère d'acceptation (remplace le n°9 du §12)

Une photo de 4 Mo choisie dans le formulaire produit : est compressée côté client (< 150 Ko), uploadée vers `res.cloudinary.com` en moins de 30 s sur le réseau local, visible sur la fiche produit via `w_800`, et sa miniature `w_200` s'affiche dans les grilles. En cas de coupure réseau pendant l'upload : message "Connexion instable, réessayez." en 30 s max, bouton réactivé.

---

## 7. Rappel migration future (pour les sessions suivantes)

Le jour où Blaze est activé : seuls `js/cloudinary-config.js` et `js/images.js` changent (retour aux specs §7.2/§8.3 d'origine). Les URLs Cloudinary déjà stockées en Firestore **restent valides et affichées telles quelles** — aucune migration de données obligatoire, cohabitation assumée.

---

*Fin de l'avenant n°1 — SUUQ Phase 1. Toute ambiguïté : trancher avec Chen avant implémentation.*
