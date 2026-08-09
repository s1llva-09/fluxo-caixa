// Roda com: node tests/regras_test.mjs
// Cobre a lógica que quebra em silêncio: ordem da lista de clientes, janela de
// vencimento e dígito verificador de CPF.
import assert from "node:assert/strict";
import {
  AVISO_DIAS, diasAte, venceEmBreve, avisoVenc, ordenarPorUrgencia,
  formatCPFValue, formatPhoneValue, validarCPF,
} from "../js/regras.js";

const HOJE = "2026-08-09"; // data fixa: teste que depende de "hoje" quebra sozinho

// ---- diasAte ----
assert.equal(diasAte(null, HOJE), null);
assert.equal(diasAte("2026-08-09", HOJE), 0);
assert.equal(diasAte("2026-08-10", HOJE), 1);
assert.equal(diasAte("2026-08-08", HOJE), -1);
// Atravessa o horário de verão sem perder um dia (o motivo do Math.round).
assert.equal(diasAte("2026-11-09", HOJE), 92);

// ---- venceEmBreve ----
const ativo = (plan_until) => ({ active: true, plan_until });
assert.equal(venceEmBreve(ativo("2026-08-09"), HOJE), true, "vence hoje conta");
assert.equal(venceEmBreve(ativo("2026-08-16"), HOJE), true, "borda: exatos 7 dias");
assert.equal(venceEmBreve(ativo("2026-08-17"), HOJE), false, "8 dias já é fora");
assert.equal(venceEmBreve(ativo("2026-08-08"), HOJE), false, "vencido não é 'vencendo'");
assert.equal(venceEmBreve(ativo(null), HOJE), false, "sem data nunca vence em breve");
assert.equal(venceEmBreve({ active: false, plan_until: "2026-08-10" }, HOJE), false,
  "bloqueado não entra no aviso");
assert.equal(AVISO_DIAS, 7);

// ---- avisoVenc ----
assert.equal(avisoVenc(ativo("2026-08-09"), HOJE), "Vence hoje");
assert.equal(avisoVenc(ativo("2026-08-10"), HOJE), "Vence amanhã");
assert.equal(avisoVenc(ativo("2026-08-14"), HOJE), "Vence em 5d");

// ---- ordenarPorUrgencia ----
const lista = [
  { name: "Tranquilo", active: true, plan_until: "2027-01-01" },
  { name: "Vencendo", active: true, plan_until: "2026-08-11" },
  { name: "Bloqueado", active: false, plan_until: "2026-07-01" },
  { name: "Sem data", active: true, plan_until: null },
];
assert.deepEqual(
  ordenarPorUrgencia([...lista], HOJE).map((c) => c.name),
  ["Bloqueado", "Vencendo", "Tranquilo", "Sem data"],
  "inativo primeiro, depois vencendo, e sem data por último"
);
// Empate no grupo: vence antes vem antes; sem data desempata por nome.
assert.deepEqual(
  ordenarPorUrgencia([
    { name: "Zeta", active: true, plan_until: null },
    { name: "Alfa", active: true, plan_until: null },
    { name: "Cedo", active: true, plan_until: "2026-09-01" },
  ], HOJE).map((c) => c.name),
  ["Cedo", "Alfa", "Zeta"]
);

// ---- máscaras ----
assert.equal(formatCPFValue("123"), "123");
assert.equal(formatCPFValue("12345678901"), "123.456.789-01");
assert.equal(formatCPFValue("123.456.789-01"), "123.456.789-01", "reformatar não duplica");
assert.equal(formatCPFValue("1234567890123"), "123.456.789-01", "corta em 11 dígitos");
assert.equal(formatCPFValue(""), "");
assert.equal(formatPhoneValue("11987654321"), "(11) 98765-4321");
assert.equal(formatPhoneValue("1133334444"), "(11) 3333-4444", "fixo de 10 dígitos");
assert.equal(formatPhoneValue("11"), "11");

// ---- validarCPF ----
assert.equal(validarCPF("529.982.247-25"), true);
assert.equal(validarCPF("52998224725"), true, "aceita sem máscara");
assert.equal(validarCPF("529.982.247-24"), false, "segundo dígito errado");
assert.equal(validarCPF("111.111.111-11"), false, "repetido passa na conta, mas não vale");
assert.equal(validarCPF("123"), false);
assert.equal(validarCPF(""), false);
assert.equal(validarCPF(null), false);
// Caso em que o resto dá 10 e o dígito tem que virar 0.
assert.equal(validarCPF("133.456.789-01"), false);

console.log("regras: todos os casos passaram");
