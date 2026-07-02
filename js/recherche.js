// Recherche : index catalogue léger filtré côté client.
// Implémenté au jalon M3 (voir cahier des charges §6) :
//   1. requête `produits` où visible == true, tri creeLe desc, limite 600 ;
//   2. requête boutiques actives en parallèle ;
//   3. cache localStorage `suuq_index`, TTL 15 minutes ;
//   4. recherche/filtres/tri en mémoire via normaliser().
//
// LIMITE ASSUMÉE : cette approche est valide jusqu'à ~1 500 – 2 000 produits.
// Au-delà (Phase 2), migrer vers un index précalculé par catégorie ou un
// service de recherche (Typesense / Algolia).
