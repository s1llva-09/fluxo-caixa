// ============================================================================
//  views/lancamentos.js — Lista, cadastro e estorno de lançamentos
// ============================================================================

import { el, $, toast, openModal, closeModal, emptyState, errorState, ICONS, ICON, skeletonList } from "../ui.js";
import { state, mesAtual } from "../state.js";
import {
  listarLancamentos,
  criarLancamento,
  estornarLancamento,
  listarCategorias,
  listarRecorrencias,
  criarRecorrencia,
  atualizarRecorrencia,
  apagarRecorrencia,
  processarRecorrencias,
  listarComprovantes,
  uploadComprovante,
  urlComprovante,
  listarClientes,
} from "../api.js";
import { formatBRL, formatDate, parseToCents, todayISO } from "../money.js";

// Filtros atuais da tela (começa no mês corrente)
const filtros = { ...mesAtual(), kind: "", categoryId: "" };

// Itens carregados (pra filtrar a busca por texto sem ir no banco de novo)
let itensCarregados = [];
let termoBusca = "";
// Mapa transaction_id -> anexo (comprovante)
let comprovantesMap = {};
// Clientes/fornecedores (pra vincular no lançamento)
let clientes = [];

export async function renderLancamentos(root) {
  if (state.categorias.length === 0) {
    // Não-fatal: se falhar, os filtros ficam sem categorias e a lista
    // mostra o erro com opção de tentar de novo.
    try {
      state.categorias = await listarCategorias(state.company.id);
    } catch (err) {
      console.error(err);
    }
  }

  // Contatos (não-fatal: se a migração de clientes não rodou, segue sem eles).
  try {
    clientes = await listarClientes(state.company.id);
  } catch (err) {
    console.error("Clientes:", err);
    clientes = [];
  }

  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, "Lançamentos"),
        el("p", { class: "page-sub" }, "Registre entradas e saídas do seu negócio")
      ),
      el("div", { class: "page-head__acoes" },
        el("button", { class: "btn btn--ghost", onclick: abrirRecorrentes, html: ICON.repeat + "<span>Recorrentes</span>" }),
        el("button", { class: "btn btn--primary", onclick: () => abrirFormulario() }, "+ Novo lançamento")
      )
    ),
    presetsPeriodo(),
    barraFiltros(),
    el("div", { id: "lista-lancamentos", class: "card" }, skeletonList(5))
  );

  await carregarLista();
}

// ---- atalhos de período (chips) --------------------------------------------

function presetsPeriodo() {
  const hoje = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const opcoes = [
    ["Este mês", () => mesAtual()],
    ["Mês passado", () => {
      const p = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      return { de: iso(new Date(p.getFullYear(), p.getMonth(), 1)),
               ate: iso(new Date(p.getFullYear(), p.getMonth() + 1, 0)) };
    }],
    ["Este ano", () => ({ de: iso(new Date(hoje.getFullYear(), 0, 1)),
                          ate: iso(new Date(hoje.getFullYear(), 11, 31)) })],
    ["Tudo", () => ({ de: "2000-01-01", ate: iso(hoje) })],
  ];
  const box = el("div", { class: "admin-filtros" });
  for (const [label, calc] of opcoes) {
    box.append(el("button", {
      class: "chip", type: "button",
      onclick: async () => {
        const r = calc();
        filtros.de = r.de; filtros.ate = r.ate;
        // re-renderiza a tela toda pra atualizar os campos De/Até
        renderLancamentos($("#view"));
      },
    }, label));
  }
  return box;
}

// ---- filtros ---------------------------------------------------------------

