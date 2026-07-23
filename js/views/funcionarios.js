// ============================================================================
//  views/funcionarios.js — Funcionários (módulo ERP)
// ----------------------------------------------------------------------------
//  Cadastro de funcionários: nome, CPF, cargo, setor, salário, admissão,
//  carteira de trabalho, registro, contatos, status e observações.
// ============================================================================

import { el, $, toast, openModal, closeModal, confirmar, emptyState, errorState, skeletonList } from "../ui.js";
import { state } from "../state.js";
import { listarFuncionarios, criarFuncionario, atualizarFuncionario, apagarFuncionario, uploadEmployeeAttachment, listarEmployeeAttachments, urlComprovante, deleteAttachment, listarEmployeeAudit } from "../api.js";
import { formatBRL, formatDate, parseToCents } from "../money.js";

const ICON_ID = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M5 16a3 3 0 0 1 6 0"/><line x1="14" y1="9" x2="19" y2="9"/><line x1="14" y1="13" x2="19" y2="13"/></svg>`;

let funcionarios = [];
let filtros = { query: "", status: "all" };

function normalizarFuncionario(f) {
  const status = (f?.status || "").toString().trim() || (f?.active === false ? "inactive" : "active");
  return { ...f, status, active: f?.active ?? status === "active" };
}

// ---- detalhes (modal) ----------------------------------------------------
async function abrirDetalhes(func) {
  const box = el('div', { class: 'func-detalhe' });
  box.append(
    el('h2', {}, func.full_name),
    el('p', {}, `CPF: ${func.cpf || '-'}`),
    el('p', {}, `Cargo: ${func.role || '-'}`),
    el('p', {}, `Setor: ${func.sector || '-'}`),
    el('p', {}, `Salário: ${func.salary_cents ? formatBRL(func.salary_cents) : '-'}`),
    el('p', {}, `Admissão: ${func.hired_on || '-'}`),
    el('p', {}, `E-mail: ${func.email || '-'}`),
    el('p', {}, `Telefone: ${func.phone ? formatPhoneValue(func.phone) : '-'}`),
    el('p', {}, `Status: ${getStatusLabel(func)}`),
    el('hr', {}),
    el('h3', {}, 'Anexos'),
    el('div', { id: 'detalhe-anexos' }, 'Carregando anexos...'),
    el('h3', {}, 'Histórico de alterações'),
    el('div', { id: 'detalhe-audit' }, 'Carregando histórico...')
  );

  openModal('Detalhes do funcionário', box);

  // carregar anexos com miniaturas quando possível
  (async () => {
    const cont = $('#detalhe-anexos');
    try {
      const anexos = await listarEmployeeAttachments(state.company.id, func.id);
      cont.innerHTML = '';
      if (!anexos.length) cont.textContent = 'Nenhum anexo';
      for (const a of anexos) {
        const row = el('div', { class: 'anexo-row anexo-row--thumb' });
        try {
          const url = await urlComprovante(a.path);
          const isImage = /\.(jpe?g|png|gif|webp|bmp)$/i.test(a.filename || a.path);
          if (isImage) {
            const img = el('img', { src: url, style: 'max-width:120px;max-height:90px;cursor:pointer', onclick: () => window.open(url, '_blank') });
            row.append(img, el('div', { class: 'anexo-meta' }, el('div', {}, a.filename || a.path)));
          } else {
            row.append(el('a', { href: '#', onclick: async (ev) => { ev.preventDefault(); window.open(url,'_blank'); } }, a.filename || a.path));
          }
        } catch (e) {
          row.append(el('a', { href: '#', onclick: async (ev) => { ev.preventDefault(); try { const url = await urlComprovante(a.path); window.open(url,'_blank'); } catch { toast('Não foi possível abrir o anexo','erro'); } } }, a.filename || a.path));
        }
        cont.append(row);
      }
    } catch (e) { console.error(e); cont.textContent = 'Erro ao carregar anexos'; }
  })();

  // carregar audit
  (async () => {
    const cont = $('#detalhe-audit');
    try {
      const logs = await listarEmployeeAudit(func.id);
      cont.innerHTML = '';
      if (!logs.length) cont.textContent = 'Nenhum registro de auditoria';
      for (const l of logs) {
        const who = l.changed_by || 'system';
        const row = el('div', { class: 'audit-row' },
          el('div', { class: 'audit__head' }, `${l.operation} — ${new Date(l.changed_at).toLocaleString()} — ${who}`),
          el('pre', { class: 'audit__body' }, JSON.stringify({ old: l.old_data, new: l.new_data }, null, 2))
        );
        cont.append(row);
      }
    } catch (e) { console.error(e); cont.textContent = 'Erro ao carregar histórico'; }
  })();
}

