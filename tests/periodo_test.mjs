// ============================================================================
//  Testes do recorte de período (state.js)
//  Rodar: node tests/periodo_test.mjs
// ----------------------------------------------------------------------------
//  state.js não toca no browser nem no Supabase, então este roda direto no
//  node — diferente dos testes .html, que precisam de sessão e banco.
// ============================================================================

import assert from "node:assert/strict";
import { periodoDoMes, mesAnterior, mesChaveAtual, mesAtual } from "../js/state.js";

// ---- periodoDoMes: primeiro e último dia --------------------------------

assert.deepEqual(periodoDoMes("2026-08"), { de: "2026-08-01", ate: "2026-08-31" });
assert.deepEqual(periodoDoMes("2026-04"), { de: "2026-04-01", ate: "2026-04-30" });

// Fevereiro: comum, bissexto e a exceção secular dos 400 anos.
assert.deepEqual(periodoDoMes("2026-02"), { de: "2026-02-01", ate: "2026-02-28" });
assert.deepEqual(periodoDoMes("2028-02"), { de: "2028-02-01", ate: "2028-02-29" });
assert.deepEqual(periodoDoMes("2100-02"), { de: "2100-02-01", ate: "2100-02-28" });
assert.deepEqual(periodoDoMes("2000-02"), { de: "2000-02-01", ate: "2000-02-29" });

// Mês de um dígito continua com zero à esquerda (o banco compara texto).
assert.deepEqual(periodoDoMes("2026-01"), { de: "2026-01-01", ate: "2026-01-31" });
assert.deepEqual(periodoDoMes("2026-09"), { de: "2026-09-01", ate: "2026-09-30" });

// A razão de não passar por toISOString(): o primeiro dia tem que ser dia 01
// em qualquer fuso, e não o último do mês anterior por conta da conversão UTC.
for (const chave of ["2026-01", "2026-06", "2026-12"]) {
  assert.equal(periodoDoMes(chave).de.slice(-2), "01", `${chave} não começa no dia 01`);
}

// ---- mesAnterior: inclusive na virada de ano ----------------------------

assert.equal(mesAnterior("2026-08"), "2026-07");
assert.equal(mesAnterior("2026-01"), "2025-12");
assert.equal(mesAnterior("2026-10"), "2026-09"); // continua com zero à esquerda

// ---- coerência entre os helpers ----------------------------------------

assert.match(mesChaveAtual(), /^\d{4}-(0[1-9]|1[0-2])$/);
assert.deepEqual(mesAtual(), periodoDoMes(mesChaveAtual()));

// O intervalo tem que ser válido pra virar filtro (de <= ate como texto).
for (let m = 1; m <= 12; m++) {
  const chave = `2026-${String(m).padStart(2, "0")}`;
  const { de, ate } = periodoDoMes(chave);
  assert.ok(de <= ate, `${chave}: de (${de}) maior que ate (${ate})`);
  assert.ok(de.startsWith(chave) && ate.startsWith(chave), `${chave}: saiu do mês`);
}

console.log("periodo: todos os casos passaram");
