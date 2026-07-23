// ============================================================================
//  api.js — Conversa com o banco de dados
// ============================================================================
//  Aqui ficam TODAS as funções que leem e gravam dados no Supabase.
//  O resto do app chama estas funções e não precisa saber como o banco funciona.
//  Como o RLS está ativo, cada consulta só traz/grava dados da empresa do usuário.
// ============================================================================

import { supabase } from "./supabaseClient.js";

// -------- EMPRESAS --------

const ACTIVE_KEY = "fc-active-company";

// Define qual empresa está "ativa" (quando o usuário participa de várias).
export function setEmpresaAtiva(id) {
  try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) { /* ignore */ }
}

// Pega a empresa ativa do usuário logado — a que ele é MEMBRO (dono ou convidado).
// Busca pela company_members (não por owner_id) pra funcionar com equipe; respeita
// a empresa ativa salva; senão prefere a que ele é dono; senão a primeira.
export async function getMinhaEmpresa() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: mems, error: e1 } = await supabase
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", user.id);
  if (e1) throw e1;
  if (!mems || mems.length === 0) return null;

  let active = null;
  try { active = localStorage.getItem(ACTIVE_KEY); } catch (e) { /* ignore */ }
  const chosen = mems.find((m) => m.company_id === active)
    || mems.find((m) => m.role === "owner")
    || mems[0];

  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", chosen.company_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Lista as empresas das quais o usuário participa (pro seletor de empresa).
export async function minhasEmpresas() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("company_members")
    .select("role, companies(id, name)")
    .eq("user_id", user.id);
  if (error) throw error;
  return (data || [])
    .map((r) => ({ id: r.companies?.id, name: r.companies?.name, role: r.role }))
    .filter((c) => c.id);
}

// -------- EQUIPE (convidar / membros) --------

