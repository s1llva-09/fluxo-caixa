// ============================================================================
//  views/admin.js — Painel do Admin (só o admin acessa)
// ----------------------------------------------------------------------------
//  Lista todos os clientes (empresas), mostra uso e deixa bloquear/liberar o
//  acesso e definir o vencimento da mensalidade. A segurança de verdade está
//  no banco (RLS + funções is_admin): aqui é só a interface.
// ============================================================================

import Chart from "https://esm.sh/chart.js@4/auto";
import { el, $, toast, openModal, closeModal, errorState, skeletonList, senhaInput, metaItem, numCard } from "../ui.js";
import { listarClientesAdmin, definirStatusCliente, atualizarDadosCliente, definirPlanoEmpresa, registrarPagamento, listarPagamentos, receitaPeriodo, receitaMensal } from "../api.js";
import { nomePlano } from "../planos.js";
import { updateEmail, updatePassword } from "../auth.js";
import { state, mesAtual } from "../state.js";
import { renderAdminPermissoes } from "./admin_permissoes.js";
import { formatDate, formatBRL, parseToCents, todayISO } from "../money.js";
import { AVISO_DIAS, venceEmBreve, avisoVenc, ordenarPorUrgencia, variacaoPercentual, rotuloMes } from "../regras.js";

let clientes = [];
let filtro = "";
let filtroStatus = "todos"; // todos | ativos | vencendo | inativos
let receitaMes = 0;
let chartRef = null;
let mesesReceita = 6; // janela do gráfico e da tabela de receita

export async function renderAdmin(root) {
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, "Painel do Admin"),
        el("p", { class: "page-sub" }, "Clientes do Monetta e controle de assinatura")
      ),
      el("div", { class: "page-head__acoes" },
        el("button", { class: "btn btn--ghost", onclick: () => renderAdminPermissoes(root, renderAdmin) }, "Equipe: Permissões"),
        el("button", { class: "btn btn--ghost", onclick: exportarCSV,
          "data-tip": "Baixar a lista de clientes em planilha" }, "↓ Exportar clientes")
      )
    ),
    el("section", { id: "admin-resumo", class: "metrics metrics--admin" }),
    // O gráfico fica junto da placa de MRR: os dois falam de receita, e no fim
    // da página, depois da lista, ninguém relacionava um com o outro.
    el("section", { class: "card" },
      el("div", { class: "card__head" },
        el("h2", { class: "card__title" }, "Receita mês a mês"),
        el("span", { class: "card__hint", id: "rec-comp" }, "Soma das mensalidades recebidas por mês")
      ),
      el("div", { id: "rec-periodo", class: "admin-filtros" }),
      el("div", { class: "chart-wrap" }, el("canvas", { id: "chart-receita" })),
      el("div", { id: "rec-tabela" })
    ),
    el("section", { class: "card" },
      el("div", { class: "card__head" },
        el("h2", { class: "card__title" }, "Clientes"),
        el("span", { class: "card__hint", id: "admin-conta-lista" }),
        buscaInput()
      ),
      el("div", { id: "admin-lista" }, skeletonList(5))
    ),
    secaoConta()
  );
  await carregar();
}

// ---- conta do admin (trocar email / senha) ---------------------------------

