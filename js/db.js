// Couche d'accès aux données centralisée.
// ÉTAT TRANSITOIRE (avenant n°2, migration jalon par jalon) : Supabase
// remplace Firestore fonction par fonction. Au jalon S1, seule
// boutiqueDeProprietaire est migrée (le routage post-connexion et les gardes
// en dépendent) ; le reste demeure Firestore jusqu'aux jalons S2–S5, puis
// le SDK Firebase sera retiré (§9 de l'avenant).
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
import { supabase } from "./supabase-config.js";

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

// Décrit une erreur pour l'utilisateur en distinguant la cause RÉELLE :
// délai réseau ≠ refus de permission ≠ erreur inconnue. Un libellé trompeur
// (« Connexion instable » pour un permission-denied) coûte cher à
// diagnostiquer en conditions réelles — toujours passer par ce helper
// dans les écrans d'erreur génériques.
export function decrireErreur(erreur) {
  // Hors ligne : navigator.onLine, ou code Firestore "unavailable" (les
  // données ne sont pas cachées — persistance offline volontairement NON
  // activée en Phase 1). Testé en premier : prioritaire sur le délai.
  if (navigator.onLine === false || erreur?.code === "unavailable") {
    return { picto: "📡", titre: "Vous êtes hors ligne.", detail: "Reconnectez-vous pour voir cette page." };
  }
  if (erreur?.code === "delai-depasse") {
    return { picto: "📶", titre: "Connexion instable, réessayez.", detail: "" };
  }
  // "permission-denied" = règles Firestore ; "42501" = politique RLS
  // PostgreSQL (avenant n°2 §6) — même sens, deux backends.
  if (erreur?.code === "permission-denied" || erreur?.code === "42501") {
    return {
      picto: "🔒",
      titre: "Accès refusé par le serveur.",
      detail: "Ce n'est pas un problème réseau : règles de sécurité (RLS/Firestore) ou droits du compte.",
    };
  }
  return {
    picto: "⚠️",
    titre: "Une erreur est survenue. Réessayez.",
    detail: erreur?.code ? `Code technique : ${erreur.code}` : (erreur?.message || ""),
  };
}

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

// Convertit la réponse supabase-js ({ data, error }) en valeur ou exception —
// à réutiliser pour toutes les fonctions migrées (S1+).
function donneesOuErreur({ data, error }) {
  if (error) throw error;
  return data;
}

