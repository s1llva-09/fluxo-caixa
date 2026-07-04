// ============================================================================
//  views/estoque.js — Estoque / Produtos (módulo ERP)
// ----------------------------------------------------------------------------
//  Cadastro de produtos com quantidade e estoque mínimo (alerta). Depois a
//  Venda dará baixa automática aqui.
// ============================================================================

import { el, $, toast, openModal, closeModal, confirmar, emptyState, errorState, skeletonList } from "../ui.js";
import { state } from "../state.js";
import { listarProdutos, criarProduto, atualizarProduto, apagarProduto } from "../api.js";
import { formatBRL, parseToCents } from "../money.js";

const ICON_BOX = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;

// Converte "1.234,5" ou "1234.5" -> número (aceita vírgula decimal).
function parseQtd(v) {
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function fmtQtd(n) {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
function baixo(p) {
  return p.min_stock > 0 && Number(p.stock_qty) <= Number(p.min_stock);
}

let produtos = [];
let filtro = "todos"; // todos | baixo

export async function renderEstoque(root) {
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, "Estoque"),
        el("p", { class: "page-sub" }, "Produtos, quantidades e alerta de estoque mínimo")
      ),
      el("button", { class: "btn btn--primary", onclick: () => abrirForm() }, "+ Novo produto")
    ),
    el("section", { id: "estoque-resumo", class: "stats admin-resumo" }),
    el("div", { id: "estoque-filtros", class: "admin-filtros" }),
    el("div", { id: "estoque-lista", class: "card" }, skeletonList(5))
  );
  await carregar();
}

async function carregar() {
  const box = $("#estoque-lista");
  if (!box) return;
  box.innerHTML = ""; box.append(skeletonList(5));
  try {
    produtos = await listarProdutos(state.company.id);
  } catch (err) {
    console.error(err);
    box.innerHTML = "";
    box.append(errorState("Não foi possível carregar o estoque.", carregar));
    return;
  }
  desenharResumo();
  desenharFiltros();
  desenharLista();
}

function desenharResumo() {
  const box = $("#estoque-resumo");
  if (!box) return;
  const valor = produtos.reduce((s, p) => s + p.price_cents * Number(p.stock_qty), 0);
  const nBaixo = produtos.filter(baixo).length;
  box.innerHTML = "";
  box.append(
    card("Produtos", String(produtos.length)),
    card("Valor em estoque", formatBRL(Math.round(valor))),
    card("Abaixo do mínimo", String(nBaixo), nBaixo > 0 ? "alerta" : "")
  );
}

function card(label, valor, tipo = "") {
  return el("div", { class: `card stat ${tipo ? "stat--" + tipo : ""}` },
    el("div", { class: "stat__header" }, el("span", { class: "stat__label" }, label)),
    el("span", { class: "stat__value num" }, String(valor))
  );
}

function desenharFiltros() {
  const box = $("#estoque-filtros");
  if (!box) return;
  const opcoes = [["todos", "Todos"], ["baixo", "Estoque baixo"]];
  box.innerHTML = "";
  for (const [id, label] of opcoes) {
    box.append(el("button", {
      class: `chip ${filtro === id ? "chip--on" : ""}`,
      onclick: () => { filtro = id; desenharFiltros(); desenharLista(); },
    }, label));
  }
}

function desenharLista() {
  const box = $("#estoque-lista");
  if (!box) return;
  const itens = filtro === "baixo" ? produtos.filter(baixo) : produtos;

  box.innerHTML = "";
  if (itens.length === 0) {
    box.append(emptyState(
      produtos.length === 0
        ? "Nenhum produto ainda.\nCadastre o primeiro pra controlar o estoque."
        : "Nenhum produto com estoque baixo. 👍",
      ICON_BOX
    ));
    return;
  }

  const ul = el("ul", { class: "rec-list" });
  for (const p of itens) ul.append(item(p));
  box.append(ul);
}

function item(p) {
  const acoes = el("div", { class: "rec__actions" },
    el("button", { class: "btn btn--tiny btn--ghost", onclick: () => abrirForm(p) }, "Editar"),
    el("button", { class: "btn btn--tiny btn--ghost", onclick: () => confirmarApagar(p) }, "Apagar")
  );
  const meta = [p.sku, `${fmtQtd(p.stock_qty)} ${p.unit}`, formatBRL(p.price_cents)].filter(Boolean).join(" · ");
  return el("li", { class: "rec" },
    el("span", { class: `cat__dot ${baixo(p) ? "cat__dot--saida" : "cat__dot--entrada"}` }),
    el("div", { class: "rec__main" },
      el("span", { class: "rec__desc" }, p.name),
      el("span", { class: "rec__meta" }, meta)
    ),
    el("div", { class: "rec__right" },
      baixo(p) ? el("span", { class: "badge badge--alerta" }, "Estoque baixo") : null,
      acoes
    )
  );
}

// ---- criar / editar (modal) ------------------------------------------------

function abrirForm(prod = null) {
  const editando = !!prod;
  const nome = el("input", { class: "input", placeholder: "Nome do produto", value: prod ? prod.name : "" });
  const sku = el("input", { class: "input", placeholder: "Código / SKU (opcional)", value: prod?.sku || "" });
  const unit = el("input", { class: "input", placeholder: "un", value: prod?.unit || "un" });
  const preco = el("input", { class: "input", placeholder: "0,00", inputmode: "decimal",
    value: prod ? (prod.price_cents / 100).toFixed(2).replace(".", ",") : "" });
  const estoque = el("input", { class: "input", placeholder: "0", inputmode: "decimal", value: prod ? fmtQtd(prod.stock_qty) : "" });
  const minimo = el("input", { class: "input", placeholder: "0", inputmode: "decimal", value: prod ? fmtQtd(prod.min_stock) : "" });
  const btn = el("button", { class: "btn btn--primary" }, "Salvar");

  async function salvar() {
    if (!nome.value.trim()) { toast("Digite o nome", "erro"); return; }
    btn.disabled = true; btn.textContent = "Salvando...";
    const dados = {
      name: nome.value.trim(),
      sku: sku.value.trim() || null,
      unit: unit.value.trim() || "un",
      price_cents: parseToCents(preco.value) || 0,
      stock_qty: parseQtd(estoque.value),
      min_stock: parseQtd(minimo.value),
    };
    try {
      if (editando) await atualizarProduto(prod.id, dados);
      else await criarProduto(state.company.id, dados);
      closeModal();
      toast(editando ? "Produto atualizado" : "Produto criado", "ok");
      await carregar();
    } catch (err) {
      console.error(err);
      toast("Não foi possível salvar", "erro");
      btn.disabled = false; btn.textContent = "Salvar";
    }
  }
  btn.addEventListener("click", salvar);
  nome.addEventListener("keydown", (e) => { if (e.key === "Enter") salvar(); });

  openModal(editando ? "Editar produto" : "Novo produto",
    el("div", { class: "form" },
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Nome"), nome),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Código / SKU"), sku),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Unidade"), unit)
      ),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Preço de venda"), preco),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Estoque atual"), estoque)
      ),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Estoque mínimo (alerta)"), minimo),
      el("div", { class: "form__actions" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"), btn)
    )
  );
}

function confirmarApagar(p) {
  confirmar({
    titulo: "Apagar produto",
    texto: `Apagar "${p.name}"? Isso não afeta vendas já feitas.`,
    confirmar: "Apagar", perigo: true,
  }, async () => { await apagarProduto(p.id); await carregar(); });
}
