// ============================================================================
//  regras.js — Regras de negócio puras
// ----------------------------------------------------------------------------
//  Só função pura aqui: entra dado, sai dado. Nada de DOM, nada de rede.
//
//  Existe por um motivo prático: isto é a lógica que quebra em silêncio — um
//  comparador de ordenação, um dígito verificador de CPF, uma contagem de
//  dias. Enquanto morava dentro das views, testar exigia um navegador, e por
//  isso ninguém testava. Aqui o node roda direto (ver tests/regras_test.mjs).
// ============================================================================

import { todayISO } from "./money.js";

// Janela (em dias) do aviso de "mensalidade vencendo em breve".
export const AVISO_DIAS = 7;

// Dias entre hoje e uma data ISO. Negativo = já passou. null = sem data.
export function diasAte(iso, hoje = todayISO()) {
  if (!iso) return null;
  const ms = new Date(iso + "T00:00:00") - new Date(hoje + "T00:00:00");
  return Math.round(ms / 86400000);
}

// Cliente ativo cuja mensalidade vence dentro da janela de aviso.
export function venceEmBreve(c, hoje = todayISO()) {
  if (!c.active || !c.plan_until) return false;
  const d = diasAte(c.plan_until, hoje);
  return d !== null && d >= 0 && d <= AVISO_DIAS;
}

// Texto do aviso de vencimento.
export function avisoVenc(c, hoje = todayISO()) {
  const d = diasAte(c.plan_until, hoje);
  if (d === 0) return "Vence hoje";
  if (d === 1) return "Vence amanhã";
  return `Vence em ${d}d`;
}

// Quem precisa de ação primeiro. A ordem que o banco devolve (por cadastro)
// esconde o cliente que venceu ontem no meio da lista; aqui ele sobe.
// Dentro de cada grupo: vence antes vem antes; sem data vai pro fim, por nome.
export function ordenarPorUrgencia(lista, hoje = todayISO()) {
  const rank = (c) => (!c.active ? 0 : venceEmBreve(c, hoje) ? 1 : 2);
  return lista.sort((a, b) =>
    rank(a) - rank(b) ||
    (a.plan_until || "9999-12-31").localeCompare(b.plan_until || "9999-12-31") ||
    (a.name || "").localeCompare(b.name || "", "pt-BR")
  );
}

// ---- CPF e telefone --------------------------------------------------------

// Máscara progressiva: formata enquanto a pessoa digita, sem travar o campo.
export function formatCPFValue(value) {
  const d = (value || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatPhoneValue(value) {
  const d = (value || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Dígitos verificadores do CPF. Rejeita também os 11 dígitos repetidos
// (111.111.111-11 passa na conta, mas não é CPF de ninguém).
export function validarCPF(cpf) {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(d[i]) * (10 - i);
  let mod = (sum * 10) % 11;
  if (mod === 10) mod = 0;
  if (mod !== Number(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(d[i]) * (11 - i);
  mod = (sum * 10) % 11;
  if (mod === 10) mod = 0;
  return mod === Number(d[10]);
}