function getStatusLabel(f) {
  if (f.status === "terminated") return "Demitido";
  if (f.status === "inactive") return "Inativo";
  return "Ativo";
}

function getStatusClass(f) {
  if (f.status === "terminated") return "status-pill--danger";
  if (f.status === "inactive") return "status-pill--muted";
  return "status-pill--ok";
}

function getFuncionariosVisiveis() {
  const query = filtros.query.trim().toLowerCase();
  return funcionarios.filter((f) => {
    const matchStatus = filtros.status === "all" || f.status === filtros.status;
    const searchable = [f.full_name, f.role, f.sector, f.email, f.phone].filter(Boolean).join(" ").toLowerCase();
    const matchQuery = !query || searchable.includes(query);
    return matchStatus && matchQuery;
  });
}

function formatCPFValue(value) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhoneValue(value) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function validarCPF(cpf) {
  const digits = String(cpf || "").replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
  let mod = (sum * 10) % 11;
  if (mod === 10) mod = 0;
  if (mod !== Number(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i);
  mod = (sum * 10) % 11;
  if (mod === 10) mod = 0;
  return mod === Number(digits[10]);
}

// --- CSV import helper ----------------------------------------------------
function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

async function handleCSVImport(file) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) { toast('CSV vazio ou sem cabeçalho', 'erro'); return; }
  const headers = splitCSVLine(lines[0]).map(h => h.toLowerCase());
  const rows = lines.slice(1);
  let success = 0, fail = 0;
  for (const row of rows) {
    const cols = splitCSVLine(row);
    const obj = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = cols[i] ?? '';
    const dados = {
      full_name: (obj['full_name'] || obj['nome'] || obj['name'] || '').trim(),
      cpf: (obj['cpf'] || '').replace(/\D/g, '') || null,
      role: (obj['role'] || obj['cargo'] || '').trim() || null,
      sector: (obj['sector'] || obj['setor'] || '').trim() || null,
      salary_cents: parseToCents(obj['salary'] || obj['salario'] || '') || 0,
      hired_on: (obj['hired_on'] || obj['admissao'] || '').trim() || null,
      email: (obj['email'] || '').trim() || null,
      phone: (obj['phone'] || obj['telefone'] || '').replace(/\D/g, '') || null,
      notes: (obj['notes'] || obj['observacoes'] || obj['obs'] || '').trim() || null,
    };
    try {
      await criarFuncionario(state.company.id, dados);
      success++;
    } catch (e) {
      console.error('CSV import error', e, row);
      fail++;
    }
  }
  toast(`Importação finalizada: ${success} adicionados, ${fail} falhas`, 'ok');
  await carregar();
}

export async function renderFuncionarios(root) {
  filtros = { query: "", status: "all" };
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, "Funcionários"),
        el("p", { class: "page-sub" }, "Equipe, cargos e folha salarial")
      ),
      el("div", {},
        el("button", { class: "btn btn--secondary", onclick: () => { fileCsvInput.click(); } }, "Importar CSV"),
        el("button", { class: "btn btn--primary", onclick: () => abrirForm() }, "+ Novo funcionário")
      ),
      // input invisível pra CSV
      el("input", { type: "file", id: "csv-file-input", style: "display:none", accept: ".csv" })
    ),
    el("section", { id: "func-filtros", class: "card" },
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" },
          el("span", { class: "field__label" }, "Buscar"),
          el("input", {
            class: "input",
            placeholder: "Nome, cargo ou setor",
            value: filtros.query,
            oninput: (event) => {
              filtros.query = event.target.value;
              desenharResumo();
              desenharLista();
            },
          })
        ),
        el("label", { class: "field" },
          el("span", { class: "field__label" }, "Status"),
          el("select", {
            class: "input",
            onchange: (event) => {
              filtros.status = event.target.value;
              desenharResumo();
              desenharLista();
            },
          },
            el("option", { value: "all" }, "Todos"),
            el("option", { value: "active" }, "Ativos"),
            el("option", { value: "inactive" }, "Inativos"),
            el("option", { value: "terminated" }, "Demitidos")
          )
        )
      )
    ),
    el("section", { id: "func-resumo", class: "stats admin-resumo" }),
    el("div", { id: "func-lista", class: "card" }, skeletonList(5))
  );
  await carregar();
  const csvInput = $("#csv-file-input");
  if (csvInput) csvInput.addEventListener('change', async (ev) => { if (ev.target.files?.length) { await previewCSVImport(ev.target.files[0]); ev.target.value = ''; } });
}

