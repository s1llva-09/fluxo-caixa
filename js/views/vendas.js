// ============================================================================
//  views/vendas.js — Vendas (módulo ERP)
// ----------------------------------------------------------------------------
//  Registra uma venda (cliente + valor). A venda gera uma ENTRADA no caixa
//  automaticamente; cancelar a venda estorna essa entrada.
// ============================================================================

import { el, $, toast, openModal, closeModal, confirmar, emptyState, errorState, skeletonList } from "../ui.js";
import { state } from "../state.js";
import { listarVendas, criarVenda, cancelarVenda, listarClientes, listarCategorias } from "../api.js";
import { formatBRL, formatDate, parseToCents, todayISO } from "../money.js";

const ICON_CART = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`;

let vendas = [];
let filtro = "ativas"; // ativas | canceladas | todas

export async function renderVendas(root) {
  if (state.categorias.length === 0) {
    try { state.categorias = await listarCategorias(state.company.id); } catch (e) { console.error(e); }
  }

  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, "Vendas"),
        el("p", { class: "page-sub" }, "Registre vendas — cada uma vira uma entrada no caixa")
      ),
      el("button", { class: "btn btn--primary", onclick: () => abrirForm() }, "+ Nova venda")
    ),
    el("section", { id: "vendas-resumo", class: "stats admin-resumo" }),
    el("div", { id: "vendas-filtros", class: "admin-filtros" }),
    el("div", { id: "vendas-lista", class: "card" }, skeletonList(5))
  );
  await carregar();
}

async function carregar() {
  const box = $("#vendas-lista");
  if (!box) return;
  box.innerHTML = ""; box.append(skeletonList(5));
  try {
    vendas = await listarVendas(state.company.id);
  } catch (err) {
    console.error(err);
    box.innerHTML = "";
    box.append(errorState("Não foi possível carregar as vendas.", carregar));
    return;
  }
  desenharResumo();
  desenharFiltros();
  desenharLista();
}

function desenharResumo() {
  const box = $("#vendas-resumo");
  if (!box) return;
  const ativas = vendas.filter((v) => v.status === "ativa");
  const total = ativas.reduce((s, v) => s + v.amount_cents, 0);
  const mes = new Date().toISOString().slice(0, 7);
  const totalMes = ativas.filter((v) => (v.occurred_on || "").startsWith(mes)).reduce((s, v) => s + v.amount_cents, 0);
  box.innerHTML = "";
  box.append(
    card("Vendas (total)", formatBRL(total), "entrada"),
    card("Este mês", formatBRL(totalMes), "entrada"),
    card("Nº de vendas", String(ativas.length))
  );
}

function card(label, valor, tipo = "") {
  return el("div", { class: `card stat ${tipo ? "stat--" + tipo : ""}` },
    el("div", { class: "stat__header" }, el("span", { class: "stat__label" }, label)),
    el("span", { class: "stat__value num" }, String(valor))
  );
}

function desenharFiltros() {
  const box = $("#vendas-filtros");
  if (!box) return;
  const opcoes = [["ativas", "Ativas"], ["canceladas", "Canceladas"], ["todas", "Todas"]];
  box.innerHTML = "";
  for (const [id, label] of opcoes) {
    box.append(el("button", {
      class: `chip ${filtro === id ? "chip--on" : ""}`,
      onclick: () => { filtro = id; desenharFiltros(); desenharLista(); },
    }, label));
  }
}

function passaFiltro(v) {
  if (filtro === "todas") return true;
  if (filtro === "canceladas") return v.status === "cancelada";
  return v.status === "ativa";
}

function desenharLista() {
  const box = $("#vendas-lista");
  if (!box) return;
  const itens = vendas.filter(passaFiltro);

  box.innerHTML = "";
  if (itens.length === 0) {
    box.append(emptyState(
      vendas.length === 0
        ? "Nenhuma venda ainda.\nRegistre a primeira — ela entra no caixa automaticamente."
        : "Nenhuma venda neste filtro.",
      ICON_CART
    ));
    return;
  }

  const ul = el("ul", { class: "rec-list" });
  for (const v of itens) ul.append(item(v));
  box.append(ul);
}

function item(v) {
  const cancelada = v.status === "cancelada";
  const acoes = el("div", { class: "rec__actions" });
  if (!cancelada) {
    const bCancel = el("button", { class: "btn btn--tiny btn--ghost" }, "Cancelar");
    bCancel.addEventListener("click", () => {
      confirmar({
        titulo: "Cancelar venda",
        texto: `Cancelar a venda de ${formatBRL(v.amount_cents)}? A entrada gerada no caixa será estornada.`,
        confirmar: "Cancelar venda", perigo: true,
      }, async () => { await cancelarVenda(v); await carregar(); });
    });
    acoes.append(bCancel);
  }

  const cliente = v.parties?.name || "Sem cliente";
  return el("li", { class: `rec ${cancelada ? "is-pausada" : ""}` },
    el("span", { class: "cat__dot cat__dot--entrada" }),
    el("div", { class: "rec__main" },
      el("span", { class: "rec__desc" }, v.description || "Venda"),
      el("span", { class: "rec__meta" },
        `${formatDate(v.occurred_on)} · ${cliente}${cancelada ? " · cancelada" : ""}`)
    ),
    el("div", { class: "rec__right" },
      el("span", { class: "tx__value num c-entrada" }, "+ " + formatBRL(v.amount_cents)),
      acoes
    )
  );
}

// ---- nova venda (modal) ----------------------------------------------------

async function abrirForm() {
  let clientes = [];
  try { clientes = await listarClientes(state.company.id); } catch (e) { console.error(e); }
  // Vendas são pra clientes (ou contatos sem tipo definido).
  const opcoesCli = clientes.filter((c) => c.kind !== "fornecedor");

  const valor = el("input", { class: "input", placeholder: "0,00", inputmode: "decimal", autofocus: "" });
  const data = el("input", { class: "input", type: "date", value: todayISO() });
  const desc = el("input", { class: "input", placeholder: "Ex.: Venda de produtos, serviço prestado…" });
  const cli = el("select", { class: "input" },
    el("option", { value: "" }, "Sem cliente"),
    ...opcoesCli.map((c) => el("option", { value: c.id }, c.name))
  );
  const cat = el("select", { class: "input" },
    el("option", { value: "" }, "Sem categoria"),
    ...state.categorias.filter((c) => c.kind !== "saida").map((c) => el("option", { value: c.id }, c.name))
  );
  const btn = el("button", { class: "btn btn--primary" }, "Registrar venda");

  async function salvar() {
    const cents = parseToCents(valor.value);
    if (!cents || cents <= 0) { toast("Digite um valor válido", "erro"); return; }
    btn.disabled = true; btn.textContent = "Registrando...";
    try {
      await criarVenda(state.company.id, {
        partyId: cli.value || null,
        amountCents: cents,
        description: desc.value.trim(),
        occurredOn: data.value || todayISO(),
        categoryId: cat.value || null,
      });
      closeModal();
      toast("Venda registrada — entrou no caixa", "ok");
      await carregar();
    } catch (err) {
      console.error(err);
      toast("Não foi possível registrar", "erro");
      btn.disabled = false; btn.textContent = "Registrar venda";
    }
  }
  btn.addEventListener("click", salvar);

  openModal("Nova venda",
    el("div", { class: "form" },
      el("p", { class: "config__note", style: "margin-top:0" },
        "A venda gera uma entrada no caixa automaticamente."),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Valor"), valor),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Data"), data)
      ),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Cliente"), cli),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Descrição"), desc),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Categoria"), cat),
      el("div", { class: "form__actions" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"), btn)
    )
  );
}
