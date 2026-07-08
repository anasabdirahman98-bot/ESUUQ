// Recherche : index catalogue léger filtré côté client (§6 du cahier).
//
// LIMITE ASSUMÉE : cette approche (téléchargement des produits visibles,
// limite 600, filtrage en mémoire) est valide jusqu'à ~1 500 – 2 000 produits.
// Au-delà (Phase 2), migrer vers un index précalculé par catégorie ou un
// service de recherche (Typesense / Algolia).
import { indexProduits, indexBoutiques } from "./db.js";
import { normaliser } from "./constantes.js";

const CLE_CACHE = "suuq_index";
const TTL_MS = 15 * 60 * 1000; // 15 minutes (§6)

// Charge l'index catalogue : produits visibles (600 max, champs réduits) +
// boutiques actives, avec cache localStorage pour ne pas re-télécharger à
// chaque navigation (data chère).
export async function chargerIndex() {
  try {
    const cache = JSON.parse(localStorage.getItem(CLE_CACHE));
    if (cache && Date.now() - cache.quand < TTL_MS && cache.produits && cache.boutiques) {
      return cache;
    }
  } catch { /* cache corrompu : on re-télécharge */ }

  const [produits, boutiques] = await Promise.all([indexProduits(), indexBoutiques()]);
  const index = { quand: Date.now(), produits, boutiques };
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify(index));
  } catch { /* stockage plein : tant pis, pas de cache */ }
  return index;
}

// Recherche + filtres + tri, tout en mémoire.
// criteres : { texte, categorie, quartier, prixMin, prixMax, tri }
// Retourne [{ produit, boutique }] — les produits dont la boutique n'est pas
// active (absente de l'index boutiques) sont exclus (§6).
export function rechercher(index, criteres = {}) {
  const boutiquesParId = new Map(index.boutiques.map((b) => [b.id, b]));
  const texte = normaliser(criteres.texte || "").trim();

  const resultats = [];
  for (const produit of index.produits) {
    const boutique = boutiquesParId.get(produit.boutiqueId);
    if (!boutique) continue; // boutique non active → introuvable publiquement

    if (texte
      && !produit.nomLower.includes(texte)
      && !produit.tags.some((tag) => tag.includes(texte))) continue;
    if (criteres.categorie && produit.categorie !== criteres.categorie) continue;
    if (criteres.quartier && boutique.quartier !== criteres.quartier) continue;
    if (criteres.prixMin != null && produit.prix < criteres.prixMin) continue;
    if (criteres.prixMax != null && produit.prix > criteres.prixMax) continue;

    resultats.push({ produit, boutique });
  }

  if (criteres.tri === "prix-croissant") {
    resultats.sort((a, b) => a.produit.prix - b.produit.prix);
  } else if (criteres.tri === "prix-decroissant") {
    resultats.sort((a, b) => b.produit.prix - a.produit.prix);
  }
  // tri par défaut : ordre de l'index = plus récents d'abord

  return resultats;
}