function secaoConta() {
  const emailAtual = state.user?.email ?? "";

  // -- email --
  const emailInput = el("input", {
    class: "input", type: "email", placeholder: emailAtual, autocomplete: "email",
  });
  const btnEmail = el("button", { class: "btn btn--primary" }, "Atualizar email");
  const avisoEmail = el("p", { class: "config__sucesso", hidden: "" });
  async function salvarEmail() {
    const v = emailInput.value.trim();
    if (!v) { toast("Digite o novo email", "erro"); return; }
    if (v === emailAtual) { toast("É o mesmo email atual", "info"); return; }
    btnEmail.disabled = true; btnEmail.textContent = "Enviando...";
    try {
      await updateEmail(v);
      avisoEmail.textContent =
        `Enviamos um link de confirmação para ${v}. ` +
        `O email só muda depois que você abrir esse email e clicar no link.`;
      avisoEmail.hidden = false;
      emailInput.value = "";
    } catch (err) {
      toast(traduzErroConta(err), "erro");
    } finally {
      btnEmail.disabled = false; btnEmail.textContent = "Atualizar email";
    }
  }
  btnEmail.addEventListener("click", salvarEmail);

  // -- senha --
  const { wrap: w1, input: s1 } = senhaInput({ placeholder: "Mínimo 6 caracteres", autocomplete: "new-password" });
  const { wrap: w2, input: s2 } = senhaInput({ placeholder: "Repita a nova senha", autocomplete: "new-password" });
  const btnSenha = el("button", { class: "btn btn--primary" }, "Atualizar senha");
  async function salvarSenha() {
    if (s1.value.length < 6) { toast("A senha precisa ter pelo menos 6 caracteres", "erro"); return; }
    if (s1.value !== s2.value) { toast("As senhas não coincidem", "erro"); return; }
    btnSenha.disabled = true; btnSenha.textContent = "Salvando...";
    try {
      await updatePassword(s1.value);
      toast("Senha atualizada!", "ok");
      s1.value = ""; s2.value = "";
    } catch (err) {
      toast(traduzErroConta(err), "erro");
    } finally {
      btnSenha.disabled = false; btnSenha.textContent = "Atualizar senha";
    }
  }
  btnSenha.addEventListener("click", salvarSenha);

  return el("section", { class: "card", style: "margin-top: var(--gap);" },
    el("h2", { class: "card__title" }, "Conta do admin"),
    el("p", { class: "config__hint" },
      `Logado como ${emailAtual}. Trocar o email NÃO tira seu acesso de admin — ele segue a sua conta, não o endereço.`),
    el("label", { class: "field" },
      el("span", { class: "field__label" }, "Novo email"), emailInput),
    el("p", { class: "config__note" },
      "O email não muda na hora: enviamos um link de confirmação, e a troca só " +
      "acontece depois que você clica nele."),
    avisoEmail,
    el("div", { class: "form__actions" }, btnEmail),
    el("hr", { class: "admin-conta__sep" }),
    el("label", { class: "field" },
      el("span", { class: "field__label" }, "Nova senha"), w1),
    el("label", { class: "field" },
      el("span", { class: "field__label" }, "Confirmar nova senha"), w2),
    el("div", { class: "form__actions" }, btnSenha)
  );
}

function traduzErroConta(err) {
  const m = (err?.message || "").toLowerCase();
  if (m.includes("email") && m.includes("taken")) return "Este email já está em uso";
  if (m.includes("same password")) return "A nova senha não pode ser igual à atual";
  if (m.includes("password") && m.includes("6")) return "A senha precisa ter pelo menos 6 caracteres";
  if (m.includes("rate") || m.includes("too many")) return "Muitas tentativas. Aguarde e tente de novo.";
  return "Algo deu errado. Tente de novo.";
}

function buscaInput() {
  const inp = el("input", {
    class: "input admin-busca",
    type: "search",
    placeholder: "Buscar por nome ou email…",
    value: filtro,
  });
  inp.addEventListener("input", () => { filtro = inp.value; desenharLista(); });
  return inp;
}

async function carregar() {
  const box = $("#admin-lista");
  if (!box) return;
  box.innerHTML = "";
  box.append(skeletonList(5));

  try {
    clientes = ordenarPorUrgencia(await listarClientesAdmin());
  } catch (err) {
    console.error(err);
    box.innerHTML = "";
    box.append(errorState("Não foi possível carregar os clientes.", carregar));
    return;
  }
  // Receita do mês (não-fatal: se falhar, mostra 0).
  try {
    const { de, ate } = mesAtual();
    receitaMes = await receitaPeriodo(de, ate);
  } catch (err) {
    console.error(err);
    receitaMes = 0;
  }
  desenharResumo();
  desenharLista();
  desenharPeriodoReceita();
  carregarReceita();
}

