// ============================================================================
//  money.js — Tudo que envolve dinheiro
// ============================================================================
//  Regra de ouro: dentro do sistema o dinheiro SEMPRE anda em centavos
//  (número inteiro). Só convertemos pra "reais" na hora de mostrar na tela.
//  Isso evita erros de arredondamento do ponto flutuante.
// ============================================================================

// ── Moeda configurável ───────────────────────────────────────────────────────
// Os valores SEMPRE são guardados em centavos; a moeda só muda como é exibido.
// Preferência por dispositivo (localStorage). Trocada em Configurações.
const MOEDAS = {
  BRL: { locale: "pt-BR", nome: "Real brasileiro (R$)" },
  USD: { locale: "en-US", nome: "Dólar americano ($)" },
  EUR: { locale: "pt-PT", nome: "Euro (€)" },
  GBP: { locale: "en-GB", nome: "Libra esterlina (£)" },
  ARS: { locale: "es-AR", nome: "Peso argentino ($)" },
  PYG: { locale: "es-PY", nome: "Guarani (₲)" },
  CLP: { locale: "es-CL", nome: "Peso chileno ($)" },
};
export const MOEDAS_LISTA = Object.entries(MOEDAS).map(([code, m]) => ({ code, nome: m.nome }));

let _moeda = "BRL";
try {
  const m = localStorage.getItem("fc-moeda");
  if (m && MOEDAS[m]) _moeda = m;
} catch (e) { /* ignore */ }

export function getMoeda() { return _moeda; }
export function setMoeda(code) {
  if (!MOEDAS[code]) return;
  _moeda = code;
  try { localStorage.setItem("fc-moeda", code); } catch (e) { /* ignore */ }
}

// Formata centavos na moeda escolhida. Ex.: 123456 -> "R$ 1.234,56" / "$1,234.56"
export function formatBRL(cents) {
  const valor = (cents || 0) / 100;
  const { locale } = MOEDAS[_moeda] || MOEDAS.BRL;
  return valor.toLocaleString(locale, { style: "currency", currency: _moeda });
}

// Separa a cifra do número, pra tipografia de placa: símbolo pequeno em cima,
// valor grande embaixo. O corte é no primeiro dígito, não num espaço, porque
// o Intl usa espaço fixo (U+00A0) em pt-BR e cola o símbolo no número em
// en-US. O sinal negativo vai junto do número — ele é parte do valor, não da
// moeda, e sozinho na cifra pequena passaria despercebido.
export function splitMoeda(cents) {
  const s = formatBRL(cents);
  const i = s.search(/\d/);
  if (i <= 0) return { cifra: "", valor: s };
  const cifra = s.slice(0, i);
  const neg = cifra.includes("-");
  return {
    cifra: cifra.replace("-", "").trim(),
    valor: (neg ? "-" : "") + s.slice(i),
  };
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
