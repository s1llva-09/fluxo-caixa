// ============================================================================
//  views/dashboard.js — Visão geral do caixa
// ============================================================================
//  Mostra o saldo atual, os totais do mês, um gráfico dos últimos meses e
//  os lançamentos mais recentes. É a primeira tela que o dono vê.
// ============================================================================

import Chart from "https://esm.sh/chart.js@4/auto";
import { el, $ } from "../ui.js";
import { state, mesAtual } from "../state.js";
import { listarLancamentos } from "../api.js";
import { formatBRL, formatDate } from "../money.js";

let chartRef = null; // guarda o gráfico pra poder destruir antes de redesenhar

export async function renderDashboard(root) {
  root.innerHTML = "";
  root.append(el("div", { class: "loading" }, "Carregando..."));

  // Busca TODOS os lançamentos da empresa (pra calcular saldo e gráfico).
  const todos = await listarLancamentos({ companyId: state.company.id });

  // Saldo geral = soma de tudo que entrou menos tudo que saiu (em centavos).
  const saldo = somaSaldo(todos);

  // Totais do mês atual
  const { de, ate } = mesAtual();
  const doMes = todos.filter((t) => t.occurred_on >= de && t.occurred_on <= ate);
  const entradasMes = somaPorTipo(doMes, "entrada");
  const saidasMes = somaPorTipo(doMes, "saida");
  const resultadoMes = entradasMes - saidasMes;

  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head" },
      el("h1", { class: "page-title" }, "Dashboard"),
      el("p", { class: "page-sub" }, "Visão geral do seu caixa")
    ),

    // Cartão de destaque: o saldo atual
    el("section", { class: `saldo ${saldo >= 0 ? "is-pos" : "is-neg"}` },
      el("span", { class: "saldo__label" }, "Saldo atual"),
      el("span", { class: "saldo__value num" }, formatBRL(saldo))
    ),

    // Três indicadores do mês
    el("section", { class: "stats" },
      statCard("Entradas do mês", entradasMes, "entrada"),
      statCard("Saídas do mês", saidasMes, "saida"),
      statCard("Resultado do mês", resultadoMes, resultadoMes >= 0 ? "entrada" : "saida")
    ),

    // Gráfico dos últimos 6 meses
    el("section", { class: "card chart-card" },
      el("h2", { class: "card__title" }, "Últimos 6 meses"),
      el("div", { class: "chart-wrap" }, el("canvas", { id: "chart-meses" }))
    ),

    // Últimos lançamentos
    el("section", { class: "card" },
      el("h2", { class: "card__title" }, "Últimos lançamentos"),
      listaRecentes(todos.slice(0, 8))
    )
  );

  desenharGrafico(todos);
}

// ---- pedacinhos de UI ------------------------------------------------------

function statCard(label, cents, tipo) {
  return el("div", { class: `card stat stat--${tipo}` },
    el("span", { class: "stat__label" }, label),
    el("span", { class: "stat__value num" }, formatBRL(cents))
  );
}

function listaRecentes(itens) {
  if (itens.length === 0) {
    return el("p", { class: "empty" }, "Nenhum lançamento ainda.");
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

  // Monta os últimos 6 meses (rótulos + somas)
  const meses = [];
  const base = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    meses.push({
      chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      rotulo: d.toLocaleDateString("pt-BR", { month: "short" }),
      entrada: 0,
      saida: 0,
    });
  }
  for (const t of todos) {
    const chave = t.occurred_on.slice(0, 7); // "YYYY-MM"
    const m = meses.find((x) => x.chave === chave);
    if (m) m[t.kind] += t.amount_cents;
  }

  if (chartRef) chartRef.destroy();
  const css = getComputedStyle(document.documentElement);
  const verde = css.getPropertyValue("--c-entrada").trim();
  const vermelho = css.getPropertyValue("--c-saida").trim();

  chartRef = new Chart(canvas, {
    type: "bar",
    data: {
      labels: meses.map((m) => m.rotulo),
      datasets: [
        { label: "Entradas", data: meses.map((m) => m.entrada / 100), backgroundColor: verde, borderRadius: 6 },
        { label: "Saídas", data: meses.map((m) => m.saida / 100), backgroundColor: vermelho, borderRadius: 6 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: {
          ticks: {
            callback: (v) => "R$ " + v.toLocaleString("pt-BR"),
          },
        },
      },
    },
  });
}
