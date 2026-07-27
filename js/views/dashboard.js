// ============================================================================
//  views/dashboard.js — Visão geral do caixa
// ----------------------------------------------------------------------------
//  Layout inspirado no design de referência: cards de resumo, gráfico de área
//  "Fluxo de caixa", painel de "Composição de despesas" e lançamentos recentes.
//  Mantém a identidade Monetta (roxo) e as cores semânticas (verde/vermelho).
// ============================================================================

import Chart from "https://esm.sh/chart.js@4/auto";
import { el, $, emptyState, errorState, ICONS } from "../ui.js";
import { state, mesAtual } from "../state.js";
import { listarLancamentos, listarContas } from "../api.js";
import { formatBRL, formatDate } from "../money.js";

let chartRef = null;

export async function renderDashboard(root) {
  root.innerHTML = "";
  root.append(dashSkeleton());

  let todos;
  try {
    todos = await listarLancamentos({ companyId: state.company.id });
  } catch (err) {
    console.error(err);
    root.innerHTML = "";
    root.append(errorState("Não foi possível carregar o painel.", () => renderDashboard(root)));
    return;
  }

  const saldo = somaSaldo(todos);

  // Contas em aberto (não-fatal: se a migração não rodou ainda, ignora).
  let pendentes = [];
  try {
    pendentes = await listarContas(state.company.id, "pending");
  } catch (err) {
    console.error("Contas:", err);
  }
  const aReceber = pendentes.filter((c) => c.kind === "entrada").reduce((s, c) => s + c.amount_cents, 0);
  const aPagar = pendentes.filter((c) => c.kind === "saida").reduce((s, c) => s + c.amount_cents, 0);

  const { de, ate } = mesAtual();
  const doMes = todos.filter((t) => t.occurred_on >= de && t.occurred_on <= ate);
  const entradasMes = somaPorTipo(doMes, "entrada");
  const saidasMes = somaPorTipo(doMes, "saida");
  const resultadoMes = entradasMes - saidasMes;

  // Mês passado (pra tendência "vs mês passado").
  const mp = mesPassado();
  const doMesPassado = todos.filter((t) => t.occurred_on >= mp.de && t.occurred_on <= mp.ate);
  const entradasAnt = somaPorTipo(doMesPassado, "entrada");
  const saidasAnt = somaPorTipo(doMesPassado, "saida");

  const mesAno = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  root.innerHTML = "";
  root.append(...[
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, saudacao()),
        el("p", { class: "page-sub" }, `Aqui está o resumo de ${mesAno}`)
      ),
      el("button", {
        class: "btn btn--primary",
        onclick: () => document.querySelector('[data-tela="lancamentos"]')?.click(),
      }, "+ Novo lançamento")
    ),

    // ---- cards de resumo ----
    el("section", { class: "metrics" },
      metricCard("Saldo total", saldo, "saldo", deltaFoot(resultadoMes)),
      metricCard("Entradas do mês", entradasMes, "entrada", trendFoot(entradasMes, entradasAnt, "entrada")),
      metricCard("Saídas do mês", saidasMes, "saida", trendFoot(saidasMes, saidasAnt, "saida"))
    ),

    // ---- gráfico + composição ----
    el("section", { class: "dash-grid" },
      el("div", { class: "card chart-card" },
        el("div", { class: "card__head" },
          el("h2", { class: "card__title" }, "Fluxo de caixa"),
          el("span", { class: "card__hint" }, "Últimos 6 meses")
        ),
        el("div", { class: "chart-wrap" }, el("canvas", { id: "chart-meses" }))
      ),
      el("div", { class: "card" },
        el("div", { class: "card__head" },
          el("h2", { class: "card__title" }, "Composição de despesas"),
          el("span", { class: "card__hint" }, "Este mês")
        ),
        composicaoDespesas(doMes)
      )
    ),

    // ---- contas em aberto (só se houver) ----
    (aReceber || aPagar)
      ? el("section", { class: "metrics metrics--3" },
          metricCard("A receber", aReceber, "entrada"),
          metricCard("A pagar", aPagar, "saida"),
          (() => {
            const proj = saldo + aReceber - aPagar;
            return metricCard("Saldo projetado", proj, proj >= 0 ? "entrada" : "saida");
          })()
        )
      : null,

    // ---- lançamentos recentes ----
    el("section", { class: "card" },
      el("div", { class: "card__head" },
        el("h2", { class: "card__title" }, "Lançamentos recentes"),
        el("button", {
          class: "btn btn--tiny btn--ghost",
          onclick: () => document.querySelector('[data-tela="lancamentos"]')?.click(),
        }, "Ver todos →")
      ),
      listaRecentes(todos.slice(0, 6))
    )
  ].filter(Boolean));

  desenharGrafico(todos);
}

