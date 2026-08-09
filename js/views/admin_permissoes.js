import { el, $, toast, openModal, closeModal, skeletonList } from "../ui.js";
import { listarMembrosEmpresa, setMemberRole, listarMemberRoleAudit, exportMemberRoleAuditCSV } from "../api.js";
import { state } from "../state.js";

// Papéis em português. A tela inteira falava "owner/manager/member" pro dono
// de comércio, que não tem por que saber inglês de banco de dados.
const PAPEIS = { owner: "Dono", admin: "Admin", manager: "Gerente", member: "Membro" };

// Dono não entra: transferir a empresa não é um item de select que se muda sem
// querer. Quem precisa disso fala com a gente.
const PAPEIS_ATRIBUIVEIS = ["member", "manager", "admin"];

let membros = [];
let filtro = "";
let filtroPapel = "todos";

export async function renderAdminPermissoes(root, onBack) {
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head page-head--row" },
      el("div", {},
        el("h1", { class: "page-title" }, "Equipe — Permissões"),
        el("p", { class: "page-sub" }, "Quem acessa esta empresa e o que cada um pode fazer")
      ),
      el("div", { class: "page-head__acoes" },
        el("button", { class: "btn btn--ghost", onclick: () => { if (typeof onBack === 'function') onBack(root); } }, "← Voltar")
      )
    ),
    // Mesma fita de filtro do resto do app: os dois campos estavam soltos
    // dentro da placa, um pequeno e um ocupando a largura toda.
    el("section", { class: "filtros filtros--2" },
      el("label", { class: "filtro-grupo" },
        el("span", { class: "filtro-grupo__label" }, "Buscar"),
        buscaInput()
      ),
      el("label", { class: "filtro-grupo" },
        el("span", { class: "filtro-grupo__label" }, "Papel"),
        filtroPapelSelect()
      )
    ),
    el("section", { class: "card" },
      el("div", { class: "card__head" },
        el("h2", { class: "card__title" }, "Membros"),
        el("span", { class: "card__hint", id: "perm-conta" })
      ),
      el("div", { id: "perm-lista" }, skeletonList(6))
    )
  );

  await carregar(root);
}

function buscaInput() {
  const inp = el("input", { class: "input", type: "search", placeholder: "Nome ou email…", value: filtro });
  inp.addEventListener("input", (e) => { filtro = e.target.value; desenharLista(); });
  return inp;
}

function filtroPapelSelect() {
  const sel = el("select", { class: "input", onchange: (e) => { filtroPapel = e.target.value; desenharLista(); } },
    el("option", { value: "todos" }, "Todos"),
    ...Object.entries(PAPEIS).map(([v, label]) => el("option", { value: v }, label))
  );
  sel.value = filtroPapel;
  return sel;
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

  const conta = $("#perm-conta");
  if (conta) {
    conta.textContent = itens.length === membros.length
      ? `${membros.length} no total`
      : `${itens.length} de ${membros.length}`;
  }

  box.innerHTML = "";
  if (itens.length === 0) {
    box.append(el("div", { class: "empty" }, membros.length === 0 ? "Nenhum membro ainda." : "Nenhum membro encontrado."));
    return;
  }

  const ul = el("ul", { class: "admin-list" });
  for (const m of itens) ul.append(membroItem(m));
  box.append(ul);
}

function membroItem(m) {
  const papel = m.role || "member";
  const souEu = m.user_id === state.user?.id;
  // Duas travas que não existiam: dava pra rebaixar o dono e dava pra rebaixar
  // a si mesmo — este último tranca a pessoa fora da própria empresa, e o
  // caminho de volta é pelo banco.
  const podeTrocar = papel !== "owner" && !souEu;

  const acao = podeTrocar ? seletorDePapel(m) : el("span", { class: "badge badge--info" }, PAPEIS[papel] || papel);

  // O nome só é repetido embaixo quando é de fato outra informação: sem
  // full_name, nome e email são a mesma string e a linha saía duplicada.
  const nome = m.full_name || m.email || "—";
  const email = m.email && m.email !== nome ? m.email : null;

  return el("li", { class: "admin-cli" },
    el("div", { class: "admin-cli__main" },
      el("div", { class: "admin-cli__top" },
        el("span", { class: "admin-cli__name" }, nome),
        souEu ? el("span", { class: "badge badge--muted" }, "Você") : null
      ),
      email ? el("div", { class: "admin-cli__email" }, email) : null
    ),
    el("div", { class: "admin-cli__actions admin-cli__actions--linha" },
      acao,
      el("button", { class: "btn btn--ghost btn--tiny", onclick: () => abrirAudit(m) }, "Histórico")
    )
  );
}

function seletorDePapel(m) {
  const sel = el("select", { class: "input input--tiny", "aria-label": `Papel de ${m.email || m.full_name}` },
    ...PAPEIS_ATRIBUIVEIS.map((v) => el("option", { value: v }, PAPEIS[v]))
  );
  sel.value = PAPEIS_ATRIBUIVEIS.includes(m.role) ? m.role : "member";
  const anterior = () => { sel.value = PAPEIS_ATRIBUIVEIS.includes(m.role) ? m.role : "member"; };
  sel.addEventListener("change", async () => {
    const novo = sel.value;
    sel.disabled = true;
    try {
      await setMemberRole(state.company.id, m.user_id, novo);
      m.role = novo; // sem isto, desfazer um erro voltava pro papel velho
      toast(`${m.email || m.full_name} agora é ${PAPEIS[novo]}`, "ok");
    } catch (err) {
      console.error(err);
      toast("Não foi possível alterar o papel", "erro");
      anterior();
    } finally {
      sel.disabled = false;
    }
  });
  return sel;
}

let auditPage = 0;
const AUDIT_PAGE_SIZE = 10;

async function abrirAudit(m) {
  const user_id = m.user_id;
  const box = el("div", {}, el("div", { class: "loading" }, "Carregando..."));
  openModal(`Histórico de ${m.full_name || m.email || "membro"}`, box);
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

      // Se a RPC não devolver total_count, cai no que veio: sem isto a barra
      // dizia "Página 1 de 1 • 0 registros" com a lista cheia na frente.
      const total = rows[0]?.total_count || rows.length;
      const lastPage = Math.max(0, Math.ceil(total / AUDIT_PAGE_SIZE) - 1);

      const ul = el("ul", { class: "admin-pay__list" });
      for (const r of rows) {
        ul.append(el("li", { class: "admin-pay__item" },
          el("span", { class: "admin-pay__data" }, new Date(r.changed_at).toLocaleString("pt-BR")),
          el("span", { class: "admin-pay__val" },
            `${PAPEIS[r.old_role] || r.old_role || "—"} → ${PAPEIS[r.new_role] || r.new_role || "—"}`),
          el("span", { class: "admin-pay__obs" }, r.changed_by_email || "—")
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

      // Lista primeiro: a navegação vinha antes do conteúdo que ela navega.
      box.append(ul, nav,
        el("div", { class: "form__actions" },
          el("button", { class: "btn btn--ghost", onclick: closeModal }, "Fechar"),
          btnExportPage, btnExportAll));
    } catch (err) {
      console.error(err);
      box.innerHTML = "<p class=\"admin-pay__vazio\">Falha ao carregar auditoria.</p>";
    }
  }

  carregarPagina(auditPage);
}
