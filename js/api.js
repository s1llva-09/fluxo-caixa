// ============================================================================
//  api.js — Conversa com o banco de dados
// ============================================================================
//  Aqui ficam TODAS as funções que leem e gravam dados no Supabase.
//  O resto do app chama estas funções e não precisa saber como o banco funciona.
//  Como o RLS está ativo, cada consulta só traz/grava dados da empresa do usuário.
// ============================================================================

import { supabase } from "./supabaseClient.js";

// -------- EMPRESAS --------

// Pega a primeira empresa do usuário (no MVP cada dono tem uma).
export async function getMinhaEmpresa() {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data; // null se ainda não criou nenhuma
}

// Cria a empresa (chama a função do banco que também cria o vínculo de dono).
export async function criarEmpresa(nome) {
  const { data, error } = await supabase.rpc("create_company", {
    p_name: nome,
  });
  if (error) throw error;
  return data;
}

// Atualiza o nome da empresa.
export async function atualizarEmpresa(companyId, nome) {
  const { data, error } = await supabase
    .from("companies")
    .update({ name: nome })
    .eq("id", companyId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// -------- CATEGORIAS --------

export async function listarCategorias(companyId) {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (error) throw error;
  return data;
}

export async function criarCategoria(companyId, nome, kind) {
  const { data, error } = await supabase
    .from("categories")
    .insert({ company_id: companyId, name: nome, kind: kind || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarCategoria(id, nome, kind) {
  const { data, error } = await supabase
    .from("categories")
    .update({ name: nome, kind: kind || null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function apagarCategoria(id) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

// -------- LANÇAMENTOS --------

// Lista lançamentos com filtros opcionais de período, tipo e categoria.
// Junta o nome da categoria (categories(name)) numa consulta só.
export async function listarLancamentos({
  companyId,
  de,
  ate,
  kind,
  categoryId,
} = {}) {
  let query = supabase
    .from("v_transactions")
    .select("*, categories(name)")
    .eq("company_id", companyId)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (de) query = query.gte("occurred_on", de);
  if (ate) query = query.lte("occurred_on", ate);
  if (kind) query = query.eq("kind", kind);
  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Cria um lançamento (valor já deve chegar em centavos).
export async function criarLancamento({
  companyId,
  kind,
  amountCents,
  description,
  categoryId,
  occurredOn,
}) {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      company_id: companyId,
      kind,
      amount_cents: amountCents,
      description: description || "",
      category_id: categoryId || null,
      occurred_on: occurredOn,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Estorna um lançamento (chama a função do banco que cria o contra-lançamento).
export async function estornarLancamento(id) {
  const { data, error } = await supabase.rpc("reverse_transaction", {
    p_id: id,
  });
  if (error) throw error;
  return data;
}
