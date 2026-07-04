// Rendus d'interface réutilisables : chips, squelettes, toasts.
// Les rendus de cartes réelles (produit, boutique) arrivent au jalon M3.

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
