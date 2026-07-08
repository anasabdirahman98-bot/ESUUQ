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
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  increment,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { normaliser } from "./constantes.js";

export const app = initializeApp(firebaseConfig);

// Base Firestore NOMMÉE "default" (≠ "(default)") — ne jamais retirer ce
// 3e argument, sinon toutes les opérations pendent en NOT_FOUND : le SDK
// viserait la base par défaut "(default)", qui n'existe pas dans ce projet
// (l'API REST répond 404), et resterait en retry silencieux jusqu'au timeout.
//
// Le long-polling forcé est conservé par simple précaution : le diagnostic
// initial « réseau national bloque WebChannel » a été infirmé (REST
// instantané) — la cause réelle des blocages était l'ID de base ci-dessus.
export const db = initializeFirestore(app, { experimentalForceLongPolling: true }, "default");

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

// Mise à jour de la boutique par son propriétaire. Ne JAMAIS passer statut,
// badgeVerifie, stats ni ownerUid (refusés par les règles §7.1). Le slug
// n'est pas régénéré au renommage : les liens déjà partagés restent valides.
export async function majBoutique(boutiqueId, champs) {
  const maj = { ...champs, majLe: serverTimestamp() };
  if (maj.nom !== undefined) maj.nomLower = normaliser(maj.nom);
  await avecDelai(updateDoc(doc(db, "boutiques", boutiqueId), maj));
}

// ---- Produits (jalon M2) ----

// Produits d'une boutique, plus récents d'abord. Tri côté client pour
// éviter un index composite (un commerçant a peu de produits).
export async function produitsDeBoutique(boutiqueId) {
  const resultat = await avecDelai(
    getDocs(query(collection(db, "produits"), where("boutiqueId", "==", boutiqueId)))
  );
  const liste = resultat.docs.map((d) => ({ id: d.id, ...d.data() }));
  liste.sort((a, b) => (b.creeLe?.seconds || 0) - (a.creeLe?.seconds || 0));
  return liste;
}

export async function produitParId(produitId) {
  const instantane = await avecDelai(getDoc(doc(db, "produits", produitId)));
  return instantane.exists() ? { id: instantane.id, ...instantane.data() } : null;
}

// Création d'un produit — visible: true et stats à zéro imposés par les
// règles §7.1 (1 à 3 photos exigées).
export async function creerProduit(user, boutiqueId, donnees) {
  const ref = doc(collection(db, "produits"));
  await avecDelai(setDoc(ref, {
    boutiqueId,
    ownerUid: user.uid,
    nom: donnees.nom,
    nomLower: normaliser(donnees.nom),
    description: donnees.description,
    prix: donnees.prix, // entier FDJ > 0
    categorie: donnees.categorie,
    tags: donnees.tags, // max 5, normalisés
    photos: donnees.photos, // 1 à 3 URLs Cloudinary (secure_url)
    thumbUrl: donnees.thumbUrl, // transformation w_200 de la 1re photo
    disponible: donnees.disponible,
    visible: true,
    stats: { vues: 0, clicsWhatsapp: 0 },
    creeLe: serverTimestamp(),
    majLe: serverTimestamp(),
  }));
  return ref.id;
}

// Mise à jour d'un produit par son propriétaire. Ne JAMAIS passer visible,
// stats, ownerUid ni boutiqueId (refusés par les règles §7.1).
export async function majProduit(produitId, champs) {
  const maj = { ...champs, majLe: serverTimestamp() };
  if (maj.nom !== undefined) maj.nomLower = normaliser(maj.nom);
  await avecDelai(updateDoc(doc(db, "produits", produitId), maj));
}

export async function supprimerProduit(produitId) {
  await avecDelai(deleteDoc(doc(db, "produits", produitId)));
}

// ---- Lectures publiques (jalon M3) ----
// Les règles §7.1 n'autorisent que les documents actifs/visibles en lecture
// publique : chaque requête doit inclure ces filtres, sinon elle est rejetée.

export async function boutiqueParId(boutiqueId) {
  const instantane = await avecDelai(getDoc(doc(db, "boutiques", boutiqueId)));
  return instantane.exists() ? { id: instantane.id, ...instantane.data() } : null;
}

export async function boutiqueParSlug(slug) {
  const resultat = await avecDelai(getDocs(query(
    collection(db, "boutiques"),
    where("slug", "==", slug),
    where("statut", "==", "active"),
    limit(1)
  )));
  if (resultat.empty) return null;
  const premier = resultat.docs[0];
  return { id: premier.id, ...premier.data() };
}

// Catalogue public d'une boutique : disponibles d'abord, puis plus récents.
export async function produitsPublicsDeBoutique(boutiqueId) {
  const resultat = await avecDelai(getDocs(query(
    collection(db, "produits"),
    where("boutiqueId", "==", boutiqueId),
    where("visible", "==", true)
  )));
  const liste = resultat.docs.map((d) => ({ id: d.id, ...d.data() }));
  liste.sort((a, b) =>
    (b.disponible - a.disponible) || ((b.creeLe?.seconds || 0) - (a.creeLe?.seconds || 0)));
  return liste;
}

// ---- Index catalogue (§6) — consommé par js/recherche.js ----
// NB : la requête produits exige un index composite Firestore
// (visible ASC + creeLe DESC) — voir README, Mise en route.

export async function indexProduits() {
  const resultat = await avecDelai(getDocs(query(
    collection(db, "produits"),
    where("visible", "==", true),
    orderBy("creeLe", "desc"),
    limit(600)
  )));
  // On ne garde que les champs utiles aux listes (§6) pour un cache léger.
  return resultat.docs.map((d) => {
    const p = d.data();
    return {
      id: d.id, nom: p.nom, nomLower: p.nomLower, tags: p.tags || [],
      prix: p.prix, categorie: p.categorie, thumbUrl: p.thumbUrl,
      disponible: p.disponible, boutiqueId: p.boutiqueId,
    };
  });
}

export async function indexBoutiques() {
  const resultat = await avecDelai(getDocs(query(
    collection(db, "boutiques"),
    where("statut", "==", "active")
  )));
  // logoUrl ajouté au sous-ensemble §6 : l'accueil affiche le logo des
  // boutiques vérifiées (§4.1) — quelques octets par boutique.
  return resultat.docs.map((d) => {
    const b = d.data();
    return {
      id: d.id, nom: b.nom, slug: b.slug, quartier: b.quartier,
      badgeVerifie: b.badgeVerifie, nomLower: b.nomLower, logoUrl: b.logoUrl,
    };
  });
}

// ---- Compteurs publics ----
// increment(1) et RIEN d'autre dans la mise à jour : la règle §7.1 n'accepte
// que le champ stats (incréments de 0 ou +1) pour les visiteurs. Ne jamais
// ajouter majLe ici. Best effort : les échecs sont ignorés par les appelants.
export function incrementerStat(nomCollection, id, champ) {
  return avecDelai(updateDoc(doc(db, nomCollection, id), {
    [`stats.${champ}`]: increment(1),
  }));
}
