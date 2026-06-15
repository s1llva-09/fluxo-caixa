// ============================================================================
//  views/relatorios.js — Relatório por categoria + exportar CSV
// ============================================================================
//  Mostra um "DRE simplificado": quanto entrou e saiu por categoria no
//  período escolhido, e deixa exportar tudo pra uma planilha (CSV).
// ============================================================================

import { el, $ } from "../ui.js";
import { state, mesAtual } from "../state.js";
import { listarLancamentos } from "../api.js";
import { formatBRL, formatDate } from "../money.js";

const periodo = { ...mesAtual() };

export async function renderRelatorios(root) {
  const de = el("input", { type: "date", class: "input", value: periodo.de });
  const ate = el("input", { type: "date", class: "input", value: periodo.ate });

  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, "Relatórios"),
        el("p", { class: "page-sub" }, "Resumo por categoria")
      ),
      el("button", { class: "btn btn--ghost", onclick: exportar }, "Exportar CSV")
    ),
    el("section", { class: "filtros" }, de, ate),
    el("div", { id: "rel-conteudo", class: "card" },
      el("div", { class: "loading" }, "Carregando..."))
  );

  async function atualizar() {
    periodo.de = de.value;
    periodo.ate = ate.value;
    await montar();
  }
  de.addEventListener("change", atualizar);
  ate.addEventListener("change", atualizar);

  await montar();
}

// Guarda os itens carregados pra reusar no export sem ir no banco de novo.
let itensCache = [];

async function montar() {
  const box = $("#rel-conteudo");
  if (!box) return;
  box.innerHTML = `<div class="loading">Carregando...</div>`;

  const itens = await listarLancamentos({
    companyId: state.company.id,
    de: periodo.de,
    ate: periodo.ate,
  });
  itensCache = itens;

  // Agrupa por categoria, somando entradas e saídas
  const grupos = {};
  for (const t of itens) {
    const nome = t.categories?.name || "Sem categoria";
    grupos[nome] = grupos[nome] || { entrada: 0, saida: 0 };
    grupos[nome][t.kind] += t.amount_cents;
  }

  const totalEntrada = itens.filter((t) => t.kind === "entrada").reduce((a, t) => a + t.amount_cents, 0);
  const totalSaida = itens.filter((t) => t.kind === "saida").reduce((a, t) => a + t.amount_cents, 0);

  const linhas = Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0]));

  box.innerHTML = "";
  if (itens.length === 0) {
    box.append(el("p", { class: "empty" }, "Nenhum lançamento neste período."));
    return;
  }

  const tabela = el("table", { class: "tabela" },
    el("thead", {},
      el("tr", {},
        el("th", {}, "Categoria"),
        el("th", { class: "ta-right" }, "Entradas"),
        el("th", { class: "ta-right" }, "Saídas"),
        el("th", { class: "ta-right" }, "Saldo")
      )
    ),
    el("tbody", {},
      ...linhas.map(([nome, v]) =>
        el("tr", {},
          el("td", {}, nome),
          el("td", { class: "ta-right num c-entrada" }, formatBRL(v.entrada)),
          el("td", { class: "ta-right num c-saida" }, formatBRL(v.saida)),
          el("td", { class: "ta-right num" }, formatBRL(v.entrada - v.saida))
        )
      )
    ),
    el("tfoot", {},
      el("tr", {},
        el("td", {}, "Total"),
        el("td", { class: "ta-right num c-entrada" }, formatBRL(totalEntrada)),
        el("td", { class: "ta-right num c-saida" }, formatBRL(totalSaida)),
        el("td", { class: "ta-right num" }, formatBRL(totalEntrada - totalSaida))
      )
    )
  );
  box.append(tabela);
}

// Gera um arquivo CSV e dispara o download (abre no Excel/Google Sheets).
function exportar() {
  if (itensCache.length === 0) return;

  const cabecalho = ["Data", "Tipo", "Categoria", "Descrição", "Valor (R$)"];
  const linhas = itensCache.map((t) => [
    formatDate(t.occurred_on),
    t.kind === "entrada" ? "Entrada" : "Saída",
    t.categories?.name || "",
    (t.description || "").replace(/"/g, '""'),
    (t.amount_cents / 100).toFixed(2).replace(".", ","),
  ]);

  const csv = [cabecalho, ...linhas]
    .map((linha) => linha.map((c) => `"${c}"`).join(";"))
    .join("\n");

  // BOM (\ufeff) faz o Excel abrir os acentos corretamente
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: `fluxo-${periodo.de}-a-${periodo.ate}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