function barraFiltros() {
  const de  = el("input", { type: "date", class: "input", value: filtros.de });
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

  const busca = el("input", {
    class: "input", type: "search", placeholder: "Buscar na descrição…", value: termoBusca,
  });
  busca.addEventListener("input", () => { termoBusca = busca.value; renderLista(); });

  async function aplicar() {
    filtros.de         = de.value;
    filtros.ate        = ate.value;
    filtros.kind       = tipo.value;
    filtros.categoryId = cat.value;
    await carregarLista();
  }

  [de, ate, tipo, cat].forEach((e) => e.addEventListener("change", aplicar));

  return el("section", { class: "filtros" },
    el("label", { class: "filtro-grupo" }, el("span", { class: "filtro-grupo__label" }, "De"), de),
    el("label", { class: "filtro-grupo" }, el("span", { class: "filtro-grupo__label" }, "Até"), ate),
    el("label", { class: "filtro-grupo" }, el("span", { class: "filtro-grupo__label" }, "Tipo"), tipo),
    el("label", { class: "filtro-grupo" }, el("span", { class: "filtro-grupo__label" }, "Categoria"), cat),
    el("label", { class: "filtro-grupo filtro-grupo--busca" }, el("span", { class: "filtro-grupo__label" }, "Buscar"), busca)
  );
}

// ---- lista -----------------------------------------------------------------

async function carregarLista() {
  const box = $("#lista-lancamentos");
  if (!box) return;

  const sentinel = skeletonList(5);
  box.innerHTML = "";
  box.append(sentinel);

  let itens;
  try {
    itens = await listarLancamentos({
      companyId:  state.company.id,
      de:         filtros.de,
      ate:        filtros.ate,
      kind:       filtros.kind || undefined,
      categoryId: filtros.categoryId || undefined,
    });
  } catch (err) {
    console.error(err);
    if (!document.body.contains(sentinel)) return;
    box.innerHTML = "";
    box.append(errorState("Não foi possível carregar os lançamentos.", carregarLista));
    return;
  }

  // Se o usuário navegou para outra tela durante o fetch, descarta.
  if (!document.body.contains(sentinel)) return;

  // Comprovantes (não-fatal: se a migração não rodou, segue sem anexos).
  try {
    const comps = await listarComprovantes(state.company.id);
    comprovantesMap = {};
    for (const a of comps) comprovantesMap[a.transaction_id] = a;
  } catch (err) {
    console.error("Comprovantes:", err);
    comprovantesMap = {};
  }

  itensCarregados = itens;
  renderLista();
}

// Abre o comprovante (URL assinada) numa nova aba.
async function verComprovante(anexo) {
  try {
    const url = await urlComprovante(anexo.path);
    window.open(url, "_blank", "noopener");
  } catch (err) {
    console.error(err);
    toast("Não foi possível abrir o comprovante", "erro");
  }
}

// Abre o seletor de arquivo e anexa o comprovante a um lançamento existente.
function anexarA(t) {
  const inp = el("input", { type: "file", accept: "image/*,application/pdf", style: "display:none" });
  inp.addEventListener("change", async () => {
    const file = inp.files && inp.files[0];
    inp.remove();
    if (!file) return;
    toast("Enviando comprovante…", "info");
    try {
      await uploadComprovante(state.company.id, t.id, file);
      toast("Comprovante anexado", "ok");
      await carregarLista();
    } catch (err) {
      console.error(err);
      toast("Não foi possível enviar", "erro");
    }
  });
  document.body.append(inp);
  inp.click();
}