// ---- skeleton de carregamento ----------------------------------------------

function dashSkeleton() {
  const metric = () => el("div", { class: "card metric" },
    el("div", { class: "sk sk--line sk--w40" }),
    el("div", { class: "sk sk--block", style: "height:28px;width:65%;margin-top:6px;" }),
    el("div", { class: "sk sk--line sk--w24", style: "margin-top:6px;" })
  );
  return el("div", { class: "dash-skeleton", "aria-hidden": "true" },
    el("section", { class: "metrics" }, metric(), metric(), metric()),
    el("section", { class: "dash-grid" },
      el("div", { class: "card" },
        el("div", { class: "sk sk--line sk--w24", style: "margin-bottom:20px;" }),
        el("div", { class: "sk sk--block", style: "height:264px;" })
      ),
      el("div", { class: "card" },
        el("div", { class: "sk sk--line sk--w40", style: "margin-bottom:20px;" }),
        el("div", { class: "sk sk--block", style: "height:200px;" })
      )
    )
  );
}

// ---- saudação --------------------------------------------------------------

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// ---- cards de resumo (metric) ----------------------------------------------

const METRIC_ICONS = {
  saldo:   `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`,
  entrada: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`,
  saida:   `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>`,
};

function metricCard(label, cents, tipo, foot) {
  const cls = tipo === "entrada" || tipo === "saida" ? `metric--${tipo}` : "";
  return el("div", { class: `card metric ${cls}` },
    el("div", { class: "metric__head" },
      el("span", { class: "metric__label" }, label),
      METRIC_ICONS[tipo]
        ? el("span", { class: `metric__icon metric__icon--${tipo}`, html: METRIC_ICONS[tipo] })
        : null
    ),
    el("span", { class: "metric__value num" }, formatBRL(cents)),
    foot || null
  );
}

// Rodapé do card Saldo: resultado do mês (▲/▼ R$ X este mês).
function deltaFoot(cents) {
  if (!cents) return el("span", { class: "metric__foot" }, "Sem movimento este mês");
  const pos = cents > 0;
  return el("span", { class: `metric__foot ${pos ? "is-up" : "is-down"}` },
    `${pos ? "▲" : "▼"} ${formatBRL(Math.abs(cents))} este mês`);
}

// Rodapé de tendência vs mês passado. Pra saídas, subir é "ruim" (vermelho).
function trendFoot(atual, anterior, tipo) {
  if (!anterior) {
    return el("span", { class: "metric__foot metric__foot--muted" },
      atual ? "Sem base do mês passado" : "Sem movimento");
  }
  const pct = ((atual - anterior) / anterior) * 100;
  const subiu = pct >= 0;
  const bom = tipo === "entrada" ? subiu : !subiu; // entrada subir = bom; saída subir = ruim
  return el("span", { class: `metric__foot ${bom ? "is-up" : "is-down"}` },
    `${subiu ? "▲" : "▼"} ${Math.abs(pct).toFixed(1).replace(".", ",")}% vs mês passado`);
}

// ---- composição de despesas ------------------------------------------------

function composicaoDespesas(doMes) {
  const saidas = doMes.filter((t) => t.kind === "saida");
  const total = saidas.reduce((s, t) => s + t.amount_cents, 0);
  if (total === 0) {
    return el("p", { class: "config__hint", style: "margin:0" }, "Nenhuma saída registrada este mês.");
  }
  const grupos = {};
  for (const t of saidas) {
    const nome = t.categories?.name || "Sem categoria";
    grupos[nome] = (grupos[nome] || 0) + t.amount_cents;
  }
  const linhas = Object.entries(grupos).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const box = el("div", { class: "compo" });
  for (const [nome, valor] of linhas) {
    const pct = Math.round((valor / total) * 100);
    box.append(
      el("div", { class: "compo__item" },
        el("div", { class: "compo__top" },
          el("span", { class: "compo__nome" }, nome),
          el("span", { class: "compo__val num" }, formatBRL(valor))
        ),
        el("div", { class: "compo__bar" }, el("div", { class: "compo__fill", style: `width:${pct}%` })),
        el("span", { class: "compo__pct" }, `${pct}%`)
      )
    );
  }
  return box;
}

// ---- lançamentos recentes --------------------------------------------------

function listaRecentes(itens) {
  if (itens.length === 0) {
    const cta = el("button", {
      class: "btn btn--primary",
      style: "margin-top: 12px;",
      onclick: () => document.querySelector('[data-tela="lancamentos"]')?.click(),
    }, "+ Registrar primeiro lançamento");
    return el("div", { class: "empty-state" },
      el("div", { class: "empty-state__icon", html: ICONS.dashboard }),
      el("p", { class: "empty-state__text" }, "Nenhum lançamento ainda. Comece registrando uma entrada ou saída."),
      cta
    );
  }
  const lista = el("ul", { class: "tx-list" });
  for (const t of itens) {
    lista.append(
      el("li", { class: `tx tx--${t.kind} ${t.is_reversed ? "is-reversed" : ""}` },
        el("div", { class: "tx__main" },
          el("span", { class: "tx__desc" }, el("span", {}, t.description || "(sem descrição)")),
          el("span", { class: "tx__meta" },
            `${formatDate(t.occurred_on)}${t.categories?.name ? " · " + t.categories.name : ""}${t.party_name ? " · " + t.party_name : ""}`)
        ),
        el("span", { class: "tx__value num" },
          (t.kind === "entrada" ? "+ " : "− ") + formatBRL(t.amount_cents))
      )
    );
  }
  return lista;
}

// ---- cálculos --------------------------------------------------------------

function somaPorTipo(itens, tipo) {
  return itens.filter((t) => t.kind === tipo).reduce((acc, t) => acc + t.amount_cents, 0);
}

function somaSaldo(itens) {
  return itens.reduce((acc, t) => acc + (t.kind === "entrada" ? t.amount_cents : -t.amount_cents), 0);
}

function mesPassado() {
  const hoje = new Date();
  const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { de: iso(ini), ate: iso(fim) };
}

// ---- gráfico (área) --------------------------------------------------------

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

  const font = "'Inter', system-ui, sans-serif";
  const css = getComputedStyle(document.documentElement);
  const v = (nome, fallback) => (css.getPropertyValue(nome).trim() || fallback);
  const mutedColor = v("--c-muted", "#8B9E98");
  const gridColor = v("--c-border", "rgba(221,229,226,0.8)");
  const corEntrada = v("--c-entrada", "#10B981");
  const corSaida = v("--c-saida", "#EF4444");

  const ctx = canvas.getContext("2d");
  const grad = (cor) => {
    const g = ctx.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, cor + "44");
    g.addColorStop(1, cor + "00");
    return g;
  };

  chartRef = new Chart(canvas, {
    type: "line",
    data: {
      labels: meses.map((m) => m.rotulo),
      datasets: [
        {
          label: "Entradas",
          data: meses.map((m) => m.entrada / 100),
          borderColor: corEntrada,
          backgroundColor: grad(corEntrada),
          fill: true, tension: 0.35, borderWidth: 2.5,
          pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: corEntrada,
        },
        {
          label: "Saídas",
          data: meses.map((m) => m.saida / 100),
          borderColor: corSaida,
          backgroundColor: grad(corSaida),
          fill: true, tension: 0.35, borderWidth: 2.5,
          pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: corSaida,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 9, boxHeight: 9, borderRadius: 3, useBorderRadius: true,
            font: { family: font, size: 12 }, color: mutedColor, padding: 18,
          },
        },
        tooltip: {
          backgroundColor: "#1E293B", titleFont: { family: font, size: 12 },
          bodyFont: { family: font, size: 12 }, padding: 12, cornerRadius: 8,
          callbacks: {
            label: (c) => `  ${c.dataset.label}: R$ ${c.raw.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { font: { family: font, size: 12 }, color: mutedColor } },
        y: {
          grid: { color: gridColor }, border: { display: false },
          ticks: {
            callback: (val) => "R$ " + val.toLocaleString("pt-BR", { minimumFractionDigits: 0 }),
            font: { family: font, size: 11 }, color: mutedColor, maxTicksLimit: 5,
          },
        },
      },
    },
  });
}
