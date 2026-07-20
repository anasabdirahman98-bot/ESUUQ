// Service worker SUUQ (jalon M5) — cache hors ligne, data chère (§8.1).
// INCRÉMENTER CACHE_VERSION à chaque déploiement qui modifie HTML/CSS/JS :
// c'est ce qui invalide les anciens caches chez les utilisateurs.
const CACHE_VERSION = "suuq-v2-s3"; // (suuq-v3 réservé au jalon S5, avenant n°2)

const CACHE_SHELL = CACHE_VERSION + "-shell";
const CACHE_IMAGES = CACHE_VERSION + "-images";
const CACHE_SDK = CACHE_VERSION + "-sdk";
const MAX_IMAGES = 60; // plafond du cache d'images (purge FIFO simple)

// Précache du shell : pages, styles, scripts, icônes (jamais js/seed.js).
const SHELL = [
  "./",
  "index.html",
  "boutique.html",
  "produit.html",
  "favoris.html",
  "connexion.html",
  "hors-ligne.html",
  "admin.html",
  "espace/index.html",
  "espace/boutique.html",
  "espace/produit.html",
  "css/variables.css",
  "css/base.css",
  "css/composants.css",
  "js/firebase-config.js",
  "js/cloudinary-config.js",
  "js/supabase-config.js",
  "js/constantes.js",
  "js/db.js",
  "js/auth.js",
  "js/recherche.js",
  "js/images.js",
  "js/ui.js",
  "assets/favicon.svg",
  "assets/logo.svg",
  "assets/placeholder-produit.svg",
  "assets/icone-192.png",
  "assets/icone-512.png",
  "manifest.json",
];

self.addEventListener("install", (evenement) => {
  evenement.waitUntil(
    caches.open(CACHE_SHELL)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activation : purge des caches des versions précédentes.
self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(
        cles.filter((cle) => !cle.startsWith(CACHE_VERSION)).map((cle) => caches.delete(cle))
      ))
      .then(() => self.clients.claim())
  );
});

function estNavigation(requete) {
  return requete.mode === "navigate"
    || (requete.headers.get("accept") || "").includes("text/html");
}

// Images (Cloudinary + assets) : cache d'abord, plafond FIFO, repli placeholder.
async function imageCacheDAbord(requete) {
  const cache = await caches.open(CACHE_IMAGES);
  const enCache = await cache.match(requete);
  if (enCache) return enCache;
  try {
    const reponse = await fetch(requete);
    if (reponse.ok || reponse.type === "opaque") {
      await cache.put(requete, reponse.clone());
      const cles = await cache.keys();
      if (cles.length > MAX_IMAGES) await cache.delete(cles[0]); // FIFO
    }
    return reponse;
  } catch {
    const placeholder = await caches.match("assets/placeholder-produit.svg");
    if (placeholder) return placeholder;
    throw new Error("image indisponible hors ligne");
  }
}

// SDK Firebase (URLs versionnées, immuables) : cache d'abord — grosse
// économie de data à chaque visite.
async function sdkCacheDAbord(requete) {
  const cache = await caches.open(CACHE_SDK);
  const enCache = await cache.match(requete);
  if (enCache) return enCache;
  const reponse = await fetch(requete);
  if (reponse.ok) await cache.put(requete, reponse.clone());
  return reponse;
}

// Pages HTML : réseau d'abord (contenu frais), repli cache, puis hors-ligne.
// Clé de cache = chemin sans paramètres (?id=, ?s= partagent le même HTML).
async function pageReseauDAbord(requete, url) {
  const clePage = url.pathname;
  try {
    const reponse = await fetch(requete);
    // Ne jamais mettre en cache une page d'erreur (404, 500…).
    if (reponse.ok) {
      const cache = await caches.open(CACHE_SHELL);
      cache.put(clePage, reponse.clone());
    }
    return reponse;
  } catch {
    const enCache = await caches.match(clePage);
    return enCache || caches.match("hors-ligne.html");
  }
}

self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);

  // API dynamiques : ne JAMAIS intercepter (Firestore en long-polling,
  // Auth, uploads Cloudinary) — le SDK gère ses propres échecs.
  if (url.hostname.endsWith("googleapis.com")
    || url.hostname.endsWith("firebaseapp.com")
    || url.hostname === "api.cloudinary.com") return;

  if (url.origin === location.origin && estNavigation(requete)) {
    evenement.respondWith(pageReseauDAbord(requete, url));
    return;
  }

  // Images : Cloudinary (anciennes) et Supabase Storage public (S3+).
  // Le chemin /storage/... est le SEUL de *.supabase.co intercepté — les
  // appels REST/Auth ne passent jamais par le cache.
  if (url.hostname === "res.cloudinary.com"
    || (url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/public/"))) {
    evenement.respondWith(imageCacheDAbord(requete));
    return;
  }

  if (url.hostname === "www.gstatic.com") {
    evenement.respondWith(sdkCacheDAbord(requete));
    return;
  }

  // Shell local (CSS, JS, assets) : cache d'abord, réseau en repli.
  if (url.origin === location.origin) {
    evenement.respondWith(
      caches.match(requete).then((reponse) => reponse || fetch(requete))
    );
  }
});