// Desenha a lista já filtrada pela busca por texto (sem ir no banco).
function renderLista() {
  const box = $("#lista-lancamentos");
  if (!box) return;

  const termo = termoBusca.trim().toLowerCase();
  const itens = !termo
    ? itensCarregados
    : itensCarregados.filter((t) => (t.description || "").toLowerCase().includes(termo));

  box.innerHTML = "";
  if (itens.length === 0) {
    if (termo) {
      box.append(el("div", { class: "empty" }, "Nenhum lançamento com esse texto."));
      return;
    }
    const cta = el("button", {
      class: "btn btn--primary",
      style: "margin-top: 12px;",
      onclick: () => abrirFormulario(),
    }, "+ Novo lançamento");
    const wrap = el("div", { class: "empty-state" },
      el("div", { class: "empty-state__icon", html: ICONS.lancamentos }),
      el("p", { class: "empty-state__text" }, "Nenhum lançamento encontrado para este período."),
      cta
    );
    box.append(wrap);
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

    const anexo = comprovantesMap[t.id];
    const btnAnexo = anexo
      ? el("button", { class: "btn btn--tiny btn--ghost", title: "Ver comprovante",
          onclick: () => verComprovante(anexo), html: ICON.clip + "<span>Ver</span>" })
      : el("button", { class: "btn btn--tiny btn--ghost", "aria-label": "Anexar comprovante",
          title: "Anexar comprovante", onclick: () => anexarA(t), html: ICON.clip });

    lista.append(
      el("li", { class: `tx tx--${t.kind} ${t.is_reversed ? "is-reversed" : ""}` },
        el("div", { class: "tx__main" },
          el("span", { class: "tx__desc" },
            el("span", {}, t.description || "(sem descrição)"),
            t.is_reversed ? el("span", { class: "badge badge--muted" }, "estornado") : null,
            t.reverses_id  ? el("span", { class: "badge badge--muted" }, "estorno")   : null
          ),
          el("span", { class: "tx__meta" },
            `${formatDate(t.occurred_on)}${t.categories?.name ? " · " + t.categories.name : ""}${t.party_name ? " · " + t.party_name : ""}`)
        ),
        el("div", { class: "tx__right" },
          el("span", { class: "tx__value num" },
            (t.kind === "entrada" ? "+ " : "− ") + formatBRL(t.amount_cents)),
          btnAnexo,
          estornar
        )
      )
    );
  }
  box.innerHTML = "";
  box.append(lista);
}

// ---- novo lançamento (modal) -----------------------------------------------

function abrirFormulario() {
  let kind = "entrada";

  const btnEntrada = el("button", { class: "seg seg--on", type: "button" }, "Entrada");
  const btnSaida   = el("button", { class: "seg",        type: "button" }, "Saída");
  btnEntrada.onclick = () => {
    kind = "entrada";
    btnEntrada.classList.add("seg--on");
    btnSaida.classList.remove("seg--on");
  };
  btnSaida.onclick = () => {
    kind = "saida";
    btnSaida.classList.add("seg--on");
    btnEntrada.classList.remove("seg--on");
  };

  const valor = el("input", { class: "input", placeholder: "0,00", inputmode: "decimal", autofocus: "" });
  valor.addEventListener("blur", () => {
    const cents = parseToCents(valor.value);
    if (cents > 0) {
      valor.value = (cents / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
  });
  const data  = el("input", { type: "date", class: "input", value: todayISO() });
  const desc  = el("input", { class: "input", placeholder: "Ex.: Venda de produto, pagamento de fornecedor…" });
  const cat   = el("select", { class: "input" },
    el("option", { value: "" }, "Sem categoria"),
    ...state.categorias.map((c) => el("option", { value: c.id }, c.name))
  );
  const contato = el("select", { class: "input" },
    el("option", { value: "" }, "Sem cliente/fornecedor"),
    ...clientes.map((c) => el("option", { value: c.id },
      c.name + (c.kind === "cliente" ? " (cliente)" : c.kind === "fornecedor" ? " (fornecedor)" : "")))
  );

  const comprovante = el("input", { type: "file", class: "input input--file", accept: "image/*,application/pdf" });
  const btnSalvar = el("button", { class: "btn btn--primary" }, "Salvar");

  async function salvar() {
    const cents = parseToCents(valor.value);
    if (!cents || cents <= 0) {
      toast("Digite um valor válido", "erro");
      return;
    }
    btnSalvar.disabled    = true;
    btnSalvar.textContent = "Salvando...";
    try {
      const novo = await criarLancamento({
        companyId:   state.company.id,
        kind,
        amountCents: cents,
        description: desc.value.trim(),
        categoryId:  cat.value || null,
        occurredOn:  data.value || todayISO(),
        partyId:     contato.value || null,
      });
      // Anexa o comprovante, se houver (falha aqui não desfaz o lançamento).
      const file = comprovante.files && comprovante.files[0];
      if (file && novo?.id) {
        try {
          await uploadComprovante(state.company.id, novo.id, file);
        } catch (e) {
          console.error(e);
          toast("Lançamento salvo, mas o comprovante falhou", "erro");
        }
      }
      closeModal();
      toast("Lançamento salvo!", "ok");
      await carregarLista();
    } catch (err) {
      toast("Erro ao salvar", "erro");
      console.error(err);
      btnSalvar.disabled    = false;
      btnSalvar.textContent = "Salvar";
    }
  }

  btnSalvar.addEventListener("click", salvar);

  openModal("Novo lançamento",
    el("div", { class: "form" },
      el("div", { class: "seg-group" }, btnEntrada, btnSaida),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Valor"), valor),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Data"), data),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Descrição"), desc),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Categoria"), cat),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Cliente / Fornecedor"), contato),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Comprovante (opcional)"), comprovante),
      el("div", { class: "form__actions" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"),
        btnSalvar
      )
    )
  );
}