// Receita mês a mês (não-fatal: se falhar, a tela do admin continua servindo).
async function carregarReceita() {
  const tabela = $("#rec-tabela");
  if (tabela) { tabela.innerHTML = ""; tabela.append(skeletonList(3)); }
  try {
    const serie = await receitaMensal(mesesReceita);
    desenharGraficoReceita(serie);
    desenharTabelaReceita(serie);
  } catch (err) {
    console.error(err);
    if (tabela) {
      tabela.innerHTML = "";
      tabela.append(errorState("Não foi possível carregar a receita.", carregarReceita));
    }
  }
}

// Janela: 6, 12 ou 24 meses. A RPC já aceita o número, era só oferecer.
function desenharPeriodoReceita() {
  const box = $("#rec-periodo");
  if (!box) return;
  box.innerHTML = "";
  for (const n of [6, 12, 24]) {
    box.append(el("button", {
      class: `chip ${mesesReceita === n ? "chip--on" : ""}`,
      "aria-pressed": mesesReceita === n ? "true" : "false",
      onclick: () => { mesesReceita = n; desenharPeriodoReceita(); carregarReceita(); },
    }, `${n} meses`));
  }
}

// O gráfico dá a forma; a tabela dá o número. Quem cobra mensalidade precisa
// do valor exato do mês, não da altura da barra.
function desenharTabelaReceita(serie) {
  const box = $("#rec-tabela");
  if (!box) return;
  box.innerHTML = "";

  // A RPC devolve do mais antigo pro mais novo; a leitura é ao contrário.
  const linhas = [...serie].reverse();
  const total = linhas.reduce((s, p) => s + (p.total || 0), 0);
  const meses = linhas.length || 1;

  const tabela = el("table", { class: "tabela" },
    el("thead", {},
      el("tr", {},
        el("th", {}, "Mês"),
        el("th", { class: "ta-right" }, "Recebido"),
        el("th", { class: "ta-right" }, "vs. anterior")
      )
    ),
    el("tbody", {},
      ...linhas.map((p, i) => {
        const atual = p.total || 0;
        const pct = variacaoPercentual(atual, linhas[i + 1]?.total || 0);
        return el("tr", {},
          el("td", {}, rotuloMes(String(p.mes).slice(0, 7))),
          el("td", { class: "ta-right num" }, formatBRL(atual)),
          el("td", { class: `ta-right num ${pct == null ? "" : pct >= 0 ? "c-entrada" : "c-saida"}` },
            pct == null ? "—" : `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}%`)
        );
      })
    ),
    el("tfoot", {},
      el("tr", {},
        el("td", {}, `Total ${meses}m`),
        el("td", { class: "ta-right num" }, formatBRL(total)),
        el("td", { class: "ta-right num" }, `média ${formatBRL(Math.round(total / meses))}`)
      )
    )
  );
  const wrap = el("div", { class: "tabela-wrap" });
  wrap.append(tabela);
  box.append(wrap);
}

// ---- gráfico de receita -----------------------------------------------------