// [SUPABASE — S1] Boutique du commerçant connecté ({...ligne} ou null).
// userId = user.id (UUID Supabase). L'unicité une-boutique-par-compte est
// garantie au niveau BDD (idx_boutiques_owner_unique) ; maybeSingle() la
// reflète. Colonnes en snake_case (owner_id, nom_lower, logo_url…).
export async function boutiqueDeProprietaire(userId) {
  return donneesOuErreur(await avecDelai(
    supabase.from("boutiques").select("*").eq("owner_id", userId).maybeSingle()
  ));
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

// [SUPABASE — S2] Création atomique boutique + fiche privée via la RPC
// transactionnelle creer_boutique (supabase/fonctions-s2.sql) : les deux
// insertions réussissent ou échouent ENSEMBLE — remplace les deux écritures
// séquentielles de la Phase 1 (§7.3) et la fonction de réparation.
// SECURITY INVOKER : les politiques RLS s'appliquent (owner_id = auth.uid(),
// statut "en_attente" / badge false / compteurs 0 par défauts de colonnes).
// Doublon → erreur 23505 (index unique une-boutique-par-compte).
export async function creerBoutique(user, donnees) {
  return donneesOuErreur(await avecDelai(supabase.rpc("creer_boutique", {
    p_nom: donnees.nom,
    p_nom_lower: normaliser(donnees.nom),
    p_slug: genererSlug(donnees.nom),
    p_description: donnees.description,
    p_categorie: donnees.categorie,
    p_quartier: donnees.quartier,
    p_repere: donnees.repere,
    p_geo_lat: donnees.geo?.lat ?? null,
    p_geo_lng: donnees.geo?.lng ?? null,
    p_whatsapp: donnees.whatsapp, // "253XXXXXXXX"
    p_horaires: donnees.horaires, // jsonb (2 plages/jour possibles) ou null
    p_logo_url: donnees.logoUrl,
    p_couverture_url: donnees.couvertureUrl,
    p_email: user.email ?? null,
  })));
}

// [SUPABASE — S2] Mise à jour de la boutique par son propriétaire.
// Champs applicatifs (camelCase, geo objet) → colonnes snake_case.
// statut / badge_verifie / compteurs ne sont jamais passés (le RLS les
// verrouille de toute façon). Le slug n'est pas régénéré au renommage :
// les liens déjà partagés restent valides.
export async function majBoutique(boutiqueId, champs) {
  const maj = { maj_le: new Date().toISOString() };
  if (champs.nom !== undefined) {
    maj.nom = champs.nom;
    maj.nom_lower = normaliser(champs.nom);
  }
  if (champs.description !== undefined) maj.description = champs.description;
  if (champs.categorie !== undefined) maj.categorie = champs.categorie;
  if (champs.quartier !== undefined) maj.quartier = champs.quartier;
  if (champs.repere !== undefined) maj.repere = champs.repere;
  if ("geo" in champs) {
    maj.geo_lat = champs.geo?.lat ?? null;
    maj.geo_lng = champs.geo?.lng ?? null;
  }
  if (champs.whatsapp !== undefined) maj.whatsapp = champs.whatsapp;
  if ("horaires" in champs) maj.horaires = champs.horaires;
  if (champs.logoUrl !== undefined) maj.logo_url = champs.logoUrl;
  if (champs.couvertureUrl !== undefined) maj.couverture_url = champs.couvertureUrl;
  donneesOuErreur(await avecDelai(
    supabase.from("boutiques").update(maj).eq("id", boutiqueId)
  ));
}

// ---- Produits ----

// [SUPABASE — S2] Produits du commerçant pour SON tableau de bord.
// Le filtre owner_id reste EXPLICITE (leçon « rules are not filters » du
// correctif M4) même si la politique RLS proprio suffirait ici.
export async function produitsDeBoutique(userId, boutiqueId) {
  const liste = donneesOuErreur(await avecDelai(
    supabase.from("produits").select("*")
      .eq("owner_id", userId)
      .eq("boutique_id", boutiqueId)
      .order("cree_le", { ascending: false })
  ));
  return liste || [];
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

// ---- Administration (jalon M4) ----
// Les règles §7.1 donnent à l'admin (UID présent dans `admins`) une lecture
// complète des collections : les requêtes ci-dessous sont sans filtre.

export async function estAdmin(uid) {
  const instantane = await avecDelai(getDoc(doc(db, "admins", uid)));
  return instantane.exists();
}

export async function toutesBoutiquesAdmin() {
  const resultat = await avecDelai(getDocs(collection(db, "boutiques")));
  const liste = resultat.docs.map((d) => ({ id: d.id, ...d.data() }));
  liste.sort((a, b) => (b.creeLe?.seconds || 0) - (a.creeLe?.seconds || 0));
  return liste;
}

export async function tousProduitsAdmin() {
  const resultat = await avecDelai(getDocs(collection(db, "produits")));
  return resultat.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Mise à jour admin : statut, badgeVerifie… (tout sauf ownerUid, règle §7.1).
export async function majBoutiqueAdmin(boutiqueId, champs) {
  await avecDelai(updateDoc(doc(db, "boutiques", boutiqueId), {
    ...champs,
    majLe: serverTimestamp(),
  }));
}

// Motif de refus / remarques — stocké dans boutiques_prive.notesAdmin (§4.3).
// [FIRESTORE — sera migré au jalon S5 ; la création S2 étant transactionnelle,
// le document privé ne peut plus manquer.]
export async function definirNotesAdmin(boutiqueId, notes) {
  await avecDelai(setDoc(doc(db, "boutiques_prive", boutiqueId), { notesAdmin: notes }, { merge: true }));
}

// Modération : masquer / rendre visible un produit (admin uniquement).
export async function definirVisibiliteProduit(produitId, visible) {
  await avecDelai(updateDoc(doc(db, "produits", produitId), {
    visible,
    majLe: serverTimestamp(),
  }));
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
