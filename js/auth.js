// Authentification Supabase (email + mot de passe) et garde des pages
// protégées — avenant n°2 §7, jalon S1. Remplace Firebase Auth.
// La confirmation d'email est désactivée côté Dashboard (onboarding assisté) :
// l'inscription ouvre une session immédiatement.
import { supabase } from "./supabase-config.js";

// Marque les erreurs d'auth pour que les pages choisissent la bonne
// traduction (traduireErreur ici, decrireErreur de db.js pour le reste).
function lancer(error) {
  error.estAuth = true;
  throw error;
}

export async function inscrire(email, mdp) {
  const { data, error } = await supabase.auth.signUp({ email, password: mdp });
  if (error) lancer(error);
  return data.user;
}

export async function connecter(email, mdp) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: mdp });
  if (error) lancer(error);
  return data.user;
}

export async function reinitialiserMdp(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // retour sur la page de connexion du site (fonctionne en local et déployé)
    redirectTo: new URL("connexion.html", location.href).href,
  });
  if (error) lancer(error);
}

export async function deconnecter() {
  const { error } = await supabase.auth.signOut();
  if (error) lancer(error);
}

// Résout l'utilisateur courant (ou null). getSession lit la session locale
// persistée — pas d'aller-retour réseau, fonctionne hors ligne.
// NB : l'identifiant est user.id (UUID Supabase), plus user.uid.
export async function utilisateurCourant() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

// Garde de page : redirige vers la connexion si non connecté.
export async function exigerConnexion(versConnexion = "../connexion.html") {
  const user = await utilisateurCourant();
  if (!user) {
    location.replace(versConnexion);
    return null;
  }
  return user;
}

// Traduit les erreurs Supabase Auth en français clair. Les codes d'erreur
// (error.code) sont la voie normale ; repli sur le texte anglais pour les
// versions du SDK qui ne les exposent pas.
export function traduireErreur(erreur) {
  const MESSAGES = {
    invalid_credentials: "Email ou mot de passe incorrect.",
    user_already_exists: "Email déjà utilisé.",
    email_exists: "Email déjà utilisé.",
    weak_password: "Mot de passe trop court (6 caractères minimum).",
    validation_failed: "Adresse email invalide.",
    email_address_invalid: "Adresse email invalide.",
    over_request_rate_limit: "Trop de tentatives. Réessayez dans quelques minutes.",
    over_email_send_rate_limit: "Trop d'emails envoyés. Réessayez dans quelques minutes.",
    email_not_confirmed: "Email non confirmé — contactez l'équipe SUUQ.",
    same_password: "Le nouveau mot de passe doit être différent de l'ancien.",
    user_not_found: "Aucun compte avec cet email.",
  };
  if (MESSAGES[erreur?.code]) return MESSAGES[erreur.code];

  const texte = erreur?.message || "";
  if (/invalid login credentials/i.test(texte)) return "Email ou mot de passe incorrect.";
  if (/already registered|already exists/i.test(texte)) return "Email déjà utilisé.";
  if (/password should be at least/i.test(texte)) return "Mot de passe trop court (6 caractères minimum).";
  if (/is invalid|invalid format/i.test(texte)) return "Adresse email invalide.";
  if (/rate limit/i.test(texte)) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (navigator.onLine === false || /failed to fetch|networkerror/i.test(texte)) {
    return "Problème de connexion internet. Réessayez.";
  }
  return "Une erreur est survenue. Réessayez.";
}
