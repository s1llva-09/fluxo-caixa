// ============================================================================
//  views/dashboard.js — Visão geral do caixa
// ============================================================================

import Chart from "https://esm.sh/chart.js@4/auto";
import { el, $, emptyState, ICONS } from "../ui.js";
import { state, mesAtual } from "../state.js";
import { listarLancamentos } from "../api.js";
import { formatBRL, formatDate } from "../money.js";

let chartRef = null;

export async function renderDashboard(root) {
  root.innerHTML = "";
  root.append(el("div", { class: "loading" }, "Carregando..."));

  const todos = await listarLancamentos({ companyId: state.company.id });

  const saldo = somaSaldo(todos);

  const { de, ate } = mesAtual();
  const doMes = todos.filter((t) => t.occurred_on >= de && t.occurred_on <= ate);
  const entradasMes = somaPorTipo(doMes, "entrada");
  const saidasMes = somaPorTipo(doMes, "saida");
  const resultadoMes = entradasMes - saidasMes;

  const mesAno = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, saudacao()),
        el("p", { class: "page-sub" }, `Resultado de ${mesAno}`)
      )
    ),

    el("section", { class: `saldo ${saldo >= 0 ? "is-pos" : "is-neg"}` },
      el("span", { class: "saldo__label" }, "Saldo atual"),
      el("span", { class: "saldo__value num" }, formatBRL(saldo))
    ),

    el("section", { class: "stats" },
      statCard("Entradas do mês", entradasMes, "entrada"),
      statCard("Saídas do mês", saidasMes, "saida"),
      statCard("Resultado", resultadoMes, resultadoMes >= 0 ? "entrada" : "saida")
    ),

    el("section", { class: "card chart-card" },
      el("h2", { class: "card__title" }, "Últimos 6 meses"),
      el("div", { class: "chart-wrap" }, el("canvas", { id: "chart-meses" }))
    ),

    el("section", { class: "card" },
      el("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;" },
        el("h2", { class: "card__title", style: "margin-bottom:0" }, "Lançamentos recentes"),
        el("button", {
          class: "btn btn--tiny btn--ghost",
          onclick: () => document.querySelector('[data-tela="lancamentos"]')?.click(),
        }, "Ver todos →")
      ),
      listaRecentes(todos.slice(0, 8))
    )
  );

  desenharGrafico(todos);
}

// ---- saudação baseada no horário -------------------------------------------

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// ---- pedacinhos de UI -------------------------------------------------------

function statCard(label, cents, tipo) {
  return el("div", { class: `card stat stat--${tipo}` },
    el("span", { class: "stat__label" }, label),
    el("span", { class: "stat__value num" }, formatBRL(cents))
  );
}

function listaRecentes(itens) {
  if (itens.length === 0) {
    return emptyState("Nenhum lançamento ainda.\nAdicione o primeiro pela tela de Lançamentos.", ICONS.dashboard);
  }
  const lista = el("ul", { class: "tx-list" });
  for (const t of itens) {
    lista.append(
      el("li", { class: `tx tx--${t.kind} ${t.is_reversed ? "is-reversed" : ""}` },
        el("div", { class: "tx__main" },
          el("span", { class: "tx__desc" }, t.description || "(sem descrição)"),
          el("span", { class: "tx__meta" },
            `${formatDate(t.occurred_on)}${t.categories?.name ? " · " + t.categories.name : ""}`)
        ),
        el("span", { class: "tx__value num" },
          (t.kind === "entrada" ? "+ " : "− ") + formatBRL(t.amount_cents))
      )
    );
  }
  return lista;
}

// ---- cálculos ---------------------------------------------------------------

function somaPorTipo(itens, tipo) {
  return itens
    .filter((t) => t.kind === tipo)
    .reduce((acc, t) => acc + t.amount_cents, 0);
}

function somaSaldo(itens) {
  return itens.reduce(
    (acc, t) => acc + (t.kind === "entrada" ? t.amount_cents : -t.amount_cents),
    0
  );
}

// ---- gráfico ----------------------------------------------------------------

function desenharGrafico(todos) {
  const canvas = $("#chart-meses");
  if (!canvas) return;

  const meses = [];
  const base = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    meses.push({
      chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      rotulo: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      entrada: 0,
      saida: 0,
    });
  }
  for (const t of todos) {
    const chave = t.occurred_on.slice(0, 7);
    const m = meses.find((x) => x.chave === chave);
    if (m) m[t.kind] += t.amount_cents;
  }

  if (chartRef) chartRef.destroy();

  const font = "'Plus Jakarta Sans', system-ui, sans-serif";
  const mono = "'JetBrains Mono', monospace";
  const mutedColor = "#8B9E98";
  const gridColor = "rgba(221, 229, 226, 0.8)";

  chartRef = new Chart(canvas, {
    type: "bar",
    data: {
      labels: meses.map((m) => m.rotulo),
      datasets: [
        {
          label: "Entradas",
          data: meses.map((m) => m.entrada / 100),
          backgroundColor: "rgba(7, 206, 138, 0.82)",
          borderRadius: 7,
          borderSkipped: false,
        },
        {
          label: "Saídas",
          data: meses.map((m) => m.saida / 100),
          backgroundColor: "rgba(196, 43, 48, 0.78)",
          borderRadius: 7,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            borderRadius: 3,
            useBorderRadius: true,
            font: { family: font, size: 12 },
            color: mutedColor,
            padding: 20,
          },
        },
        tooltip: {
          backgroundColor: "#0B0F0E",
          titleFont: { family: font, size: 12 },
          bodyFont: { family: mono, size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) =>
              `  ${ctx.dataset.label}: R$ ${ctx.raw.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { font: { family: font, size: 12 }, color: mutedColor },
        },
        y: {
          grid: { color: gridColor },
          border: { display: false, dash: [4, 4] },
          ticks: {
            callback: (v) =>
              "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 0 }),
            font: { family: font, size: 11 },
            color: mutedColor,
          },
        },
      },
    },
  });
}
