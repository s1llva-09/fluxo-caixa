// ============================================================================
//  config.js — Configuração do Supabase
// ============================================================================
//  Pegue estes dois valores no painel do Supabase:
//    Project Settings  >  Data API  (ou "API")
//      - Project URL        -> SUPABASE_URL
//      - anon / public key  -> SUPABASE_ANON_KEY
//
//  IMPORTANTE: a chave "anon" é pública de propósito e PODE ficar no front.
//  Quem protege os dados é o RLS no banco (ver supabase/schema.sql),
//  não o segredo da chave. NUNCA coloque aqui a chave "service_role".
// ============================================================================

export const SUPABASE_URL = "https://wrhnxokpcsugigypgdea.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyaG54b2twY3N1Z2lneXBnZGVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODIyODcsImV4cCI6MjA5NzA1ODI4N30.3enKUx_F6pQeRaCcrvIqiGctFUKpTEtmxVEH4SM0TLc";
