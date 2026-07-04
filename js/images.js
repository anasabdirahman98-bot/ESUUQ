// Compression d'images côté client (canvas → JPEG) + upload Cloudinary.
// Avenant n°1 : Cloudinary remplace Firebase Storage en Phase 1 (pas de plan
// Blaze). TOUT le code d'upload est confiné ici + cloudinary-config.js —
// aucun autre module ne doit connaître Cloudinary (migration future, §7).
//
// AVERTISSEMENT (note Chen, juillet 2026) : le garde-fou serveur du preset
// « incoming transformation c_limit,w_1200,h_1200 » N'EST PAS configuré
// (champ introuvable dans la nouvelle console Cloudinary). Il n'existe donc
// AUCUN plafond côté serveur : la compression client ci-dessous (800 px max)
// est la SEULE limite active. Ne pas la contourner.
import { CLOUDINARY } from "./cloudinary-config.js";
import { avecDelai } from "./db.js";

// Compresse un fichier image : redimensionne (côté max) puis exporte en JPEG.
// Plus AUCUNE miniature générée côté client (avenant §3.1) : les miniatures
// sont des transformations d'URL (voir urlMiniature ci-dessous).
export function compresserImage(fichier, coteMax, qualite) {
  return new Promise((resoudre, rejeter) => {
    if (!fichier || !fichier.type.startsWith("image/")) {
      rejeter(new Error("Ce fichier n'est pas une image."));
      return;
    }
    const url = URL.createObjectURL(fichier);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = Math.min(1, coteMax / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resoudre(blob) : rejeter(new Error("Compression impossible."))),
        "image/jpeg",
        qualite
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      rejeter(new Error("Image illisible."));
    };
    image.src = url;
  });
}

// Raccourcis métier (avenant §3.1)
export const compresserPhoto = (f) => compresserImage(f, 800, 0.72); // produit / couverture
export const compresserLogo = (f) => compresserImage(f, 200, 0.72);

// Upload non signé vers Cloudinary (avenant §3.2). Retourne secure_url —
// c'est la valeur stockée dans photos[], logoUrl et couvertureUrl.
// Jamais d'attente infinie : 30 s max, puis erreur française propre.
export async function uploaderImage(blob) {
  const donnees = new FormData();
  donnees.append("file", blob);
  donnees.append("upload_preset", CLOUDINARY.uploadPreset);

  let reponse;
  try {
    reponse = await avecDelai(
      fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/image/upload`, {
        method: "POST",
        body: donnees,
      }),
      30000
    );
  } catch (erreur) {
    if (erreur?.code === "delai-depasse") throw erreur;
    throw erreurUpload();
  }
  if (!reponse.ok) throw erreurUpload();
  const json = await reponse.json();
  if (!json.secure_url) throw erreurUpload();
  return json.secure_url;
}

function erreurUpload() {
  const erreur = new Error("L'envoi de l'image a échoué. Vérifiez votre connexion et réessayez.");
  erreur.code = "upload-echec";
  return erreur;
}

// Insère une transformation juste après "/upload/" dans une URL Cloudinary
// (avenant §3.3). q_auto,f_auto sert WebP/AVIF aux navigateurs compatibles.
export function urlTransformee(url, transfo) {
  return url.replace("/upload/", `/upload/${transfo}/`);
}

// Miniature des grilles/listes (carrée, cohérente avec les cartes 1:1 du §9.3)
export const urlMiniature = (url) => urlTransformee(url, "w_200,h_200,c_fill,q_auto,f_auto");
// Affichage fiche produit (M3)
export const urlFiche = (url) => urlTransformee(url, "w_800,q_auto,f_auto");
