// ============================================================================
//  views/funcionarios.js — Funcionários (módulo ERP)
// ----------------------------------------------------------------------------
//  Cadastro de funcionários: nome, CPF, cargo, setor, salário, admissão,
//  carteira de trabalho, registro e observações.
// ============================================================================

import { el, $, toast, openModal, closeModal, confirmar, emptyState, errorState, skeletonList } from "../ui.js";
import { state } from "../state.js";
import { listarFuncionarios, criarFuncionario, atualizarFuncionario, apagarFuncionario } from "../api.js";
import { formatBRL, formatDate, parseToCents, todayISO } from "../money.js";

const ICON_ID = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M5 16a3 3 0 0 1 6 0"/><line x1="14" y1="9" x2="19" y2="9"/><line x1="14" y1="13" x2="19" y2="13"/></svg>`;

let funcionarios = [];

export async function renderFuncionarios(root) {
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, "Funcionários"),
        el("p", { class: "page-sub" }, "Equipe, cargos e folha salarial")
      ),
      el("button", { class: "btn btn--primary", onclick: () => abrirForm() }, "+ Novo funcionário")
    ),
    el("section", { id: "func-resumo", class: "stats admin-resumo" }),
    el("div", { id: "func-lista", class: "card" }, skeletonList(5))
  );
  await carregar();
}

async function carregar() {
  const box = $("#func-lista");
  if (!box) return;
  box.innerHTML = ""; box.append(skeletonList(5));
  try {
    funcionarios = await listarFuncionarios(state.company.id);
  } catch (err) {
    console.error(err);
    box.innerHTML = "";
    box.append(errorState("Não foi possível carregar os funcionários.", carregar));
    return;
  }
  desenharResumo();
  desenharLista();
}

function desenharResumo() {
  const box = $("#func-resumo");
  if (!box) return;
  const ativos = funcionarios.filter((f) => f.active !== false);
  const folha = ativos.reduce((s, f) => s + (f.salary_cents || 0), 0);
  const setores = new Set(ativos.map((f) => (f.sector || "").trim()).filter(Boolean));
  box.innerHTML = "";
  box.append(
    card("Funcionários", String(ativos.length)),
    card("Folha mensal", formatBRL(folha), "saida"),
    card("Setores", String(setores.size))
  );
}

function card(label, valor, tipo = "") {
  return el("div", { class: `card stat ${tipo ? "stat--" + tipo : ""}` },
    el("div", { class: "stat__header" }, el("span", { class: "stat__label" }, label)),
    el("span", { class: "stat__value num" }, String(valor))
  );
}

function desenharLista() {
  const box = $("#func-lista");
  if (!box) return;

  box.innerHTML = "";
  if (funcionarios.length === 0) {
    box.append(emptyState("Nenhum funcionário ainda.\nCadastre o primeiro pra montar sua equipe.", ICON_ID));
    return;
  }

  const ul = el("ul", { class: "rec-list" });
  for (const f of funcionarios) ul.append(item(f));
  box.append(ul);
}

function item(f) {
  const acoes = el("div", { class: "rec__actions" },
    el("button", { class: "btn btn--tiny btn--ghost", onclick: () => abrirForm(f) }, "Editar"),
    el("button", { class: "btn btn--tiny btn--ghost", onclick: () => confirmarApagar(f) }, "Apagar")
  );
  const meta = [f.role, f.sector, f.hired_on ? "desde " + formatDate(f.hired_on) : ""].filter(Boolean).join(" · ");
  return el("li", { class: "rec" },
    el("span", { class: "cat__dot cat__dot--ambos" }),
    el("div", { class: "rec__main" },
      el("span", { class: "rec__desc" }, f.full_name),
      el("span", { class: "rec__meta" }, meta || "Sem cargo definido")
    ),
    el("div", { class: "rec__right" },
      f.salary_cents ? el("span", { class: "tx__value num" }, formatBRL(f.salary_cents)) : null,
      acoes
    )
  );
}

// ---- criar / editar (modal) ------------------------------------------------

function abrirForm(func = null) {
  const editando = !!func;
  const nome = el("input", { class: "input", placeholder: "Nome completo", value: func?.full_name || "" });
  const cpf = el("input", { class: "input", placeholder: "000.000.000-00", value: func?.cpf || "" });
  const cargo = el("input", { class: "input", placeholder: "Ex.: Vendedor, Caixa, Gerente", value: func?.role || "" });
  const setor = el("input", { class: "input", placeholder: "Ex.: Vendas, Cozinha, Administrativo", value: func?.sector || "" });
  const salario = el("input", { class: "input", placeholder: "0,00", inputmode: "decimal",
    value: func?.salary_cents ? (func.salary_cents / 100).toFixed(2).replace(".", ",") : "" });
  const admissao = el("input", { class: "input", type: "date", value: func?.hired_on || "" });
  const carteira = el("input", { class: "input", placeholder: "Nº da CTPS (opcional)", value: func?.work_card || "" });
  const registro = el("input", { class: "input", placeholder: "Registro / matrícula (opcional)", value: func?.registration || "" });
  const obs = el("input", { class: "input", placeholder: "Observações (opcional)", value: func?.notes || "" });
  const btn = el("button", { class: "btn btn--primary" }, "Salvar");

  async function salvar() {
    if (!nome.value.trim()) { toast("Digite o nome completo", "erro"); return; }
    btn.disabled = true; btn.textContent = "Salvando...";
    const dados = {
      full_name: nome.value.trim(),
      cpf: cpf.value.trim() || null,
      role: cargo.value.trim() || null,
      sector: setor.value.trim() || null,
      salary_cents: parseToCents(salario.value) || 0,
      hired_on: admissao.value || null,
      work_card: carteira.value.trim() || null,
      registration: registro.value.trim() || null,
      notes: obs.value.trim() || null,
    };
    try {
      if (editando) await atualizarFuncionario(func.id, dados);
      else await criarFuncionario(state.company.id, dados);
      closeModal();
      toast(editando ? "Funcionário atualizado" : "Funcionário cadastrado", "ok");
      await carregar();
    } catch (err) {
      console.error(err);
      toast("Não foi possível salvar", "erro");
      btn.disabled = false; btn.textContent = "Salvar";
    }
  }
  btn.addEventListener("click", salvar);

  openModal(editando ? "Editar funcionário" : "Novo funcionário",
    el("div", { class: "form" },
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Nome completo"), nome),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "CPF"), cpf),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Cargo"), cargo)
      ),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Setor"), setor),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Salário"), salario)
      ),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Data de entrada"), admissao),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Carteira de trabalho"), carteira)
      ),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Registro"), registro),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Observações"), obs),
      el("div", { class: "form__actions" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"), btn)
    )
  );
}

function confirmarApagar(f) {
  confirmar({
    titulo: "Apagar funcionário",
    texto: `Apagar o cadastro de "${f.full_name}"?`,
    confirmar: "Apagar", perigo: true,
  }, async () => { await apagarFuncionario(f.id); await carregar(); });
}
