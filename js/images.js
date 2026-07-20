// Compression d'images côté client (canvas → JPEG) + Supabase Storage.
// Avenant n°2 §5 (jalon S3) : remplace Cloudinary. TOUT le code d'images est
// confiné ici — aucun autre module ne connaît Storage (portabilité §10).
// Chemins : {owner_id}/{boutique_id}/{type}-{horodatage}.jpg — le préfixe
// owner_id est imposé par les politiques Storage (supabase/storage.sql).
import { supabase } from "./supabase-config.js";
import { avecDelai } from "./db.js";

const BUCKET = "boutiques";

// Compresse une image (File ou Blob) : redimensionne (côté max) → JPEG.
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

// Miniature 200 px CARRÉE (recadrage centré), qualité 0.6 — générée côté
// client et uploadée séparément (avenant §5.3 : plus de transformation
// d'URL, retour assumé au modèle « 2 uploads » de la Phase 1 d'origine).
export function compresserMiniatureCarree(source) {
  return new Promise((resoudre, rejeter) => {
    if (!source || !source.type.startsWith("image/")) {
      rejeter(new Error("Ce fichier n'est pas une image."));
      return;
    }
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const cote = Math.min(image.width, image.height);
      const sx = (image.width - cote) / 2;
      const sy = (image.height - cote) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 200;
      canvas.getContext("2d").drawImage(image, sx, sy, cote, cote, 0, 0, 200, 200);
      canvas.toBlob(
        (blob) => (blob ? resoudre(blob) : rejeter(new Error("Compression impossible."))),
        "image/jpeg",
        0.6
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      rejeter(new Error("Image illisible."));
    };
    image.src = url;
  });
}

// Raccourcis métier (avenant §5.3)
export const compresserPhoto = (f) => compresserImage(f, 800, 0.72); // produit / couverture
export const compresserLogo = (f) => compresserImage(f, 200, 0.72);

// Chemin unique pour un upload (suffixe aléatoire : deux photos peuvent
// partir dans la même milliseconde).
export function cheminImage(userId, boutiqueId, type) {
  return `${userId}/${boutiqueId}/${type}-${Date.now()}-${Math.floor(Math.random() * 10000)}.jpg`;
}

// Upload vers le bucket public → URL publique. Jamais d'attente infinie.
export async function uploaderImage(blob, chemin) {
  const resultat = await avecDelai(
    supabase.storage.from(BUCKET).upload(chemin, blob, { contentType: "image/jpeg" }),
    30000
  );
  if (resultat.error) throw erreurUpload(resultat.error);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(chemin);
  return data.publicUrl;
}

function erreurUpload(cause) {
  const erreur = new Error("L'envoi de l'image a échoué. Vérifiez votre connexion et réessayez.");
  erreur.code = cause?.code === "delai-depasse" ? "delai-depasse" : "upload-echec";
  return erreur;
}

// Extrait le chemin bucket d'une URL publique Supabase Storage ; null pour
// toute autre URL (ex. anciennes images Cloudinary — non supprimables d'ici,
// elles restent simplement affichées, cohabitation assumée avenant §7).
const MARQUEUR_PUBLIC = `/storage/v1/object/public/${BUCKET}/`;
export function cheminDepuisUrl(url) {
  const position = (url || "").indexOf(MARQUEUR_PUBLIC);
  if (position === -1) return null;
  return decodeURIComponent(url.slice(position + MARQUEUR_PUBLIC.length));
}

// Suppression d'images du bucket (gain de la migration : fini les orphelins
// de l'avenant n°1). Les appelants l'utilisent en best effort — un échec de
// nettoyage ne doit jamais bloquer le parcours utilisateur.
export async function supprimerImages(urls) {
  const chemins = (urls || []).map(cheminDepuisUrl).filter(Boolean);
  if (chemins.length === 0) return;
  const resultat = await avecDelai(supabase.storage.from(BUCKET).remove(chemins));
  if (resultat.error) throw resultat.error;
}

// ---- Transitoire (S3) : helpers d'affichage des ANCIENNES URLs Cloudinary.
// Sans effet sur les URLs Supabase (pas de segment "/upload/"). À retirer au
// nettoyage final (§9) avec les dernières références des pages publiques.
export function urlTransformee(url, transfo) {
  return url.replace("/upload/", `/upload/${transfo}/`);
}
export const urlMiniature = (url) => urlTransformee(url, "w_200,h_200,c_fill,q_auto,f_auto");
export const urlFiche = (url) => urlTransformee(url, "w_800,q_auto,f_auto");
