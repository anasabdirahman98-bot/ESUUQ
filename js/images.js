// Compression d'images côté client (canvas -> JPEG) + upload Storage.
// Implémenté au jalon M2 (voir cahier des charges §8.3) :
//   - photo produit / couverture : côté max 800 px, qualité 0.72 ;
//   - miniature (thumbUrl)       : côté max 200 px, qualité 0.6 ;
//   - logo                       : côté max 200 px ;
//   - refus des fichiers non-image ; poids final attendu 40–120 Ko.
