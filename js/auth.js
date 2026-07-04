// Authentification Firebase (email + mot de passe) et garde des pages
// protégées (espace commerçant, admin à partir du jalon M4).
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { app } from "./db.js";

export const auth = getAuth(app);

export function inscrire(email, mdp) {
  return createUserWithEmailAndPassword(auth, email, mdp);
}

export function connecter(email, mdp) {
  return signInWithEmailAndPassword(auth, email, mdp);
}

export function reinitialiserMdp(email) {
  return sendPasswordResetEmail(auth, email);
}

export function deconnecter() {
  return signOut(auth);
}

// Résout l'utilisateur courant (ou null) dès que l'état d'auth est connu.
export function utilisateurCourant() {
  return new Promise((resoudre) => {
    const stop = onAuthStateChanged(auth, (user) => {
      stop();
      resoudre(user);
    });
  });
}

// Garde de page : redirige vers la connexion si non connecté.
// `versConnexion` : chemin relatif vers connexion.html depuis la page appelante.
export async function exigerConnexion(versConnexion = "../connexion.html") {
  const user = await utilisateurCourant();
  if (!user) {
    location.replace(versConnexion);
    return null;
  }
  return user;
}

// Traduit les codes d'erreur Firebase en français clair (§4.2).
export function traduireErreur(erreur) {
  const messages = {
    "auth/email-already-in-use": "Email déjà utilisé.",
    "auth/invalid-email": "Adresse email invalide.",
    "auth/weak-password": "Mot de passe trop court (6 caractères minimum).",
    "auth/missing-password": "Saisissez un mot de passe.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/user-not-found": "Aucun compte avec cet email.",
    "auth/invalid-credential": "Email ou mot de passe incorrect.",
    "auth/too-many-requests": "Trop de tentatives. Réessayez dans quelques minutes.",
    "auth/network-request-failed": "Problème de connexion internet. Réessayez.",
  };
  return messages[erreur?.code] || "Une erreur est survenue. Réessayez.";
}
