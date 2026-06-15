// ============================================================================
//  views/lancamentos.js — Lista, cadastro e estorno de lançamentos
// ============================================================================

import { el, $, toast, openModal, closeModal } from "../ui.js";
import { state, mesAtual } from "../state.js";
import {
  listarLancamentos,
  criarLancamento,
  estornarLancamento,
  listarCategorias,
} from "../api.js";
import { formatBRL, formatDate, parseToCents, todayISO } from "../money.js";

// Filtros atuais da tela (começa no mês corrente)
const filtros = { ...mesAtual(), kind: "", categoryId: "" };

export async function renderLancamentos(root) {
  // Garante que temos as categorias em cache (pro formulário e filtro)
  if (state.categorias.length === 0) {
    state.categorias = await listarCategorias(state.company.id);
  }

  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, "Lançamentos"),
        el("p", { class: "page-sub" }, "Tudo que entra e sai do caixa")
      ),
      el("button",
        { class: "btn btn--primary", onclick: () => abrirFormulario(root) },
        "+ Novo lançamento")
    ),
    barraFiltros(root),
    el("div", { id: "lista-lancamentos", class: "card" },
      el("div", { class: "loading" }, "Carregando..."))
  );

  await carregarLista();
}

// ---- filtros ---------------------------------------------------------------

function barraFiltros(root) {
  const de = el("input", { type: "date", class: "input", value: filtros.de });
  const ate = el("input", { type: "date", class: "input", value: filtros.ate });

  const tipo = el("select", { class: "input" },
    el("option", { value: "" }, "Todos os tipos"),
    el("option", { value: "entrada" }, "Entradas"),
    el("option", { value: "saida" }, "Saídas")
  );
  tipo.value = filtros.kind;

  const cat = el("select", { class: "input" },
    el("option", { value: "" }, "Todas as categorias"),
    ...state.categorias.map((c) => el("option", { value: c.id }, c.name))
  );
  cat.value = filtros.categoryId;

  function aplicar() {
    filtros.de = de.value;
    filtros.ate = ate.value;
    filtros.kind = tipo.value;
    filtros.categoryId = cat.value;
    carregarLista();
  }

  [de, ate, tipo, cat].forEach((e) => e.addEventListener("change", aplicar));

  return el("section", { class: "filtros" }, de, ate, tipo, cat);
}

// ---- lista -----------------------------------------------------------------

async function carregarLista() {
  const box = $("#lista-lancamentos");
  if (!box) return;
  box.innerHTML = `<div class="loading">Carregando...</div>`;

  const itens = await listarLancamentos({
    companyId: state.company.id,
    de: filtros.de,
    ate: filtros.ate,
    kind: filtros.kind || undefined,
    categoryId: filtros.categoryId || undefined,
  });

  if (itens.length === 0) {
    box.innerHTML = "";
    box.append(el("p", { class: "empty" }, "Nenhum lançamento neste filtro."));
    return;
  }

  const lista = el("ul", { class: "tx-list" });
  for (const t of itens) {
    const estornar =
      !t.is_reversed && !t.reverses_id
        ? el("button", {
            class: "btn btn--tiny btn--ghost",
            onclick: () => confirmarEstorno(t),
          }, "Estornar")
        : null;

    lista.append(
      el("li", { class: `tx tx--${t.kind} ${t.is_reversed ? "is-reversed" : ""}` },
        el("div", { class: "tx__main" },
          el("span", { class: "tx__desc" },
            (t.description || "(sem descrição)"),
            t.is_reversed ? el("span", { class: "badge badge--muted" }, "estornado") : null,
            t.reverses_id ? el("span", { class: "badge badge--muted" }, "estorno") : null
          ),
          el("span", { class: "tx__meta" },
            `${formatDate(t.occurred_on)}${t.categories?.name ? " · " + t.categories.name : ""}`)
        ),
        el("div", { class: "tx__right" },
          el("span", { class: "tx__value num" },
            (t.kind === "entrada" ? "+ " : "− ") + formatBRL(t.amount_cents)),
          estornar
        )
      )
    );
  }
  box.innerHTML = "";
  box.append(lista);
}

// ---- novo lançamento (modal) -----------------------------------------------

function abrirFormulario(root) {
  let kind = "entrada";

  const btnEntrada = el("button", { class: "seg seg--on", type: "button" }, "Entrada");
  const btnSaida = el("button", { class: "seg", type: "button" }, "Saída");
  btnEntrada.onclick = () => { kind = "entrada"; btnEntrada.classList.add("seg--on"); btnSaida.classList.remove("seg--on"); };
  btnSaida.onclick = () => { kind = "saida"; btnSaida.classList.add("seg--on"); btnEntrada.classList.remove("seg--on"); };

  const valor = el("input", { class: "input", placeholder: "0,00", inputmode: "decimal" });
  const data = el("input", { type: "date", class: "input", value: todayISO() });
  const desc = el("input", { class: "input", placeholder: "Ex.: Venda de peça" });
  const cat = el("select", { class: "input" },
    el("option", { value: "" }, "Sem categoria"),
    ...state.categorias.map((c) => el("option", { value: c.id }, c.name))
  );

  async function salvar() {
    const cents = parseToCents(valor.value);
    if (!cents || cents <= 0) {
      toast("Digite um valor válido", "erro");
      return;
    }
    try {
      await criarLancamento({
        companyId: state.company.id,
        kind,
        amountCents: cents,
        description: desc.value.trim(),
        categoryId: cat.value || null,
        occurredOn: data.value || todayISO(),
      });
      closeModal();
      toast("Lançamento salvo!", "ok");
      carregarLista();
    } catch (err) {
      toast("Erro ao salvar", "erro");
      console.error(err);
    }
  }

  const form = el("div", { class: "form" },
    el("div", { class: "seg-group" }, btnEntrada, btnSaida),
    el("label", { class: "field" }, el("span", { class: "field__label" }, "Valor (R$)"), valor),
    el("label", { class: "field" }, el("span", { class: "field__label" }, "Data"), data),
    el("label", { class: "field" }, el("span", { class: "field__label" }, "Descrição"), desc),
    el("label", { class: "field" }, el("span", { class: "field__label" }, "Categoria"), cat),
    el("div", { class: "form__actions" },
      el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"),
      el("button", { class: "btn btn--primary", onclick: salvar }, "Salvar")
    )
  );

  openModal("Novo lançamento", form);
}

// ---- estorno ---------------------------------------------------------------

function confirmarEstorno(t) {
  const corpo = el("div", { class: "form" },
    el("p", {},
      "Isso cria um lançamento contrário pra anular este, sem apagar o histórico. Confirmar?"),
    el("div", { class: "tx-preview" },
      `${t.kind === "entrada" ? "Entrada" : "Saída"} de ${formatBRL(t.amount_cents)} — ${t.description || "(sem descrição)"}`),
    el("div", { class: "form__actions" },
      el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"),
      el("button", {
        class: "btn btn--danger",
        onclick: async () => {
          try {
            await estornarLancamento(t.id);
            closeModal();
            toast("Lançamento estornado", "ok");
            carregarLista();
          } catch (err) {
            toast(err.message || "Erro ao estornar", "erro");
          }
        },
      }, "Estornar")
    )
  );
  openModal("Estornar lançamento", corpo);
}
