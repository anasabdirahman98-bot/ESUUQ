// Accès Firestore centralisé : initialisation Firebase + opérations boutiques.
// Les SDK Firebase (v10, modules CDN) ne sont importés que par les pages
// qui en ont besoin (§8.2 du cahier des charges) — jamais par l'accueil.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  initializeFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  query,
  where,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { normaliser } from "./constantes.js";

export const app = initializeApp(firebaseConfig);

// RÉGLAGE DE PRODUCTION — ne pas revenir à l'auto-détection.
// Le réseau de l'opérateur national bloque le streaming WebChannel de
// Firestore : sans long-polling forcé, les lectures/écritures restent
// suspendues indéfiniment sur PC comme sur mobile.
export const db = initializeFirestore(app, { experimentalForceLongPolling: true });

// Toute lecture/écriture Firestore passe par avecDelai() : au-delà du délai,
// on rejette avec code "delai-depasse" pour rendre la main à l'utilisateur —
// aucune opération ne doit tourner indéfiniment sans feedback.
const DELAI_MAX_MS = 15000;

export function avecDelai(promesse, ms = DELAI_MAX_MS) {
  return new Promise((resoudre, rejeter) => {
    const minuteur = setTimeout(() => {
      const erreur = new Error("Connexion instable, réessayez.");
      erreur.code = "delai-depasse";
      rejeter(erreur);
    }, ms);
    promesse.then(
      (valeur) => { clearTimeout(minuteur); resoudre(valeur); },
      (erreur) => { clearTimeout(minuteur); rejeter(erreur); }
    );
  });
}

// Retourne la boutique appartenant à cet utilisateur ({id, ...données}) ou null.
// C'est aussi la vérification applicative "une boutique par compte" (§7.3).
export async function boutiqueDeProprietaire(uid) {
  const resultat = await avecDelai(
    getDocs(query(collection(db, "boutiques"), where("ownerUid", "==", uid), limit(1)))
  );
  if (resultat.empty) return null;
  const premier = resultat.docs[0];
  return { id: premier.id, ...premier.data() };
}

// Slug : nom normalisé en kebab-case + 4 caractères aléatoires (unicité pratique).
export function genererSlug(nom) {
  const base =
    normaliser(nom)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "boutique";
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let alea = "";
  for (let i = 0; i < 4; i++) alea += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${base}-${alea}`;
}

// Contenu du document privé (recréé à l'identique par la réparation ci-dessous).
function documentPrive(user) {
  return { email: user.email, telPersonnel: null, notesAdmin: null };
}

// Crée la boutique (statut "en_attente") puis son document privé.
//
// IMPÉRATIF (§7.3) : deux écritures SÉQUENTIELLES (deux await distincts).
// Ne JAMAIS grouper ces créations dans un writeBatch ou une transaction :
// la règle de sécurité de boutiques_prive fait un get() sur boutiques/{id},
// et dans un batch ce get() évaluerait l'état d'AVANT le batch — la boutique
// n'existerait pas encore et l'écriture privée serait refusée.
export async function creerBoutique(user, donnees) {
  const ref = doc(collection(db, "boutiques"));

  await avecDelai(setDoc(ref, {
    ownerUid: user.uid,
    nom: donnees.nom,
    nomLower: normaliser(donnees.nom),
    slug: genererSlug(donnees.nom),
    description: donnees.description,
    categorie: donnees.categorie,
    quartier: donnees.quartier,
    repere: donnees.repere,
    geo: donnees.geo, // { lat, lng } ou null
    whatsapp: donnees.whatsapp, // "253XXXXXXXX"
    horaires: donnees.horaires, // map (2 plages/jour possibles) ou null
    logoUrl: donnees.logoUrl,
    couvertureUrl: donnees.couvertureUrl,
    statut: "en_attente",
    badgeVerifie: false,
    stats: { vues: 0, clicsWhatsapp: 0 },
    creeLe: serverTimestamp(),
    majLe: serverTimestamp(),
  }));

  await avecDelai(setDoc(doc(db, "boutiques_prive", ref.id), documentPrive(user)));

  return ref.id;
}

// Répare une création interrompue entre les deux écritures : si la boutique
// existe mais pas son document privé, on le recrée. Appelé silencieusement
// au chargement du tableau de bord.
export async function reparerDocumentPrive(user, boutiqueId) {
  const ref = doc(db, "boutiques_prive", boutiqueId);
  const instantane = await avecDelai(getDoc(ref));
  if (!instantane.exists()) {
    await avecDelai(setDoc(ref, documentPrive(user)));
  }
}