function desenharGraficoReceita(serie) {
  const canvas = $("#chart-receita");
  if (!canvas) return;
  if (chartRef) chartRef.destroy();

  const labels = serie.map((p) =>
    new Date(p.mes + "T00:00:00").toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""));
  const valores = serie.map((p) => (p.total || 0) / 100);

  // Comparativo: este mês vs mês passado (no hint do card).
  const hint = $("#rec-comp");
  if (hint && serie.length) {
    const atual = serie[serie.length - 1].total || 0;
    const anterior = serie.length > 1 ? (serie[serie.length - 2].total || 0) : 0;
    let txt = `Este mês: ${formatBRL(atual)}`;
    const pct = variacaoPercentual(atual, anterior);
    if (pct != null) {
      txt += ` · ${pct >= 0 ? "+" : "−"}${Math.abs(pct)}% vs mês passado (${formatBRL(anterior)})`;
    } else {
      txt += ` · mês passado: ${formatBRL(anterior)}`;
    }
    hint.textContent = txt;
  }

  const css = getComputedStyle(document.documentElement);
  const v = (nome, fb) => (css.getPropertyValue(nome).trim() || fb);
  // Barra no violeta da marca: ele dá 4.8:1 sobre a superfície branca, bem
  // acima dos 3:1 exigidos de elemento não-textual, então funciona como área
  // preenchida — o que o accent do tema anterior não permitia.
  const cor = v("--c-accent", "#9A3FF0");
  const ink = v("--c-ink", "#141726");
  const surface = v("--c-surface", "#FFFFFF");
  const muted = v("--c-muted", "#5E6178");
  const grid = v("--c-line", "rgba(20,23,38,0.12)");
  const eixo = v("--c-line-strong", "rgba(20,23,38,0.26)");
  const font = "'Archivo', system-ui, sans-serif";

  chartRef = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Receita", data: valores, backgroundColor: cor, borderRadius: 4, borderSkipped: false }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: ink,
          titleColor: surface,
          bodyColor: surface,
          padding: 10,
          cornerRadius: 6,
          displayColors: false,
          titleFont: { family: font, size: 11, weight: 700 },
          bodyFont: { family: font, size: 12 },
          // formatBRL e não "R$" fixo: a moeda é configurável no app.
          callbacks: { label: (ctx) => formatBRL(Math.round(ctx.raw * 100)) },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: eixo, width: 1 },
          ticks: { font: { family: font, size: 11, weight: 700 }, color: muted },
        },
        y: {
          grid: { color: grid },
          border: { display: false },
          ticks: {
            callback: (val) => formatBRL(Math.round(val * 100)),
            font: { family: font, size: 11 },
            color: muted,
          },
        },
      },
    },
  });
}

// ---- resumo (cards de cima) ------------------------------------------------

function desenharResumo() {
  const box = $("#admin-resumo");
  if (!box) return;
  const total = clientes.length;
  const ativos = clientes.filter((c) => c.active).length;
  const inativos = total - ativos;
  const vencendo = clientes.filter((c) => venceEmBreve(c)).length;
  // MRR = soma das mensalidades dos clientes ativos (receita recorrente prevista).
  const mrr = clientes.reduce((s, c) => s + (c.active ? (c.plan_value_cents || 0) : 0), 0);
  box.innerHTML = "";
  // Seis números do mesmo tamanho diziam que os seis valem o mesmo. O MRR é o
  // que se abre esta tela pra ver — vira placa, e as contagens viram a letra
  // miúda embaixo.
  box.append(
    numCard("MRR (recorrente)", formatBRL(mrr), "", {
      placa: true, foot: `Recebido neste mês: ${formatBRL(receitaMes)}`,
    }),
    filtroCard("Clientes", total, "", "todos"),
    filtroCard("Ativos", ativos, "entrada", "ativos"),
    filtroCard(`Vencendo (${AVISO_DIAS}d)`, vencendo, vencendo > 0 ? "alerta" : "", "vencendo"),
    filtroCard("Bloqueados / vencidos", inativos, inativos > 0 ? "saida" : "", "inativos")
  );
}

// ---- filtro por status ------------------------------------------------------

// Aplica o filtro de status escolhido na lista.
function passaStatus(c) {
  if (filtroStatus === "ativos") return !!c.active;
  if (filtroStatus === "inativos") return !c.active;
  if (filtroStatus === "vencendo") return venceEmBreve(c);
  return true;
}

// Soma 1 mês a uma data ISO (YYYY-MM-DD), devolvendo ISO.
function addUmMes(iso) {
  return addMeses(iso, 1);
}

// Soma N meses a uma data ISO (a base é a data dada, ou hoje).
function addMeses(iso, n) {
  const base = new Date((iso || todayISO()) + "T00:00:00");
  base.setMonth(base.getMonth() + n);
  return base.toISOString().slice(0, 10);
}

// ---- exportar clientes em CSV ----------------------------------------------