export async function convidar(companyId, email, role = "member") {
  const { data, error } = await supabase
    .from("invites")
    .insert({ company_id: companyId, email: email.trim().toLowerCase(), role })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Dispara o email do convite (Edge Function). Não-fatal: se o email não
// estiver configurado, o convite já foi criado mesmo assim.
export async function enviarEmailConvite(inviteId, appUrl) {
  const { error } = await supabase.functions.invoke("enviar-convite", {
    body: { invite_id: inviteId, app_url: appUrl },
  });
  if (error) throw error;
}

export async function listarConvites(companyId) {
  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function revogarConvite(id) {
  const { error } = await supabase.from("invites").update({ status: "revoked" }).eq("id", id);
  if (error) throw error;
}

export async function listarMembros(companyId) {
  const { data, error } = await supabase.rpc("team_members", { p_company_id: companyId });
  if (error) throw error;
  return data || [];
}

export async function listarMembrosEmpresa(companyId) {
  // alias para compatibilidade com o painel de permissões
  return listarMembros(companyId);
}

export async function setMemberRole(companyId, userId, role) {
  const { data, error } = await supabase.rpc('set_member_role', { p_company_id: companyId, p_user_id: userId, p_role: role });
  if (error) throw error;
  return data;
}

export async function listarMemberRoleAudit(companyId, limit = 50, offset = 0, userId = null) {
  const { data, error } = await supabase.rpc('company_members_audit_with_emails', {
    p_company_id: companyId,
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return data || [];
}

export async function exportMemberRoleAuditCSV(companyId, userId = null, limit = 1000, offset = 0) {
  const rows = await listarMemberRoleAudit(companyId, limit, offset, userId);
  const cols = ['changed_at','user_email','user_id','old_role','new_role','changed_by_email','changed_by','company_id'];
  const csv = [cols.join(',')];
  for (const r of rows) {
    const line = cols.map(c => `"${String(r[c] ?? '').replace(/"/g,'""')}"`).join(',');
    csv.push(line);
  }
  return csv.join('\n');
}

export async function removerMembro(companyId, userId) {
  const { error } = await supabase.rpc("remover_membro", { p_company_id: companyId, p_user_id: userId });
  if (error) throw error;
}

export async function meusConvites() {
  const { data, error } = await supabase.rpc("meus_convites");
  if (error) throw error;
  return data || [];
}

export async function aceitarConvite(id) {
  const { data, error } = await supabase.rpc("aceitar_convite", { p_id: id });
  if (error) throw error;
  return data;
}

// Cria a empresa (chama a função do banco que também cria o vínculo de dono).
export async function criarEmpresa(nome, sector) {
  const { data, error } = await supabase.rpc("create_company", {
    p_name: nome,
  });
  if (error) throw error;
  // Ramo de atividade é gravado à parte (não-fatal: se a coluna `sector` ainda
  // não existe, a criação da empresa não quebra).
  if (sector && data?.id) {
    try {
      await supabase.from("companies").update({ sector }).eq("id", data.id);
    } catch (e) {
      console.error("ramo de atividade:", e);
    }
  }
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

// -------- RECORRÊNCIAS (lançamentos que se repetem) --------

export async function listarRecorrencias(companyId) {
  const { data, error } = await supabase
    .from("recurrences")
    .select("*, categories(name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function criarRecorrencia(companyId, dados) {
  const { data, error } = await supabase
    .from("recurrences")
    .insert({ company_id: companyId, ...dados })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarRecorrencia(id, mudancas) {
  const { data, error } = await supabase
    .from("recurrences")
    .update(mudancas)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function apagarRecorrencia(id) {
  const { error } = await supabase.from("recurrences").delete().eq("id", id);
  if (error) throw error;
}

// Gera os lançamentos vencidos das recorrências. Devolve quantos criou.
export async function processarRecorrencias(companyId) {
  const { data, error } = await supabase.rpc("processar_recorrencias", {
    p_company_id: companyId,
  });
  if (error) throw error;
  return data || 0;
}

// -------- CONTAS A PAGAR / A RECEBER (scheduled) --------

// status opcional: "pending" | "paid" | "canceled" (sem filtro = todas).
export async function listarContas(companyId, status) {
  let q = supabase
    .from("scheduled")
    .select("*, categories(name)")
    .eq("company_id", companyId)
    .order("due_on", { ascending: true });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function criarConta(companyId, dados) {
  const { data, error } = await supabase
    .from("scheduled")
    .insert({ company_id: companyId, ...dados })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarConta(id, dados) {
  const { data, error } = await supabase
    .from("scheduled")
    .update(dados)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Marca como paga: cria o lançamento real e linka. paidOn em "YYYY-MM-DD".
export async function pagarConta(id, paidOn) {
  const { data, error } = await supabase.rpc("pagar_conta", {
    p_id: id,
    p_paid_on: paidOn || null,
  });
  if (error) throw error;
  return data;
}

export async function cancelarConta(id) {
  const { error } = await supabase
    .from("scheduled")
    .update({ status: "canceled" })
    .eq("id", id);
  if (error) throw error;
}

export async function apagarConta(id) {
  const { error } = await supabase.from("scheduled").delete().eq("id", id);
  if (error) throw error;
}

// -------- COMPROVANTES (anexos) --------

// Lista os anexos da empresa (pra cruzar com os lançamentos no cliente).
export async function listarComprovantes(companyId) {
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("company_id", companyId);
  if (error) throw error;
  return data || [];
}

// Envia o arquivo pro Storage e registra o anexo no lançamento.
export async function uploadComprovante(companyId, transactionId, file) {
  const safe = (file.name || "arquivo").replace(/[^\w.\-]/g, "_");
  const path = `${companyId}/${transactionId}-${Date.now()}-${safe}`;
  const up = await supabase.storage.from("comprovantes").upload(path, file, { upsert: false });
  if (up.error) throw up.error;
  const { data, error } = await supabase
    .from("attachments")
    .insert({ company_id: companyId, transaction_id: transactionId, path, filename: file.name || safe })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// URL temporária (assinada) pra abrir/baixar o comprovante.
export async function urlComprovante(path) {
  const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(path, 120);
  if (error) throw error;
  return data.signedUrl;
}

// Envia um anexo associado a um funcionário
export async function uploadEmployeeAttachment(companyId, employeeId, file) {
  const safe = (file.name || "arquivo").replace(/[^\w.\-]/g, "_");
  const path = `${companyId}/employees/${employeeId}-${Date.now()}-${safe}`;
  const up = await supabase.storage.from("comprovantes").upload(path, file, { upsert: false });
  if (up.error) throw up.error;
  const { data, error } = await supabase
    .from("attachments")
    .insert({ company_id: companyId, employee_id: employeeId, path, filename: file.name || safe })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listarEmployeeAttachments(companyId, employeeId) {
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function deleteAttachment(id, path) {
  // remove do storage (não-fatal) e depois do registro
  try {
    await supabase.storage.from("comprovantes").remove([path]);
  } catch (e) {
    console.error('storage remove failed', e);
  }
  const { error } = await supabase.from("attachments").delete().eq("id", id);
  if (error) throw error;
}

export async function listarEmployeeAudit(employeeId) {
  const { data, error } = await supabase
    .from('employees_audit')
    .select('*')
    .eq('employee_id', employeeId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// -------- ADMIN (painel — só o admin consegue usar) --------

// Diz se o usuário logado é o admin do sistema (checado no banco).
export async function souAdmin() {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) throw error;
  return data === true;
}

// Lista todas as empresas/clientes com email do dono e resumo de uso.
export async function listarClientesAdmin() {
  const { data, error } = await supabase.rpc("admin_list_companies");
  if (error) throw error;
  return data || [];
}

// Define status ('active' | 'blocked') e vencimento (date ou null) de um cliente.
export async function definirStatusCliente(companyId, status, planUntil) {
  const { data, error } = await supabase.rpc("admin_set_company_status", {
    p_company_id: companyId,
    p_status: status,
    p_plan_until: planUntil || null,
  });
  if (error) throw error;
  return data;
}

// Define o plano/tier da empresa ('trial' | 'pro' | 'empresarial') — só admin.
export async function definirPlanoEmpresa(companyId, plan) {
  const { error } = await supabase.rpc("admin_set_plan", {
    p_company_id: companyId,
    p_plan: plan,
  });
  if (error) throw error;
}

// Atualiza campos administrativos do cliente: valor da mensalidade e anotações.
export async function atualizarDadosCliente(companyId, planValueCents, notes) {
  const { data, error } = await supabase.rpc("admin_update_company", {
    p_company_id: companyId,
    p_plan_value_cents: planValueCents ?? null,
    p_notes: notes || "",
  });
  if (error) throw error;
  return data;
}

// Registra um pagamento; se renewUntil vier, renova o acesso até essa data.
export async function registrarPagamento(companyId, amountCents, paidOn, note, renewUntil) {
  const { data, error } = await supabase.rpc("admin_add_payment", {
    p_company_id: companyId,
    p_amount_cents: amountCents ?? null,
    p_paid_on: paidOn || null,
    p_note: note || "",
    p_renew_until: renewUntil || null,
  });
  if (error) throw error;
  return data;
}

// Histórico de pagamentos de um cliente.
export async function listarPagamentos(companyId) {
  const { data, error } = await supabase.rpc("admin_list_payments", {
    p_company_id: companyId,
  });
  if (error) throw error;
  return data || [];
}

// Soma dos pagamentos (receita) num período. Datas em "YYYY-MM-DD" ou null.
export async function receitaPeriodo(de, ate) {
  const { data, error } = await supabase.rpc("admin_revenue", {
    p_from: de || null,
    p_to: ate || null,
  });
  if (error) throw error;
  return data || 0;
}

// Receita mês a mês nos últimos N meses (pro gráfico). [{ mes, total }]
export async function receitaMensal(meses = 6) {
  const { data, error } = await supabase.rpc("admin_revenue_monthly", {
    p_months: meses,
  });
  if (error) throw error;
  return data || [];
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

// -------- CLIENTES / FORNECEDORES (módulo ERP) --------

export async function listarClientes(companyId) {
  const { data, error } = await supabase
    .from("parties")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function criarCliente(companyId, dados) {
  const { data, error } = await supabase
    .from("parties")
    .insert({ company_id: companyId, ...dados })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarCliente(id, dados) {
  const { data, error } = await supabase
    .from("parties")
    .update(dados)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function apagarCliente(id) {
  const { error } = await supabase.from("parties").delete().eq("id", id);
  if (error) throw error;
}

// -------- VENDAS (módulo ERP) --------

export async function listarVendas(companyId) {
  const { data, error } = await supabase
    .from("sales")
    .select("*, parties(name)")
    .eq("company_id", companyId)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Registra uma venda: gera a ENTRADA no caixa e grava a venda. Se vierem
// `items` (produtos), o total é calculado a partir deles, os itens são
// gravados e o estoque recebe baixa. Sem items, usa o total manual (amountCents).
// items: [{ productId, productName, qty, unitPriceCents, stockAtual }]
export async function criarVenda(companyId, { partyId, amountCents, description, occurredOn, categoryId, items }) {
  const temItens = Array.isArray(items) && items.length > 0;
  const total = temItens
    ? items.reduce((s, it) => s + Math.round(Number(it.qty) * Number(it.unitPriceCents)), 0)
    : amountCents;

  const tx = await criarLancamento({
    companyId,
    kind: "entrada",
    amountCents: total,
    description: description || "Venda",
    categoryId: categoryId || null,
    occurredOn,
    partyId: partyId || null,
  });

  const { data: sale, error } = await supabase
    .from("sales")
    .insert({
      company_id: companyId,
      party_id: partyId || null,
      transaction_id: tx?.id || null,
      description: description || "",
      amount_cents: total,
      occurred_on: occurredOn,
    })
    .select()
    .single();
  if (error) throw error;

  if (temItens) {
    const rows = items.map((it) => ({
      company_id: companyId,
      sale_id: sale.id,
      product_id: it.productId || null,
      product_name: it.productName || null,
      qty: Number(it.qty),
      unit_price_cents: Number(it.unitPriceCents),
    }));
    const { error: e2 } = await supabase.from("sale_items").insert(rows);
    if (e2) console.error("itens da venda:", e2);

    // Baixa de estoque (usa o estoque conhecido no momento da venda).
    for (const it of items) {
      if (!it.productId) continue;
      const novo = Number(it.stockAtual) - Number(it.qty);
      const { error: e3 } = await supabase.from("products").update({ stock_qty: novo }).eq("id", it.productId);
      if (e3) console.error("baixa de estoque:", e3);
    }
  }
  return sale;
}

// Cancela a venda: estorna a entrada, devolve o estoque dos itens e marca cancelada.
export async function cancelarVenda(venda) {
  if (venda.transaction_id) {
    try {
      await supabase.rpc("reverse_transaction", { p_id: venda.transaction_id });
    } catch (e) {
      console.error("estorno da venda:", e);
    }
  }

  // Devolve o estoque dos itens (não-fatal se a tabela de itens não existir).
  try {
    const { data: itens } = await supabase
      .from("sale_items")
      .select("product_id, qty")
      .eq("sale_id", venda.id);
    for (const it of itens || []) {
      if (!it.product_id) continue;
      const { data: prod } = await supabase
        .from("products").select("stock_qty").eq("id", it.product_id).single();
      if (prod) {
        await supabase.from("products")
          .update({ stock_qty: Number(prod.stock_qty) + Number(it.qty) })
          .eq("id", it.product_id);
      }
    }
  } catch (e) {
    console.error("devolver estoque:", e);
  }

  const { error } = await supabase
    .from("sales")
    .update({ status: "cancelada" })
    .eq("id", venda.id);
  if (error) throw error;
}

// -------- ESTOQUE / PRODUTOS (módulo ERP) --------

export async function listarProdutos(companyId) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function criarProduto(companyId, dados) {
  const { data, error } = await supabase
    .from("products")
    .insert({ company_id: companyId, ...dados })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarProduto(id, dados) {
  const { data, error } = await supabase
    .from("products")
    .update(dados)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function apagarProduto(id) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

// -------- FUNCIONÁRIOS (módulo ERP) --------

export async function listarFuncionarios(companyId) {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("company_id", companyId)
    .order("full_name");
  if (error) throw error;
  return data || [];
}

export async function criarFuncionario(companyId, dados) {
  const { data, error } = await supabase
    .from("employees")
    .insert({ company_id: companyId, ...dados })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function atualizarFuncionario(id, dados) {
  const { data, error } = await supabase
    .from("employees")
    .update(dados)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function apagarFuncionario(id) {
  const { data, error } = await supabase
    .from("employees")
    .update({ active: false, status: "inactive", terminated_on: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
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
  partyId,
}) {
  // Só incluímos party_id quando há contato escolhido — assim continua
  // funcionando mesmo se a migração clientes-link.sql ainda não rodou.
  const row = {
    company_id: companyId,
    kind,
    amount_cents: amountCents,
    description: description || "",
    category_id: categoryId || null,
    occurred_on: occurredOn,
  };
  if (partyId) row.party_id = partyId;

  const { data, error } = await supabase
    .from("transactions")
    .insert(row)
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
