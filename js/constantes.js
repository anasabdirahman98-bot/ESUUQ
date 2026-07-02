// Constantes partagées SUUQ + utilitaires de formatage.
// Voir cahier des charges §5.4, §5.5 et §5.6.

export const CATEGORIES = [
  "Téléphones & Électronique",
  "Mode & Vêtements",
  "Sport",
  "Beauté & Cosmétiques",
  "Maison & Déco",
  "Alimentation",
  "Auto & Moto",
  "Bébé & Enfants",
  "Services",
  "Autre",
];

// Liste des quartiers de Djibouti-ville — modifiable facilement.
export const QUARTIERS = [
  "Balbala",
  "Quartier 1",
  "Quartier 2",
  "Quartier 3",
  "Quartier 4",
  "Quartier 5",
  "Quartier 6",
  "Quartier 7",
  "Quartier 7 bis",
  "Einguela",
  "Hayabley",
  "PK12",
  "Arhiba",
  "Ambouli",
  "Gabode",
  "Héron",
  "Plateau du Serpent",
  "Marabout",
  "Salines",
  "Djebel",
  "Autre / Hors Djibouti-ville",
];

// Fonction unique de normalisation, utilisée partout (écriture ET lecture) :
// minuscules + suppression des accents.
export function normaliser(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Formate un prix entier en FDJ : 12500 -> "12 500 FDJ".
export function formatPrix(prix) {
  return new Intl.NumberFormat("fr-FR").format(prix) + " FDJ";
}
