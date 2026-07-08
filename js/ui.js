// Rendus d'interface réutilisables : chips, squelettes, toasts,
// cartes produit/boutique, favoris (localStorage).
import { formatPrix } from "./constantes.js";

// Toast furtif en bas d'écran (confirmations, erreurs légères).
let minuteurToast = null;
export function afficherToast(texte) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }
  toast.textContent = texte;
  toast.classList.add("visible");
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => toast.classList.remove("visible"), 2600);
}

// Crée une chip de catégorie (bouton pilule).
export function creerChip(libelle) {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "chip";
  bouton.textContent = libelle;
  return bouton;
}

// Squelette de carte produit (grille 2 colonnes).
export function creerSqueletteProduit() {
  const carte = document.createElement("div");
  carte.className = "carte-produit";
  carte.setAttribute("aria-hidden", "true");
  carte.innerHTML = `
    <div class="photo squelette-bloc" style="border-radius:0"></div>
    <div class="infos">
      <div class="squelette-bloc" style="height:14px;width:90%"></div>
      <div class="squelette-bloc" style="height:14px;width:55%"></div>
      <div class="squelette-bloc" style="height:12px;width:70%"></div>
    </div>`;
  return carte;
}

// Squelette de carte boutique (rangée horizontale).
export function creerSqueletteBoutique() {
  const carte = document.createElement("div");
  carte.className = "carte-boutique";
  carte.setAttribute("aria-hidden", "true");
  carte.innerHTML = `
    <div class="squelette-bloc" style="width:48px;height:48px;border-radius:12px"></div>
    <div class="squelette-bloc" style="height:14px;width:100%"></div>
    <div class="squelette-bloc" style="height:12px;width:60%"></div>`;
  return carte;
}

// Carte produit publique (§9.3) : photo 1:1, nom 2 lignes, prix, ligne
// boutique avec ✓ vert si vérifiée, grisée + pastille si rupture.
// `boutique` peut être null (contexte fiche boutique : ligne omise).
export function carteProduit(produit, boutique) {
  const carte = document.createElement("a");
  carte.className = "carte-produit" + (produit.disponible ? "" : " indisponible");
  carte.href = "produit.html?id=" + produit.id;
  carte.innerHTML = `
    <img class="photo" loading="lazy">
    <div class="infos">
      <div class="nom"></div>
      <div class="prix"></div>
    </div>`;
  const photo = carte.querySelector(".photo");
  photo.src = produit.thumbUrl || "assets/placeholder-produit.svg";
  photo.alt = produit.nom;
  carte.querySelector(".nom").textContent = produit.nom;
  carte.querySelector(".prix").textContent = formatPrix(produit.prix);

  const infos = carte.querySelector(".infos");
  if (!produit.disponible) {
    const pastille = document.createElement("span");
    pastille.className = "pastille-rupture";
    pastille.textContent = "Rupture";
    infos.append(pastille);
  }
  if (boutique) {
    const ligne = document.createElement("div");
    ligne.className = "boutique-ligne";
    if (boutique.badgeVerifie) {
      const coche = document.createElement("span");
      coche.className = "coche";
      coche.textContent = "✓";
      ligne.append(coche);
    }
    ligne.append(document.createTextNode(`${boutique.nom} · ${boutique.quartier}`));
    infos.append(ligne);
  }
  return carte;
}

// Carte boutique (rangée "Boutiques vérifiées" de l'accueil).
export function carteBoutique(boutique) {
  const carte = document.createElement("a");
  carte.className = "carte-boutique";
  carte.href = "boutique.html?s=" + encodeURIComponent(boutique.slug);
  if (boutique.logoUrl) {
    const logo = document.createElement("img");
    logo.className = "logo-boutique";
    logo.loading = "lazy";
    logo.alt = "";
    logo.src = boutique.logoUrl;
    carte.append(logo);
  } else {
    const lettre = document.createElement("div");
    lettre.className = "logo-boutique logo-lettre";
    lettre.textContent = (boutique.nom || "?").charAt(0).toUpperCase();
    carte.append(lettre);
  }
  const nom = document.createElement("div");
  nom.className = "nom";
  nom.textContent = boutique.nom;
  if (boutique.badgeVerifie) {
    const badge = document.createElement("span");
    badge.className = "badge-verifie";
    badge.textContent = "✓ Vérifié";
    nom.append(" ", badge);
  }
  const quartier = document.createElement("div");
  quartier.className = "quartier";
  quartier.textContent = boutique.quartier;
  carte.append(nom, quartier);
  return carte;
}

// ---- Favoris (localStorage, clé suuq_favoris : tableau d'IDs produit) ----
const CLE_FAVORIS = "suuq_favoris";

export function lireFavoris() {
  try {
    const liste = JSON.parse(localStorage.getItem(CLE_FAVORIS));
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

export function ecrireFavoris(ids) {
  try { localStorage.setItem(CLE_FAVORIS, JSON.stringify(ids)); } catch { /* plein */ }
}

export function estFavori(id) {
  return lireFavoris().includes(id);
}

// Ajoute ou retire un produit des favoris ; retourne le nouvel état.
export function basculerFavori(id) {
  const favoris = lireFavoris();
  const position = favoris.indexOf(id);
  if (position >= 0) favoris.splice(position, 1);
  else favoris.push(id);
  ecrireFavoris(favoris);
  return position < 0;
}
