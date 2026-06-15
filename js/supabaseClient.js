// ============================================================================
//  supabaseClient.js — Cria o cliente que conversa com o Supabase
// ============================================================================
//  Importamos a biblioteca direto da CDN (esm.sh), sem precisar de npm/build.
//  Esse "supabase" exportado é usado em todo o resto do app pra ler/gravar
//  dados e fazer login.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
