// ============================================================================
//  auth.js — Login, cadastro e sessão do usuário
// ============================================================================
//  Usa o sistema de autenticação pronto do Supabase (email + senha).
//  Não precisamos guardar senha nem token na mão: o Supabase cuida disso.
// ============================================================================

import { supabase } from "./supabaseClient.js";

// Cria uma conta nova com email e senha.
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

// Entra com email e senha.
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

// Sai da conta.
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Retorna o usuário logado agora (ou null se não tiver ninguém logado).
export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

// Avisa sempre que o login muda (entrou ou saiu). Útil pra atualizar a tela.
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}

// Atualiza o email do usuário (Supabase envia confirmação pro novo email).
export async function updateEmail(email) {
  const { data, error } = await supabase.auth.updateUser({ email });
  if (error) throw error;
  return data;
}

// Atualiza a senha do usuário.
export async function updatePassword(password) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data;
}
