// ============================================================================
//  views/categorias.js — Gerenciar categorias
// ============================================================================

import { el, $, toast, openModal, closeModal, emptyState, errorState, ICONS, skeletonList } from "../ui.js";
import { state } from "../state.js";
import { listarCategorias, criarCategoria, atualizarCategoria, apagarCategoria } from "../api.js";

export async function renderCategorias(root) {
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head" },
      el("h1", { class: "page-title" }, "Categorias"),
      el("p", { class: "page-sub" }, "Agrupe lançamentos por tipo de operação")
    ),
    formularioNova(),
    el("div", { id: "lista-categorias", class: "card" }, skeletonList(4))
  );
  await carregar();
}

function formularioNova() {
  const nome = el("input", { class: "input", placeholder: "Ex.: Venda, Aluguel, Fornecedores…" });
  const tipo = el("select", { class: "input" },
    el("option", { value: "" }, "Aparece em entradas e saídas"),
    el("option", { value: "entrada" }, "Só em entradas"),
    el("option", { value: "saida" }, "Só em saídas")
  );
  const btn = el("button", { class: "btn btn--primary" }, "Adicionar");

  async function adicionar() {
    if (!nome.value.trim()) {
      toast("Digite o nome", "erro");
      return;
    }
    btn.disabled    = true;
    btn.textContent = "Adicionando...";
    try {
      await criarCategoria(state.company.id, nome.value.trim(), tipo.value || null);
      nome.value      = "";
      state.categorias = [];
      toast("Categoria criada", "ok");
      await carregar();
    } catch (err) {
      toast("Erro ao criar", "erro");
      console.error(err);
    } finally {
      btn.disabled    = false;
      btn.textContent = "Adicionar";
    }
  }

  btn.addEventListener("click", adicionar);
  nome.addEventListener("keydown", (e) => { if (e.key === "Enter") adicionar(); });

  return el("section", { class: "card" },
    el("div", { class: "card__head" },
      el("h2", { class: "card__title" }, "Nova categoria"),
      el("span", { class: "card__hint" }, "Use o campo Tipo para filtrar a categoria na hora do lançamento")
    ),
    el("div", { class: "form-inline" }, nome, tipo, btn)
  );
}

async function carregar() {
  const box = $("#lista-categorias");
  if (!box) return;

  box.innerHTML = "";
  box.append(skeletonList(4));

  let cats;
  try {
    cats = await listarCategorias(state.company.id);
  } catch (err) {
    console.error(err);
    box.innerHTML = "";
    box.append(errorState("Não foi possível carregar as categorias.", carregar));
    return;
  }
  state.categorias = cats;

  if (cats.length === 0) {
    box.innerHTML = "";
    box.append(emptyState("Nenhuma categoria ainda.\nCrie uma acima para organizar seus lançamentos.", ICONS.categorias));
    return;
  }

  const lista = el("ul", { class: "cat-list" });
  for (const c of cats) {
    const [rotuloTipo, badgeClass, dotClass] =
      c.kind === "entrada"
        ? ["Só entradas",  "badge",            "cat__dot cat__dot--entrada"]
        : c.kind === "saida"
        ? ["Só saídas",   "badge badge--saida","cat__dot cat__dot--saida"]
        : ["Entradas e saídas", "badge badge--muted", "cat__dot cat__dot--ambos"];
    lista.append(
      el("li", { class: "cat" },
        el("span", { class: dotClass }),
        el("span", { class: "cat__name" }, c.name),
        el("span", { class: badgeClass }, rotuloTipo),
        el("button", {
          class: "btn btn--tiny btn--ghost",
          onclick: () => abrirEdicao(c),
        }, "Editar"),
        el("button", {
          class: "btn btn--tiny btn--ghost",
          onclick: () => confirmarApagar(c),
        }, "Apagar")
      )
    );
  }
  box.innerHTML = "";
  box.append(lista);
}

function abrirEdicao(c) {
  const nome = el("input", { class: "input", value: c.name });
  const tipo = el("select", { class: "input" },
    el("option", { value: "" }, "Aparece em entradas e saídas"),
    el("option", { value: "entrada" }, "Só em entradas"),
    el("option", { value: "saida" }, "Só em saídas")
  );
  tipo.value = c.kind || "";

  const btnSalvar = el("button", { class: "btn btn--primary" }, "Salvar");

  async function salvar() {
    const nomeNovo = nome.value.trim();
    if (!nomeNovo) { toast("Digite o nome", "erro"); return; }
    if (nomeNovo === c.name && (tipo.value || null) === (c.kind || null)) {
      closeModal();
      return;
    }
    btnSalvar.disabled    = true;
    btnSalvar.textContent = "Salvando...";
    try {
      await atualizarCategoria(c.id, nomeNovo, tipo.value || null);
      state.categorias = [];
      closeModal();
      toast("Categoria atualizada", "ok");
      await carregar();
    } catch (err) {
      toast("Não foi possível salvar", "erro");
      console.error(err);
      btnSalvar.disabled    = false;
      btnSalvar.textContent = "Salvar";
    }
  }

  btnSalvar.addEventListener("click", salvar);
  nome.addEventListener("keydown", (e) => { if (e.key === "Enter") salvar(); });

  openModal("Editar categoria",
    el("div", {},
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Nome"),
        nome
      ),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Tipo"),
        tipo
      ),
      el("div", { class: "form__actions" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"),
        btnSalvar
      )
    )
  );
}

function confirmarApagar(c) {
  const btnApagar = el("button", { class: "btn btn--danger" }, "Apagar");

  async function apagar() {
    btnApagar.disabled    = true;
    btnApagar.textContent = "Apagando...";
    try {
      await apagarCategoria(c.id);
      state.categorias = [];
      closeModal();
      await carregar();
    } catch {
      toast("Não foi possível apagar", "erro");
      btnApagar.disabled    = false;
      btnApagar.textContent = "Apagar";
    }
  }

  btnApagar.addEventListener("click", apagar);

  openModal("Apagar categoria",
    el("div", {},
      el("p", { style: "margin:0 0 24px;color:var(--c-text-2,#6a7870);line-height:1.6;" },
        `Tem certeza que deseja apagar "${c.name}"? Os lançamentos vinculados não serão afetados.`),
      el("div", { class: "form__actions" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"),
        btnApagar
      )
    )
  );
}
