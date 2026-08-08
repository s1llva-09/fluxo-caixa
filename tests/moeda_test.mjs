// ============================================================================
//  Testes de splitMoeda (money.js)
//  Rodar: node tests/moeda_test.mjs
// ----------------------------------------------------------------------------
//  splitMoeda separa a cifra do número pra tipografia da placa de saldo.
//  Roda no node: money.js só toca no localStorage dentro de try/catch.
// ============================================================================

import assert from "node:assert/strict";
import { splitMoeda, setMoeda, formatBRL } from "../js/money.js";

// A soma das duas partes tem que reconstruir o que formatBRL devolve — é essa
// invariante que garante que nenhum dígito se perde no corte.
//
// Espaço e sinal saem dos dois lados antes de comparar, cada um por um motivo:
// o Intl separa cifra e número com espaço fixo (U+00A0) em pt-BR e não separa
// em en-US; e a POSIÇÃO do "-" varia por locale — pt-BR escreve "-R$ 48,00",
// es-PY escreve "Gs.-48.230". Levar o sinal pra junto do número é justamente
// o trabalho de splitMoeda, então onde ele estava no original não diz nada.
// Que o sinal sobreviva ao corte é conferido à parte, logo abaixo.
function reconstroi(cents) {
  const { cifra, valor } = splitMoeda(cents);
  const limpa = (s) => s.replace(/[\s -]/g, "");
  return [limpa(cifra + valor), limpa(formatBRL(cents))];
}

for (const moeda of ["BRL", "USD", "EUR", "PYG"]) {
  setMoeda(moeda);
  for (const cents of [0, 1, 99, 12345, 4823015, -4823015, -1, 99999999]) {
    const [a, b] = reconstroi(cents);
    assert.equal(a, b, `${moeda} ${cents}: "${a}" != "${b}"`);

    const { cifra, valor } = splitMoeda(cents);
    // A cifra nunca leva dígito nem sinal — ela é só o símbolo da moeda.
    assert.ok(!/\d/.test(cifra), `${moeda} ${cents}: cifra "${cifra}" tem dígito`);
    assert.ok(!cifra.includes("-"), `${moeda} ${cents}: sinal ficou na cifra`);
    // O valor começa no sinal ou no primeiro dígito, nunca no símbolo.
    assert.match(valor, /^-?\d/, `${moeda} ${cents}: valor "${valor}" não começa em dígito`);
    // Negativo continua negativo depois do corte. É o caso que uma separação
    // ingênua perde — e a placa mostraria um saldo negativo como positivo.
    assert.equal(valor.startsWith("-"), cents < 0, `${moeda} ${cents}: sinal errado`);
  }
}

setMoeda("BRL");
assert.deepEqual(splitMoeda(4823015), { cifra: "R$", valor: "48.230,15" });

console.log("moeda: todos os casos passaram");