// ---- estorno ---------------------------------------------------------------

function confirmarEstorno(t) {
  const btnEstornar = el("button", { class: "btn btn--danger" }, "Estornar");

  async function estornar() {
    btnEstornar.disabled    = true;
    btnEstornar.textContent = "Estornando...";
    try {
      await estornarLancamento(t.id);
      closeModal();
      toast("Lançamento estornado", "ok");
      await carregarLista();
    } catch (err) {
      toast(err.message || "Erro ao estornar", "erro");
      btnEstornar.disabled    = false;
      btnEstornar.textContent = "Estornar";
    }
  }

  btnEstornar.addEventListener("click", estornar);

  openModal("Estornar lançamento",
    el("div", { class: "form" },
      el("p", {},
        "Isso cria um lançamento contrário para anular este, sem apagar o histórico. Confirmar?"),
      el("div", { class: "tx-preview" },
        `${t.kind === "entrada" ? "Entrada" : "Saída"} de ${formatBRL(t.amount_cents)} — ${t.description || "(sem descrição)"}`),
      el("div", { class: "form__actions" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"),
        btnEstornar
      )
    )
  );
}

// ---- recorrentes (modal) ---------------------------------------------------

function abrirRecorrentes() {
  const listaBox = el("div", {}, el("div", { class: "loading" }, "Carregando..."));

  async function carregar() {
    listaBox.innerHTML = "";
    let recs;
    try {
      recs = await listarRecorrencias(state.company.id);
    } catch (err) {
      console.error(err);
      listaBox.append(el("p", { class: "admin-pay__vazio" }, "Não foi possível carregar."));
      return;
    }
    if (recs.length === 0) {
      listaBox.append(el("p", { class: "admin-pay__vazio" }, "Nenhuma recorrência ainda."));
      return;
    }
    const ul = el("ul", { class: "rec-list" });
    for (const r of recs) ul.append(recItem(r, carregar));
    listaBox.append(ul);
  }

  // form: nova recorrência
  let kind = "saida";
  const segE = el("button", { class: "seg", type: "button" }, "Entrada");
  const segS = el("button", { class: "seg seg--on", type: "button" }, "Saída");
  segE.onclick = () => { kind = "entrada"; segE.classList.add("seg--on"); segS.classList.remove("seg--on"); };
  segS.onclick = () => { kind = "saida"; segS.classList.add("seg--on"); segE.classList.remove("seg--on"); };

  const valor = el("input", { class: "input", placeholder: "0,00", inputmode: "decimal" });
  const dia = el("input", { class: "input", type: "number", min: "1", max: "31", value: "5" });
  const desc = el("input", { class: "input", placeholder: "Ex.: Aluguel, salário, assinatura…" });
  const cat = el("select", { class: "input" },
    el("option", { value: "" }, "Sem categoria"),
    ...state.categorias.map((c) => el("option", { value: c.id }, c.name))
  );
  const fim = el("input", { class: "input", type: "date" });
  const btnAdd = el("button", { class: "btn btn--primary" }, "Adicionar recorrência");

  async function adicionar() {
    const cents = parseToCents(valor.value);
    const d = parseInt(dia.value, 10);
    if (!cents || cents <= 0) { toast("Digite um valor válido", "erro"); return; }
    if (!(d >= 1 && d <= 31)) { toast("Dia do mês inválido (1 a 31)", "erro"); return; }
    btnAdd.disabled = true; btnAdd.textContent = "Adicionando...";
    try {
      await criarRecorrencia(state.company.id, {
        kind,
        amount_cents: cents,
        description: desc.value.trim(),
        category_id: cat.value || null,
        day_of_month: d,
        start_on: todayISO(),
        end_on: fim.value || null,
      });
      // gera de imediato o que já venceu e atualiza a lista por baixo
      try { await processarRecorrencias(state.company.id); } catch {}
      valor.value = ""; desc.value = ""; fim.value = "";
      toast("Recorrência criada", "ok");
      carregar();
      carregarLista();
    } catch (err) {
      console.error(err);
      toast("Não foi possível criar", "erro");
    } finally {
      btnAdd.disabled = false; btnAdd.textContent = "Adicionar recorrência";
    }
  }
  btnAdd.addEventListener("click", adicionar);

  openModal("Lançamentos recorrentes",
    el("div", {},
      el("p", { class: "config__note", style: "margin-top:0" },
        "Recorrências viram lançamentos sozinhas (ex.: aluguel todo dia 5). São geradas quando você entra no sistema."),
      el("h3", { class: "admin-pay__titulo" }, "Nova recorrência"),
      el("div", { class: "seg-group", style: "margin-bottom:14px" }, segE, segS),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Valor"), valor),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Dia do mês"), dia)
      ),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Descrição"), desc),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Categoria"), cat),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Termina em (opcional)"), fim)
      ),
      el("div", { class: "form__actions" }, btnAdd),
      el("hr", { class: "admin-conta__sep" }),
      el("h3", { class: "admin-pay__titulo" }, "Suas recorrências"),
      listaBox,
      el("div", { class: "form__actions", style: "margin-top:18px" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Fechar")
      )
    )
  );
  carregar();
}