function exportarCSV() {
  if (!clientes.length) { toast("Nenhum cliente para exportar", "info"); return; }
  const cab = ["Cliente", "Email", "Status", "Vencimento", "Mensalidade (R$)", "Lançamentos", "Última atividade", "Observações"];
  const linhas = clientes.map((c) => [
    c.name || "",
    c.owner_email || "",
    statusInfo(c).label,
    c.plan_until ? formatDate(c.plan_until) : "",
    c.plan_value_cents != null ? (c.plan_value_cents / 100).toFixed(2).replace(".", ",") : "",
    String(c.tx_count ?? 0),
    c.last_activity ? formatDate(c.last_activity) : "",
    (c.notes || "").replace(/"/g, '""'),
  ]);
  const csv = [cab, ...linhas].map((l) => l.map((x) => `"${x}"`).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: `clientes-${todayISO()}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// O card É o filtro. Antes ele contava "3 vencendo" e o dono tinha que descer
// e clicar num chip escrito a mesma coisa — dois controles pro mesmo comando.
function filtroCard(label, valor, tipo, filtro) {
  return numCard(label, valor, tipo, {
    ativo: filtroStatus === filtro,
    onClick: () => { filtroStatus = filtro; desenharResumo(); desenharLista(); },
  });
}

// ---- lista de clientes ------------------------------------------------------

function desenharLista() {
  const box = $("#admin-lista");
  if (!box) return;

  const termo = filtro.trim().toLowerCase();
  const itens = clientes.filter((c) => {
    if (!passaStatus(c)) return false;
    if (!termo) return true;
    return (c.name || "").toLowerCase().includes(termo) ||
           (c.owner_email || "").toLowerCase().includes(termo);
  });

  // Sem isso, filtrar por um card some com clientes da lista sem dizer por quê.
  const conta = $("#admin-conta-lista");
  if (conta) {
    conta.textContent = itens.length === clientes.length
      ? `${clientes.length} no total`
      : `${itens.length} de ${clientes.length}`;
  }

  box.innerHTML = "";
  if (itens.length === 0) {
    box.append(el("div", { class: "empty" },
      clientes.length === 0 ? "Nenhum cliente ainda." : "Nenhum cliente encontrado."));
    return;
  }

  const lista = el("ul", { class: "admin-list" });
  for (const c of itens) {
    const st = statusInfo(c);
    lista.append(
      el("li", { class: "admin-cli" },
        el("div", { class: "admin-cli__main" },
          el("div", { class: "admin-cli__top" },
            el("span", { class: "admin-cli__name" }, c.name || "(sem nome)"),
            el("span", { class: st.cls }, st.label),
            venceEmBreve(c) ? el("span", { class: "badge badge--alerta" }, avisoVenc(c)) : null
          ),
          el("div", { class: "admin-cli__email" }, c.owner_email || "—"),
          // metaItem devolve null sem valor: campo vazio não vira coluna de
          // travessão, que era ruído com aparência de dado.
          el("div", { class: "meta-grid" },
            metaItem("Mensalidade", c.plan_value_cents != null ? formatBRL(c.plan_value_cents) : null),
            metaItem("Vencimento", c.plan_until ? formatDate(c.plan_until) : null),
            metaItem("Lançamentos", String(c.tx_count ?? 0)),
            metaItem("Última atividade", c.last_activity ? formatDate(c.last_activity) : null),
            metaItem("Cadastro", c.created_at ? formatDate(c.created_at.slice(0, 10)) : null)
          )
        ),
        el("div", { class: "admin-cli__actions" },
          el("button", { class: "btn btn--ghost btn--tiny", onclick: () => gerenciar(c) }, "Gerenciar")
        )
      )
    );
  }
  box.append(lista);
}

// status: 'blocked' manual; ou 'active' mas com plan_until vencido = "Vencido".
function statusInfo(c) {
  if (c.status === "blocked") return { label: "Bloqueado", cls: "badge badge--saida" };
  if (c.plan_until && c.plan_until < todayISO()) return { label: "Vencido", cls: "badge badge--saida" };
  return { label: "Ativo", cls: "badge" };
}

// ---- modal de gerenciar ----------------------------------------------------

function gerenciar(c) {
  // estado local do modal
  let status = c.status === "blocked" ? "blocked" : "active";

  const segAtivo = el("button", { class: "seg" }, "Ativo");
  const segBloq = el("button", { class: "seg" }, "Bloqueado");
  function pintarSeg() {
    segAtivo.classList.toggle("seg--on", status === "active");
    segBloq.classList.toggle("seg--on", status === "blocked");
  }
  segAtivo.addEventListener("click", () => { status = "active"; pintarSeg(); });
  segBloq.addEventListener("click", () => { status = "blocked"; pintarSeg(); });
  pintarSeg();

  const dataInput = el("input", { class: "input", type: "date", value: c.plan_until || "" });

  // Reflete mudanças no objeto em memória + nos campos do modal.
  function aplicarNaMemoria(novoStatus, novoVenc) {
    Object.assign(c, {
      status: novoStatus,
      plan_until: novoVenc,
      active: novoStatus === "active" && (!novoVenc || novoVenc >= todayISO()),
    });
    dataInput.value = c.plan_until || "";
    status = c.status === "blocked" ? "blocked" : "active";
    pintarSeg();
  }

  // ---- plano e anotações ----
  const valorPadrao = c.plan_value_cents != null
    ? (c.plan_value_cents / 100).toFixed(2).replace(".", ",") : "";
  const planValorInput = el("input", { class: "input", inputmode: "decimal", placeholder: "Valor por mês (opcional)", value: valorPadrao });
  const notasInput = el("textarea", { class: "input admin-notas", rows: "3", placeholder: "Anotações sobre o cliente (só você vê)" }, c.notes || "");
  const planoSel = el("select", { class: "input" },
    el("option", { value: "trial" }, "Trial (acesso total)"),
    el("option", { value: "pro" }, "Pro"),
    el("option", { value: "empresarial" }, "Empresarial")
  );
  planoSel.value = c.plan || "trial";

  // UM salvar pro cadastro inteiro. Eram três botões — acesso, plano,
  // anotações — no mesmo scroll, e nenhum dizia o que exatamente ia gravar.
  // São RPCs separadas por causa do banco, não porque sejam decisões
  // diferentes: cada uma só é chamada se o que ela cuida mudou.
  const btnSalvar = el("button", { class: "btn btn--primary" }, "Salvar alterações");
  async function salvar() {
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
    try {
      let mudou = false;
      const venc = dataInput.value || null;
      const statusAtual = c.status === "blocked" ? "blocked" : "active";
      if (status !== statusAtual || venc !== (c.plan_until || null)) {
        const at = await definirStatusCliente(c.id, status, venc);
        aplicarNaMemoria(at.status, at.plan_until);
        mudou = true;
      }
      const cents = parseToCents(planValorInput.value); // null se vazio
      const notas = notasInput.value.trim();
      if (cents !== (c.plan_value_cents ?? null) || notas !== (c.notes || "")) {
        const at = await atualizarDadosCliente(c.id, cents, notas);
        Object.assign(c, { plan_value_cents: at.plan_value_cents, notes: at.notes });
        mudou = true;
      }
      if (planoSel.value !== (c.plan || "trial")) {
        await definirPlanoEmpresa(c.id, planoSel.value);
        c.plan = planoSel.value;
        mudou = true;
      }
      toast(mudou ? "Cliente atualizado" : "Nenhuma alteração", mudou ? "ok" : "info");
      desenharResumo();
      desenharLista();
    } catch (err) {
      console.error(err);
      toast("Não foi possível salvar", "erro");
    } finally {
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar alterações";
    }
  }
  btnSalvar.addEventListener("click", salvar);

  // ---- pagamentos ----
  const baseVenc = (c.plan_until && c.plan_until >= todayISO()) ? c.plan_until : todayISO();
  const valorInput = el("input", { class: "input", inputmode: "decimal", placeholder: "Valor (opcional)", value: valorPadrao });
  const dataPagInput = el("input", { class: "input", type: "date", value: todayISO() });
  const renovarInput = el("input", { class: "input", type: "date", value: addUmMes(baseVenc) });
  const renovarRapido = el("div", { class: "admin-renew" },
    ...[["+1 mês", 1], ["+3 meses", 3], ["+1 ano", 12]].map(([lbl, n]) =>
      el("button", { type: "button", class: "btn btn--ghost btn--tiny",
        onclick: () => { renovarInput.value = addMeses(baseVenc, n); } }, lbl))
  );
  const obsInput = el("input", { class: "input", placeholder: "Observação (opcional)" });
  const btnPagar = el("button", { class: "btn btn--primary" }, "Registrar pagamento");
  const histBox = el("div", { class: "admin-pay__hist" }, el("div", { class: "loading" }, "Carregando..."));

  async function carregarHist() {
    histBox.innerHTML = "";
    try {
      const pags = await listarPagamentos(c.id);
      if (pags.length === 0) {
        histBox.append(el("p", { class: "admin-pay__vazio" }, "Nenhum pagamento registrado ainda."));
        return;
      }
      const ul = el("ul", { class: "admin-pay__list" });
      for (const p of pags) {
        ul.append(
          el("li", { class: "admin-pay__item" },
            el("span", { class: "admin-pay__data" }, formatDate(p.paid_on)),
            el("span", { class: "admin-pay__val num" }, p.amount_cents != null ? formatBRL(p.amount_cents) : "—"),
            p.note ? el("span", { class: "admin-pay__obs" }, p.note) : null
          )
        );
      }
      histBox.append(ul);
    } catch (err) {
      console.error(err);
      histBox.append(el("p", { class: "admin-pay__vazio" }, "Não foi possível carregar o histórico."));
    }
  }

  async function pagar() {
    const cents = parseToCents(valorInput.value); // null se vazio/!número (valor é opcional)
    btnPagar.disabled = true;
    btnPagar.textContent = "Registrando...";
    try {
      await registrarPagamento(
        c.id, cents, dataPagInput.value || todayISO(), obsInput.value.trim(), renovarInput.value || null
      );
      if (renovarInput.value) aplicarNaMemoria("active", renovarInput.value);
      valorInput.value = "";
      obsInput.value = "";
      toast("Pagamento registrado", "ok");
      desenharResumo();
      desenharLista();
      carregarHist();
    } catch (err) {
      console.error(err);
      toast("Não foi possível registrar o pagamento", "erro");
    } finally {
      btnPagar.disabled = false;
      btnPagar.textContent = "Registrar pagamento";
    }
  }
  btnPagar.addEventListener("click", pagar);

  openModal("Gerenciar cliente",
    el("div", {},
      el("div", { class: "admin-modal__id" },
        el("div", { class: "admin-cli__name" }, c.name || "(sem nome)"),
        el("div", { class: "admin-cli__email" }, c.owner_email || "—")
      ),

      el("h3", { class: "admin-pay__titulo" }, "Acesso e plano"),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Acesso"),
        el("div", { class: "seg-group", style: "margin-bottom:0" }, segAtivo, segBloq)
      ),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Mensalidade vence em (opcional)"),
        dataInput
      ),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Plano (libera módulos)"), planoSel),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Valor da mensalidade"), planValorInput),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Anotações"), notasInput),
      el("div", { class: "form__actions" }, btnSalvar),

      el("hr", { class: "admin-conta__sep" }),

      // Pagamento continua com botão próprio: não é um ajuste de cadastro, é
      // um registro novo — e desfazer um é bem mais caro.
      el("h3", { class: "admin-pay__titulo" }, "Registrar pagamento"),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Valor"), valorInput),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Data do pagamento"), dataPagInput)
      ),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Renovar acesso até"), renovarInput),
      renovarRapido,
      el("label", { class: "field", style: "margin-top:14px" },
        el("span", { class: "field__label" }, "Observação"), obsInput),
      el("div", { class: "form__actions" }, btnPagar),

      el("hr", { class: "admin-conta__sep" }),
      el("h3", { class: "admin-pay__titulo" }, "Histórico de pagamentos"),
      histBox,

      el("div", { class: "form__actions", style: "margin-top:18px" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Fechar")
      )
    )
  );

  carregarHist();
}
