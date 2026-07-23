import { el, $, toast, openModal, closeModal, skeletonList } from "../ui.js";
import { listarMembrosEmpresa, setMemberRole, listarMemberRoleAudit, exportMemberRoleAuditCSV } from "../api.js";
import { state } from "../state.js";

let membros = [];
let filtro = "";
let filtroPapel = "todos";

export async function renderAdminPermissoes(root, onBack) {
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, "Equipe — Permissões"),
        el("p", { class: "page-sub" }, "Gerencie papéis, revise auditoria e exporte históricos")
      ),
      el("div", {},
        el("button", { class: "btn btn--ghost", onclick: () => { if (typeof onBack === 'function') onBack(root); } }, "← Voltar")
      )
    ),
    el("section", { class: "card" },
      buscaInput(),
      filtroPapelSelect(),
      el("div", { id: "perm-lista" }, skeletonList(6))
    )
  );

  await carregar(root);
}

function buscaInput() {
  const inp = el("input", { class: "input admin-busca", type: "search", placeholder: "Buscar por nome ou email…", value: filtro });
  inp.addEventListener("input", (e) => { filtro = e.target.value; desenharLista(); });
  return inp;
}

function filtroPapelSelect() {
  const sel = el("select", { class: "input", onchange: (e) => { filtroPapel = e.target.value; desenharLista(); } },
    el("option", { value: "todos" }, "Todos"),
    el("option", { value: "owner" }, "Owner"),
    el("option", { value: "admin" }, "Admin"),
    el("option", { value: "manager" }, "Manager"),
    el("option", { value: "member" }, "Member")
  );
  sel.value = filtroPapel;
  return el("label", { class: "field" },
    el("span", { class: "field__label" }, "Filtrar por papel"),
    sel
  );
}

async function carregar(root) {
  const box = $("#perm-lista");
  if (!box) return;
  box.innerHTML = "";
  box.append(skeletonList(6));
  try {
    // listarMembrosEmpresa deve retornar membros da company do usuário
    membros = await listarMembrosEmpresa(state.company.id);
  } catch (err) {
    console.error(err);
    box.innerHTML = "";
    box.append(el("div", {}, "Não foi possível carregar os membros."));
    return;
  }
  desenharLista();
}

function desenharLista() {
  const box = $("#perm-lista");
  if (!box) return;

  const termo = (filtro || "").trim().toLowerCase();
  const itens = membros.filter((m) => {
    if (filtroPapel !== "todos" && (m.role || "member") !== filtroPapel) return false;
    if (!termo) return true;
    return (m.email || "").toLowerCase().includes(termo) || (m.full_name || "").toLowerCase().includes(termo);
  });

  box.innerHTML = "";
  if (itens.length === 0) {
    box.append(el("div", { class: "empty" }, membros.length === 0 ? "Nenhum membro ainda." : "Nenhum membro encontrado."));
    return;
  }

  const ul = el("ul", { class: "admin-list" });
  for (const m of itens) {
    const roleSel = el("select", { class: "input" },
      el("option", { value: "owner" }, "Owner"),
      el("option", { value: "admin" }, "Admin"),
      el("option", { value: "manager" }, "Manager"),
      el("option", { value: "member" }, "Member")
    );
    roleSel.value = m.role || "member";
    roleSel.addEventListener("change", async () => {
      const novo = roleSel.value;
      try {
        await setMemberRole(state.company.id, m.user_id, novo);
        toast(`Papel de ${m.email} alterado para ${novo}` , "ok");
      } catch (err) {
        console.error(err);
        toast("Erro ao alterar papel", "erro");
        roleSel.value = m.role || "member";
      }
    });

    const btnAudit = el("button", { class: "btn btn--ghost btn--tiny", onclick: () => abrirAudit(m.user_id) }, "Audit");

    ul.append(el("li", { class: "admin-cli" },
      el("div", { class: "admin-cli__main" },
        el("div", { class: "admin-cli__top" }, el("span", { class: "admin-cli__name" }, m.full_name || m.email), el("span", { class: "admin-cli__email" }, m.email || "—")),
        el("div", { class: "admin-cli__meta" }, el("span", { class: "admin-cli__metavalue" }, `Papel: ${m.role || 'member'}`))
      ),
      el("div", { class: "admin-cli__actions" }, roleSel, btnAudit)
    ));
  }
  box.append(ul);
}

let auditPage = 0;
const AUDIT_PAGE_SIZE = 10;

async function abrirAudit(user_id) {
  const box = el("div", {}, el("div", { class: "loading" }, "Carregando auditoria..."));
  openModal("Histórico de papéis", box);
  auditPage = 0;

  async function carregarPagina(page) {
    const offset = page * AUDIT_PAGE_SIZE;
    try {
      const rows = await listarMemberRoleAudit(state.company.id, AUDIT_PAGE_SIZE, offset, user_id);
      box.innerHTML = "";
      if (!rows || rows.length === 0) {
        box.append(el("p", { class: "admin-pay__vazio" }, "Nenhuma alteração registrada."));
        return;
      }

      const total = rows[0]?.total_count || 0;
      const lastPage = Math.max(0, Math.ceil(total / AUDIT_PAGE_SIZE) - 1);

      const ul = el("ul", { class: "admin-pay__list" });
      for (const r of rows) {
        ul.append(el("li", { class: "admin-pay__item" },
          el("span", { class: "admin-pay__data" }, new Date(r.changed_at).toLocaleString()),
          el("span", { class: "admin-pay__val num" }, r.old_role || "-" , " → ", r.new_role || "-"),
          el("span", { class: "admin-pay__obs" }, r.changed_by_email || "-")
        ));
      }

      const btnExportPage = el("button", { class: "btn btn--ghost", onclick: async () => {
        try {
          const csv = await exportMemberRoleAuditCSV(state.company.id, user_id, AUDIT_PAGE_SIZE, offset);
          const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `company_${state.company.id}_members_audit_${user_id}_page_${page + 1}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast('CSV da página exportado', 'ok');
        } catch (e) {
          console.error(e);
          toast('Erro exportando', 'erro');
        }
      } }, "Exportar página");

      const btnExportAll = el("button", { class: "btn btn--ghost", onclick: async () => {
        try {
          const totalRecords = rows[0]?.total_count || 0;
          const csv = await exportMemberRoleAuditCSV(state.company.id, user_id, totalRecords, 0);
          const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `company_${state.company.id}_members_audit_${user_id}_all.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast('CSV completo exportado', 'ok');
        } catch (e) {
          console.error(e);
          toast('Erro exportando', 'erro');
        }
      } }, "Exportar tudo");

      const nav = el("div", { class: "admin-pay__pagination" },
        el("button", { class: "btn btn--ghost btn--tiny", disabled: page === 0, onclick: () => carregarPagina(page - 1) }, "Anterior"),
        el("span", { class: "admin-pay__page" }, `Página ${page + 1} de ${lastPage + 1} • ${total} registros`),
        el("button", { class: "btn btn--ghost btn--tiny", disabled: page >= lastPage, onclick: () => carregarPagina(page + 1) }, "Próxima")
      );

      box.append(nav, ul, el("div", { class: "form__actions" }, btnExportPage, btnExportAll));
    } catch (err) {
      console.error(err);
      box.innerHTML = "<p class=\"admin-pay__vazio\">Falha ao carregar auditoria.</p>";
    }
  }

  carregarPagina(auditPage);
}

// placeholder para permitir import circular — será substituído no build do app
export function renderAdmin() { /* placeholder para voltar */ }
