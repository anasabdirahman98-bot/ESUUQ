// Compression d'images côté client (canvas → JPEG) + upload Storage (§8.3).
// Poids final attendu : 40–120 Ko par photo. Les fichiers non-image sont refusés.
import {
  getStorage,
  ref as refStorage,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { app, avecDelai } from "./db.js";

const storage = getStorage(app);

// Compresse un fichier image : redimensionne (côté max) puis exporte en JPEG.
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

// Upload dans uploads/{uid}/{fichier} (règles Storage §7.2) → URL publique.
// Mêmes garde-fous que Firestore : jamais d'attente infinie (délai élargi
// à 30 s pour l'upload lui-même, ~100 Ko sur 3G lente).
export async function uploaderImage(blob, uid, nomFichier) {
  const emplacement = refStorage(storage, `uploads/${uid}/${nomFichier}`);
  await avecDelai(uploadBytes(emplacement, blob, { contentType: "image/jpeg" }), 30000);
  return avecDelai(getDownloadURL(emplacement));
}

// Raccourcis métier (§8.3)
export const compresserPhoto = (f) => compresserImage(f, 800, 0.72); // produit / couverture
export const compresserMiniature = (f) => compresserImage(f, 200, 0.6); // thumbUrl (M2)
export const compresserLogo = (f) => compresserImage(f, 200, 0.72);