async function carregar() {
  const box = $("#func-lista");
  if (!box) return;
  box.innerHTML = ""; box.append(skeletonList(5));
  try {
    funcionarios = (await listarFuncionarios(state.company.id)).map(normalizarFuncionario);
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
  const visiveis = getFuncionariosVisiveis();
  const ativos = visiveis.filter((f) => f.status === "active");
  const inativos = visiveis.filter((f) => f.status !== "active");
  const folha = ativos.reduce((s, f) => s + (f.salary_cents || 0), 0);
  const setores = new Set(ativos.map((f) => (f.sector || "").trim()).filter(Boolean));
  box.innerHTML = "";
  box.append(
    card("Funcionários", String(visiveis.length)),
    card("Ativos", String(ativos.length), "ok"),
    card("Inativos", String(inativos.length), "saida"),
    card("Folha mensal", formatBRL(folha), "saida")
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

  const visiveis = getFuncionariosVisiveis();
  box.innerHTML = "";
  if (visiveis.length === 0) {
    box.append(emptyState("Nenhum funcionário encontrado com esses filtros.", ICON_ID));
    return;
  }

  const ul = el("ul", { class: "rec-list" });
  for (const f of visiveis) ul.append(item(f));
  box.append(ul);
}

function item(f) {
  const acoes = el("div", { class: "rec__actions" },
    el("button", { class: "btn btn--tiny btn--ghost", onclick: () => abrirForm(f) }, "Editar"),
    el("button", { class: "btn btn--tiny btn--ghost", onclick: () => alternarStatus(f) }, f.status === "active" ? "Desativar" : "Reativar")
  );
  const meta = [f.role, f.sector, f.hired_on ? "desde " + formatDate(f.hired_on) : ""].filter(Boolean).join(" · ");
  return el("li", { class: "rec" },
    el("span", { class: "cat__dot cat__dot--ambos" }),
    el("div", { class: "rec__main" },
      el("div", { class: "rec__title-row" },
        el("a", { href: "#", class: "rec__desc", onclick: (e) => { e.preventDefault(); abrirDetalhes(f); } }, f.full_name),
        el("span", { class: `status-pill ${getStatusClass(f)}` }, getStatusLabel(f))
      ),
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
  const cpf = el("input", { class: "input", placeholder: "000.000.000-00", value: func?.cpf ? formatCPFValue(func.cpf) : "", oninput: (event) => { cpf.value = formatCPFValue(event.target.value); } });
  const cargo = el("input", { class: "input", placeholder: "Ex.: Vendedor, Caixa, Gerente", value: func?.role || "" });
  const setor = el("input", { class: "input", placeholder: "Ex.: Vendas, Cozinha, Administrativo", value: func?.sector || "" });
  const salario = el("input", { class: "input", placeholder: "0,00", inputmode: "decimal",
    value: func?.salary_cents ? (func.salary_cents / 100).toFixed(2).replace(".", ",") : "" });
  const admissao = el("input", { class: "input", type: "date", value: func?.hired_on || "" });
  const carteira = el("input", { class: "input", placeholder: "Nº da CTPS (opcional)", value: func?.work_card || "" });
  const registro = el("input", { class: "input", placeholder: "Registro / matrícula (opcional)", value: func?.registration || "" });
  const email = el("input", { class: "input", type: "email", placeholder: "email@empresa.com", value: func?.email || "" });
  const phone = el("input", { class: "input", placeholder: "(11) 99999-9999", value: func?.phone ? formatPhoneValue(func.phone) : "", oninput: (event) => { phone.value = formatPhoneValue(event.target.value); } });
  const status = el("select", { class: "input" },
    el("option", { value: "active" }, "Ativo"),
    el("option", { value: "inactive" }, "Inativo"),
    el("option", { value: "terminated" }, "Demitido")
  );
  status.value = func?.status || (func?.active === false ? "inactive" : "active");
  const demissao = el("input", { class: "input", type: "date", value: func?.terminated_on || "" });
  const obs = el("input", { class: "input", placeholder: "Observações (opcional)", value: func?.notes || "" });
  const attachmentInput = el("input", { class: "input", type: "file", accept: ".pdf,.jpg,.png,.jpeg" });
  const btn = el("button", { class: "btn btn--primary" }, "Salvar");
  const attachmentsBox = el("div", { class: "attachments-box" }, "");

  async function salvar() {
    if (!nome.value.trim()) { toast("Digite o nome completo", "erro"); return; }
    const cpfDigits = cpf.value.replace(/\D/g, "");
    if (cpfDigits && cpfDigits.length !== 11) { toast("CPF deve ter 11 dígitos", "erro"); return; }
    if (cpfDigits && !validarCPF(cpfDigits)) { toast("CPF inválido", "erro"); return; }
    btn.disabled = true; btn.textContent = "Salvando...";
    const statusValue = status.value || "active";
    const dados = {
      full_name: nome.value.trim(),
      cpf: cpfDigits || null,
      role: cargo.value.trim() || null,
      sector: setor.value.trim() || null,
      salary_cents: parseToCents(salario.value) || 0,
      hired_on: admissao.value || null,
      work_card: carteira.value.trim() || null,
      registration: registro.value.trim() || null,
      email: email.value.trim() || null,
      phone: phone.value.replace(/\D/g, "") || null,
      status: statusValue,
      active: statusValue === "active",
      terminated_on: statusValue === "terminated" ? demissao.value || null : null,
      notes: obs.value.trim() || null,
      updated_at: new Date().toISOString(),
    };
    try {
      let created = null;
      if (editando) {
        await atualizarFuncionario(func.id, dados);
        created = { id: func.id };
      } else {
        created = await criarFuncionario(state.company.id, dados);
      }
      // upload de anexo, se houver
      const file = attachmentInput.files?.[0];
      if (file && created?.id) {
        try { await uploadEmployeeAttachment(state.company.id, created.id, file); }
        catch (e) { console.error('Upload anexo falhou', e); toast('Anexo não enviado', 'erro'); }
      }
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
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Status"), status)
      ),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "E-mail"), email),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Telefone"), phone)
      ),
      el("div", { class: "admin-pay__row" },
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Data de demissão"), demissao),
        el("label", { class: "field" }, el("span", { class: "field__label" }, "Carteira de trabalho"), carteira)
      ),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Registro"), registro),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Observações"), obs),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Arquivo (comprovante, opcional)"), attachmentInput),
      el("div", { class: "field" }, el("span", { class: "field__label" }, "Anexos"), attachmentsBox),
      el("div", { class: "form__actions" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"), btn)
    )
  );
  
  // carregar anexos existentes quando editando
  async function carregarAnexos() {
    attachmentsBox.innerHTML = "Carregando anexos...";
    if (!editando) { attachmentsBox.innerHTML = "Nenhum anexo"; return; }
    try {
      const anexos = await listarEmployeeAttachments(state.company.id, func.id);
      if (!anexos || anexos.length === 0) { attachmentsBox.innerHTML = "Nenhum anexo"; return; }
      attachmentsBox.innerHTML = "";
      for (const a of anexos) {
        const row = el("div", { class: "anexo-row anexo-row--thumb" });
        try {
          const url = await urlComprovante(a.path);
          const isImage = /\.(jpe?g|png|gif|webp|bmp)$/i.test(a.filename || a.path);
          if (isImage) {
            const img = el('img', { src: url, style: 'max-width:120px;max-height:90px;cursor:pointer', onclick: () => window.open(url, '_blank') });
            row.append(img, el('div', { class: 'anexo-meta' }, el('div', {}, a.filename || a.path)));
          } else {
            row.append(el('a', { href: '#', onclick: async (ev) => { ev.preventDefault(); window.open(url, '_blank'); } }, a.filename || a.path));
          }
        } catch (e) {
          row.append(el('a', { href: '#', onclick: async (ev) => { ev.preventDefault(); try { const url = await urlComprovante(a.path); window.open(url, '_blank'); } catch (e) { toast('Não foi possível abrir o arquivo', 'erro'); } } }, a.filename || a.path));
        }
        row.append(el("button", { class: "btn btn--tiny btn--danger", onclick: async () => {
          if (!confirm(`Apagar anexo "${a.filename || a.path}"?`)) return;
          try { await deleteAttachment(a.id, a.path); toast('Anexo apagado', 'ok'); await carregarAnexos(); } catch (e) { console.error(e); toast('Não foi possível apagar anexo', 'erro'); }
        } }, "Apagar"));
        attachmentsBox.append(row);
      }
    } catch (e) {
      console.error(e);
      attachmentsBox.innerHTML = "Erro ao carregar anexos";
    }
  }
  carregarAnexos();
}

