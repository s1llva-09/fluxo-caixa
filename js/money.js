// ============================================================================
//  money.js — Tudo que envolve dinheiro
// ============================================================================
//  Regra de ouro: dentro do sistema o dinheiro SEMPRE anda em centavos
//  (número inteiro). Só convertemos pra "reais" na hora de mostrar na tela.
//  Isso evita erros de arredondamento do ponto flutuante.
// ============================================================================

// Formata centavos para texto em Real. Ex.: 123456 -> "R$ 1.234,56"
export function formatBRL(cents) {
  const reais = (cents || 0) / 100;
  return reais.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Converte o que o usuário digitou (ex.: "1.234,56" ou "1234,56" ou "1234.56")
// para centavos. Retorna null se não for um número válido.
export function parseToCents(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (s === "") return null;

  // Remove "R$", espaços e qualquer coisa que não seja dígito, vírgula ou ponto
  s = s.replace(/[^\d,.-]/g, "");

  // Se não sobrou nenhum dígito, não é um valor válido
  if (!/\d/.test(s)) return null;

  // Se tem vírgula, assumimos padrão BR: ponto = milhar, vírgula = decimal
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }

  const value = Number(s);
  if (Number.isNaN(value)) return null;

  // Arredonda pra evitar sobras de ponto flutuante e vira centavos
  return Math.round(value * 100);
}

// Formata uma data "2025-03-08" (vinda do banco) para "08/03/2025"
export function formatDate(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

// Data de hoje no formato que o banco espera ("YYYY-MM-DD")
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
