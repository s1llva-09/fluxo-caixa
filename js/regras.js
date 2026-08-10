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

// ---- Mês a mês -------------------------------------------------------------

// Todas as chaves "YYYY-MM" entre duas datas ISO, inclusive as pontas.
// Aritmética de calendário em texto, sem Date: mês tem 28 a 31 dias e somar
// milissegundos erra a virada. Devolve do mais RECENTE pro mais antigo, que é
// a ordem em que se lê um extrato.
export function mesesEntre(de, ate) {
  if (!de || !ate) return [];
  let [ano, mes] = de.slice(0, 7).split("-").map(Number);
  const [anoF, mesF] = ate.slice(0, 7).split("-").map(Number);
  if (anoF * 12 + mesF < ano * 12 + mes) return [];

  const out = [];
  while (ano * 12 + mes <= anoF * 12 + mesF) {
    out.push(`${ano}-${String(mes).padStart(2, "0")}`);
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  return out.reverse();
}

// Entradas, saídas e saldo de cada mês do período. Mês sem movimento entra
// zerado em vez de sumir: um buraco no meio da série é informação — foi um mês
// parado —, e some se a linha não existir.
export function resumoMensal(itens, de, ate) {
  const linhas = new Map(
    mesesEntre(de, ate).map((mes) => [mes, { mes, entradas: 0, saidas: 0, saldo: 0 }])
  );
  for (const t of itens || []) {
    const linha = linhas.get(String(t.occurred_on || "").slice(0, 7));
    if (!linha) continue; // fora do período pedido
    if (t.kind === "entrada") linha.entradas += t.amount_cents || 0;
    else linha.saidas += t.amount_cents || 0;
    linha.saldo = linha.entradas - linha.saidas;
  }
  return [...linhas.values()];
}

// Variação percentual entre dois valores. null quando não há base de comparação
// — crescer "infinito%" partindo de zero não diz nada a ninguém.
export function variacaoPercentual(atual, anterior) {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

// "2026-08" → "ago/26". Rótulo curto porque ele vive numa coluna de tabela.
export function rotuloMes(chave) {
  const [ano, mes] = String(chave).split("-").map(Number);
  const nome = new Date(ano, (mes || 1) - 1, 1)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "");
  return `${nome}/${String(ano).slice(2)}`;
}

// ---- CPF e telefone --------------------------------------------------------

// Máscara progressiva: formata enquanto a pessoa digita, sem travar o campo.
export function formatCPFValue(value) {
  if (temLetra(value)) return String(value);
  const d = soDigitos(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Só os dígitos. É isto que vai pro banco e pra API de cobrança: máscara é
// coisa da tela, não do dado. Guardar "123.456.789-01" quebra comparação,
// busca e integração.
export function soDigitos(value) {
  return String(value || "").replace(/\D/g, "");
}

// Campo com letra não é CPF nem telefone brasileiro: pode ser documento
// estrangeiro, "a confirmar", um ramal escrito por extenso. A máscara devolve
// o texto intacto em vez de mastigar o que já estava salvo.
function temLetra(value) {
  return /[a-zA-Z]/.test(String(value || ""));
}

// 00.000.000/0000-00
export function formatCNPJValue(value) {
  if (temLetra(value)) return String(value);
  const d = soDigitos(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// Campo que aceita os dois: escolhe a máscara pelo tamanho, porque quem digita
// não avisa antes qual é. Até 11 dígitos é CPF; daí pra frente, CNPJ.
export function formatDocumento(value) {
  // Sem guarda de letra aqui de propósito: os dois ramos já têm a sua, e
  // repetir só criaria um terceiro lugar pra esquecer de mexer depois.
  return soDigitos(value).length <= 11 ? formatCPFValue(value) : formatCNPJValue(value);
}

export function formatPhoneValue(value) {
  if (temLetra(value)) return String(value);
  const d = soDigitos(value).slice(0, 11);
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
