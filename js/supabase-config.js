// Valeurs publiques par nature (comme firebaseConfig l'était) : la sécurité
// repose sur les politiques RLS de PostgreSQL (supabase/rls.sql), pas sur le
// secret de ces clés. La clé "anon/publishable" est conçue pour vivre dans le
// code client. Ne JAMAIS introduire ici la clé service_role (elle contourne
// le RLS — usage serveur uniquement).
//
// Souveraineté (avenant n°2 §10) : le jour de l'auto-hébergement, seules ces
// deux valeurs changent — aucune réécriture applicative.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://kkdpfarvzgookvgfsbya.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wd9u2-t2RNa2KnIVtukQMA_gAJTDfhX";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