// ---------------- CSV preview antes de importar ---------------------------
async function previewCSVImport(file) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) { toast('CSV vazio ou sem cabeçalho', 'erro'); return; }
  const headers = splitCSVLine(lines[0]).map(h => h.trim());
  const sample = lines.slice(1, 11).map(l => splitCSVLine(l));

  const table = el('table', { class: 'csv-preview' });
  table.append(el('thead', {}, el('tr', {}, ...headers.map(h => el('th', {}, h)))));
  const tbody = el('tbody', {});
  for (const row of sample) tbody.append(el('tr', {}, ...row.map(c => el('td', {}, c))));
  table.append(tbody);

  let importing = false;
  const modalBody = el('div', {}, el('p', {}, `Cabeçalhos detectados: ${headers.join(', ')}`), table);
  openModal('Pré-visualização CSV', modalBody, {
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Importar', kind: 'primary', onClick: async () => {
        if (importing) return; importing = true;
        let added = 0, failed = 0;
        for (let i = 1; i < lines.length; i++) {
          const cols = splitCSVLine(lines[i]);
          const obj = {};
          for (let j = 0; j < headers.length; j++) obj[headers[j].toLowerCase()] = cols[j] ?? '';
          const dados = {
            full_name: (obj['full_name'] || obj['nome'] || obj['name'] || '').trim(),
            cpf: (obj['cpf'] || '').replace(/\D/g, '') || null,
            role: (obj['role'] || obj['cargo'] || '').trim() || null,
            sector: (obj['sector'] || obj['setor'] || '').trim() || null,
            salary_cents: parseToCents(obj['salary'] || obj['salario'] || '') || 0,
            hired_on: (obj['hired_on'] || obj['admissao'] || '').trim() || null,
            email: (obj['email'] || '').trim() || null,
            phone: (obj['phone'] || obj['telefone'] || '').replace(/\D/g, '') || null,
            notes: (obj['notes'] || obj['observacoes'] || obj['obs'] || '').trim() || null,
          };
          try { await criarFuncionario(state.company.id, dados); added++; } catch (e) { failed++; }
        }
        closeModal();
        toast(`Importação: ${added} adicionados, ${failed} falhas`, 'ok');
        await carregar();
      } }
    ]
  });
}

async function alternarStatus(f) {
  const novoStatus = f.status === "active" ? "inactive" : "active";
  try {
    await atualizarFuncionario(f.id, {
      active: novoStatus === "active",
      status: novoStatus,
      terminated_on: null,
      updated_at: new Date().toISOString(),
    });
    toast(novoStatus === "active" ? "Funcionário reativado" : "Funcionário desativado", "ok");
    await carregar();
  } catch (err) {
    console.error(err);
    toast("Não foi possível alterar o status", "erro");
  }
}

function confirmarApagar(f) {
  confirmar({
    titulo: "Desativar funcionário",
    texto: `Desativar "${f.full_name}"?`,
    confirmar: "Desativar", perigo: true,
  }, async () => { await apagarFuncionario(f.id); await carregar(); });
}
