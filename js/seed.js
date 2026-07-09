// Jeu d'essai SUUQ (§14 du cahier des charges) — DÉVELOPPEMENT UNIQUEMENT.
// Jamais importé par une page. Exécution manuelle, connecté avec un compte
// admin, depuis la console navigateur sur admin.html :
//
//   const seed = await import("./js/seed.js");
//   await seed.executer();
//
// Crée 3 boutiques (2 actives dont 1 vérifiée, 1 en attente) et 12 produits
// avec photos placeholder locales et numéros WhatsApp factices 2537700xxxx.
// Les documents appartiennent au compte admin exécutant (les règles §7.1
// exigent ownerUid == créateur) — suffisant pour un jeu d'essai.
import { auth } from "./auth.js";
import { estAdmin, creerBoutique, creerProduit, majBoutiqueAdmin } from "./db.js";

const PLACEHOLDER = "assets/placeholder-produit.svg";

const BOUTIQUES = [
  {
    apres: { statut: "active", badgeVerifie: true },
    donnees: {
      nom: "Électro Horizon", description: "Téléphones, accessoires et petit électroménager.",
      categorie: "Téléphones & Électronique", quartier: "Einguela",
      repere: "En face de la pharmacie d'Einguela", geo: null,
      whatsapp: "25377001122", logoUrl: null, couvertureUrl: null,
      horaires: {
        sam: { ouvert: true, de: "08:00", a: "13:00", de2: "16:00", a2: "20:00" },
        dim: { ouvert: true, de: "08:00", a: "13:00", de2: "16:00", a2: "20:00" },
        lun: { ouvert: true, de: "08:00", a: "13:00", de2: "16:00", a2: "20:00" },
        mar: { ouvert: true, de: "08:00", a: "13:00", de2: "16:00", a2: "20:00" },
        mer: { ouvert: true, de: "08:00", a: "13:00", de2: "16:00", a2: "20:00" },
        jeu: { ouvert: true, de: "08:00", a: "13:00", de2: "16:00", a2: "20:00" },
        ven: { ouvert: true, de: "16:00", a: "20:00", de2: null, a2: null },
      },
    },
    produits: [
      { nom: "Samsung Galaxy S24 128 Go", prix: 145000, tags: "samsung, telephone, s24" },
      { nom: "iPhone 13 occasion très bon état", prix: 95000, tags: "iphone, apple, occasion" },
      { nom: "Tecno Spark 20", prix: 45000, tags: "tecno, telephone" },
      { nom: "Écouteurs Bluetooth TWS", prix: 3500, tags: "ecouteurs, bluetooth, audio" },
      { nom: "Chargeur rapide 33 W", prix: 2500, tags: "chargeur, cable" },
    ],
  },
  {
    apres: { statut: "active", badgeVerifie: false },
    donnees: {
      nom: "Balbala Sport", description: "Maillots, ballons et équipement sportif.",
      categorie: "Sport", quartier: "Balbala",
      repere: "À côté du terrain de football, avenue 26", geo: null,
      whatsapp: "25377003344", logoUrl: null, couvertureUrl: null, horaires: null,
    },
    produits: [
      { nom: "Maillot équipe nationale 2026", prix: 5500, tags: "maillot, football, djibouti" },
      { nom: "Ballon de football taille 5", prix: 4000, tags: "ballon, football" },
      { nom: "Chaussures de course 43", prix: 6000, tags: "chaussures, course, 43" },
      { nom: "Maillot Real Madrid", prix: 2500, tags: "maillot, real, football" },
    ],
  },
  {
    apres: null, // reste en_attente (file de validation)
    donnees: {
      nom: "Beauté du Quartier 4", description: "Cosmétiques, parfums et soins.",
      categorie: "Beauté & Cosmétiques", quartier: "Quartier 4",
      repere: "Près de la mosquée Al-Rahma", geo: null,
      whatsapp: "25377005566", logoUrl: null, couvertureUrl: null, horaires: null,
    },
    produits: [
      { nom: "Parfum oud 50 ml", prix: 8000, tags: "parfum, oud" },
      { nom: "Crème hydratante karité", prix: 2800, tags: "creme, soin, karite" },
      { nom: "Henné naturel 100 g", prix: 1500, tags: "henne, naturel" },
    ],
  },
];

export async function executer() {
  const user = auth.currentUser;
  if (!user) throw new Error("Connectez-vous d'abord avec un compte admin.");
  if (!(await estAdmin(user.uid))) throw new Error("Réservé à un compte admin.");

  for (const modele of BOUTIQUES) {
    const boutiqueId = await creerBoutique(user, modele.donnees);
    console.log(`Boutique créée : ${modele.donnees.nom} (${boutiqueId})`);

    if (modele.apres) {
      await majBoutiqueAdmin(boutiqueId, modele.apres);
      console.log(`  → statut ${modele.apres.statut}${modele.apres.badgeVerifie ? " + badge vérifié" : ""}`);
    }

    for (const p of modele.produits) {
      await creerProduit(user, boutiqueId, {
        nom: p.nom,
        description: "",
        prix: p.prix,
        categorie: modele.donnees.categorie,
        tags: p.tags.split(",").map((t) => t.trim()),
        photos: [PLACEHOLDER],
        thumbUrl: PLACEHOLDER,
        disponible: true,
      });
      console.log(`  Produit : ${p.nom}`);
    }
  }
  console.log("Jeu d'essai créé. Rechargez l'accueil (le cache index expire sous 15 min,");
  console.log("ou exécutez : localStorage.removeItem('suuq_index')).");
}