function recItem(r, recarregar) {
  const tipo = r.kind === "entrada" ? "Entrada" : "Saída";
  const btnToggle = el("button", { class: "btn btn--tiny btn--ghost" }, r.active ? "Pausar" : "Retomar");
  btnToggle.addEventListener("click", async () => {
    btnToggle.disabled = true;
    try { await atualizarRecorrencia(r.id, { active: !r.active }); recarregar(); }
    catch (err) { console.error(err); toast("Erro ao atualizar", "erro"); btnToggle.disabled = false; }
  });
  const btnDel = el("button", { class: "btn btn--tiny btn--ghost" }, "Apagar");
  btnDel.addEventListener("click", async () => {
    btnDel.disabled = true;
    try { await apagarRecorrencia(r.id); recarregar(); }
    catch (err) { console.error(err); toast("Erro ao apagar", "erro"); btnDel.disabled = false; }
  });
  return el("li", { class: `rec ${r.active ? "" : "is-pausada"}` },
    el("span", { class: `cat__dot cat__dot--${r.kind}` }),
    el("div", { class: "rec__main" },
      el("span", { class: "rec__desc" }, r.description || "(sem descrição)"),
      el("span", { class: "rec__meta" },
        `${tipo} de ${formatBRL(r.amount_cents)} · todo dia ${r.day_of_month}` +
        `${r.categories?.name ? " · " + r.categories.name : ""}${r.active ? "" : " · pausada"}`)
    ),
    el("div", { class: "rec__actions" }, btnToggle, btnDel)
  );
}
