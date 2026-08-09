// ============================================================================
//  views/configuracoes.js — Configurações da empresa e da conta
// ============================================================================

import { el, $, toast, senhaInput, confirmar, openModal, closeModal } from "../ui.js";
import { state } from "../state.js";
import {
  atualizarEmpresa,
  convidar, enviarEmailConvite, listarConvites, revogarConvite, listarMembros, removerMembro,
  setMemberRole, listarMemberRoleAudit, exportMemberRoleAuditCSV,
  meusConvites, aceitarConvite,
  criarAssinatura,
} from "../api.js";
import { updateEmail, updatePassword, signOut, salvarPreferencias } from "../auth.js";
import { getTheme, setTheme } from "../theme.js";
import { MOEDAS_LISTA, getMoeda, setMoeda } from "../money.js";
import { planoDe, nomePlano } from "../planos.js";

export function renderConfiguracoes(root) {
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head" },
      el("h1", { class: "page-title" }, "Configurações"),
      el("p", { class: "page-sub" }, "Empresa, conta e preferências")
    ),
    // Duas colunas no desktop: as seções são independentes entre si e não há
    // motivo pra empilhar oito placas num corredor de 560px.
    el("div", { class: "config-grid" },
      secaoPlano(),
      // Seis seções curtas em três linhas limpas; equipe e sessão, que crescem
      // sem limite, viram faixas de largura cheia embaixo.
      secaoAparencia(),
      secaoMoeda(),
      secaoEmpresa(),
      secaoEmail(),
      secaoSenha(),
      secaoEquipe(),
      secaoSair()
    )
  );
}

// ── Seção: Moeda ──────────────────────────────────────────────────────────────

function secaoMoeda() {
  const sel = el("select", { class: "input" },
    ...MOEDAS_LISTA.map((m) => el("option", { value: m.code }, m.nome))
  );
  sel.value = getMoeda();
  sel.addEventListener("change", () => {
    setMoeda(sel.value);
    toast("Moeda atualizada", "ok");
    // Sem reload: formatBRL lê a moeda a cada chamada, e a casca do app não
    // mostra valor nenhum — a próxima tela já desenha no formato novo.
    // Guardar na conta é o que faz a escolha atravessar pro outro aparelho;
    // se falhar (offline), a troca local já valeu e não vale interromper.
    salvarPreferencias({ moeda: sel.value }).catch(console.error);
  });
  return secao("Moeda",
    el("p", { class: "config__hint" },
      "Símbolo e formato dos valores no app. A escolha vale em qualquer aparelho onde você entrar."),
    el("label", { class: "field" },
      el("span", { class: "field__label" }, "Moeda"), sel)
  );
}

// ── Seção: Equipe (membros + convites) ────────────────────────────────────────

function secaoEquipe() {
  const ehDono = state.company?.owner_id === state.user?.id;
  const box = el("div", {}, el("div", { class: "loading" }, "Carregando..."));

  async function carregar() {
    box.innerHTML = "";

    // As quatro consultas são independentes: em série a seção levava quatro
    // idas ao banco uma depois da outra. allSettled porque três delas são
    // opcionais — convite e histórico podem não existir ainda.
    const [rMembros, rConvites, rRecebidos, rAudit] = await Promise.allSettled([
      listarMembros(state.company.id),
      ehDono ? listarConvites(state.company.id) : Promise.resolve([]),
      meusConvites(),
      listarMemberRoleAudit(state.company.id, 50),
    ]);

    if (rMembros.status === "rejected") {
      console.error(rMembros.reason);
      box.append(el("p", { class: "admin-pay__vazio" }, "Não foi possível carregar a equipe."));
      return;
    }
    const membros = rMembros.value;
    const convites = rConvites.status === "fulfilled" ? rConvites.value : [];
    const audit = rAudit.status === "fulfilled" ? (rAudit.value || []) : [];

    // Convites que EU recebi (de outras empresas) — sempre visível.
    const recebidos = (rRecebidos.status === "fulfilled" ? rRecebidos.value : [])
      .filter((r) => r.company_id !== state.company.id);
    if (recebidos.length) {
      const ulr = el("ul", { class: "rec-list" });
      for (const r of recebidos) {
        const bAcc = el("button", { class: "btn btn--tiny btn--primary" }, "Aceitar");
        bAcc.addEventListener("click", async () => {
          bAcc.disabled = true; bAcc.textContent = "Aceitando...";
          try {
            await aceitarConvite(r.id);
            toast("Convite aceito! Troque de empresa no topo pra acessá-la.", "ok");
            location.reload();
          } catch (err) {
            console.error(err); toast("Não foi possível aceitar", "erro");
            bAcc.disabled = false; bAcc.textContent = "Aceitar";
          }
        });
        ulr.append(el("li", { class: "rec" },
          el("div", { class: "rec__main" },
            el("span", { class: "rec__desc" }, r.company_name),
            el("span", { class: "rec__meta" }, "Você foi convidado")
          ),
          el("div", { class: "rec__actions" }, bAcc)
        ));
      }
      box.append(el("h3", { class: "admin-pay__titulo" }, "Convites recebidos"), ulr);
    }

    // Membros
    const ul = el("ul", { class: "rec-list" });
    for (const m of membros) {
      const acoes = el("div", { class: "rec__actions" });
      if (ehDono && m.user_id !== state.user.id && m.role !== "owner") {
        // select para alterar papel
        const sel = el('select', { class: 'input input--tiny' },
          el('option', { value: 'member' }, 'Membro'),
          el('option', { value: 'manager' }, 'Manager'),
          el('option', { value: 'admin' }, 'Admin')
        );
        sel.value = m.role || 'member';
        sel.addEventListener('change', async () => {
          try {
            sel.disabled = true;
            await setMemberRole(state.company.id, m.user_id, sel.value);
            toast('Papel atualizado', 'ok');
            carregar();
          } catch (e) { console.error(e); toast('Não foi possível alterar o papel', 'erro'); sel.disabled = false; }
        });
        acoes.append(sel);

        const bRem = el("button", { class: "btn btn--tiny btn--ghost" }, "Remover");
        bRem.addEventListener("click", () => {
          confirmar({
            titulo: "Remover membro",
            texto: `Remover ${m.email} da equipe? A pessoa perde o acesso a esta empresa.`,
            confirmar: "Remover", perigo: true,
          }, async () => { await removerMembro(state.company.id, m.user_id); carregar(); });
        });
        acoes.append(bRem);
      }
      ul.append(el("li", { class: "rec" },
        el("div", { class: "rec__main" },
          el("span", { class: "rec__desc" }, m.email + (m.user_id === state.user.id ? " (você)" : "")),
          el("span", { class: "rec__meta" }, m.role === "owner" ? "Dono" : "Membro")
        ),
        acoes
      ));
    }
    box.append(el("h3", { class: "admin-pay__titulo" }, "Membros"), ul);

    // Histórico de alterações de papéis
    if (audit.length) {
      const ulh = el('ul', { class: 'rec-list' });
      for (const a of audit) {
        ulh.append(el('li', { class: 'rec' },
          el('div', { class: 'rec__main' },
            el('span', { class: 'rec__desc' }, a.user_email || a.user_id),
            el('span', { class: 'rec__meta' }, `${a.old_role || '-'} → ${a.new_role || '-'}`)
          ),
          el('div', { class: 'rec__right' }, new Date(a.changed_at).toLocaleString())
        ));
      }
      const btnExport = el('button', { class: 'btn btn--ghost', onclick: async () => {
        try {
          const csv = await exportMemberRoleAuditCSV(state.company.id);
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `company_${state.company.id}_members_audit.csv`; a.click(); URL.revokeObjectURL(url);
        } catch (e) { console.error(e); toast('Erro ao exportar CSV','erro'); }
      } }, 'Exportar CSV');
      box.append(el('h3', { class: 'admin-pay__titulo', style: 'margin-top:18px' }, 'Histórico de papéis'), btnExport, ulh);
    }

    // Convites pendentes (só o dono)
    if (ehDono && convites.length) {
      const ulc = el("ul", { class: "rec-list" });
      for (const cv of convites) {
        const bCopy = el("button", { class: "btn btn--tiny btn--ghost" }, "Copiar convite");
        bCopy.addEventListener("click", async () => {
          const msg =
            `Você foi convidado para acessar "${state.company.name}" no Monetta.\n` +
            `Crie sua conta (ou entre) com o email ${cv.email} e aceite o convite.\n` +
            `Acesse: ${window.location.origin}`;
          try {
            await navigator.clipboard.writeText(msg);
            toast("Convite copiado — cole no WhatsApp ou email", "ok");
          } catch (err) {
            console.error(err);
            toast("Não foi possível copiar", "erro");
          }
        });
        const bRev = el("button", { class: "btn btn--tiny btn--ghost" }, "Revogar");
        bRev.addEventListener("click", () => {
          confirmar({
            titulo: "Revogar convite",
            texto: `Revogar o convite de ${cv.email}?`,
            confirmar: "Revogar", perigo: true,
          }, async () => { await revogarConvite(cv.id); carregar(); });
        });
        ulc.append(el("li", { class: "rec" },
          el("div", { class: "rec__main" },
            el("span", { class: "rec__desc" }, cv.email),
            el("span", { class: "rec__meta" }, "Convite pendente")
          ),
          el("div", { class: "rec__actions" }, bCopy, bRev)
        ));
      }
      box.append(el("h3", { class: "admin-pay__titulo", style: "margin-top:18px" }, "Convites pendentes"), ulc);
    }
  }

  const filhos = [
    el("p", { class: "config__hint" }, ehDono
      ? "Convide pessoas pra acessar esta empresa (sócio, contador…). Elas precisam ter conta com o mesmo email."
      : "Pessoas com acesso a esta empresa."),
    box,
  ];

  if (ehDono) {
    const email = el("input", { class: "input", type: "email", placeholder: "email@pessoa.com" });
    const btn = el("button", { class: "btn btn--primary" }, "Convidar");
    async function convidarFn() {
      const e = email.value.trim();
      if (!e) { toast("Digite o email", "erro"); return; }
      btn.disabled = true; btn.textContent = "Convidando...";
      try {
        const inv = await convidar(state.company.id, e);
        // Dispara o email do convite (não-fatal se o email não estiver configurado).
        try { await enviarEmailConvite(inv.id, window.location.origin); } catch (e2) { console.error(e2); }
        email.value = "";
        toast("Convite criado — use 'Copiar convite' pra mandar pra pessoa", "ok");
        carregar();
      } catch (err) {
        console.error(err);
        const dup = /duplicate|already|unique/i.test(err?.message || "");
        toast(dup ? "Já existe um convite para esse email" : "Não foi possível convidar", "erro");
      } finally {
        btn.disabled = false; btn.textContent = "Convidar";
      }
    }
    btn.addEventListener("click", convidarFn);
    email.addEventListener("keydown", (ev) => { if (ev.key === "Enter") convidarFn(); });

    filhos.push(
      el("hr", { class: "admin-conta__sep" }),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Convidar por email"), email),
      el("div", { class: "form__actions" }, btn)
    );
  }

  // Cresce com membros, convites e histórico: largura cheia, embaixo das colunas.
  const card = secao("Equipe", ...filhos);
  card.classList.add("config-secao--full");
  carregar();
  return card;
}

// ── Seção: Aparência (tema) ───────────────────────────────────────────────────

function secaoAparencia() {
  const opcoes = [
    { id: "light",  titulo: "Claro",      desc: "Fundo claro, ideal para o dia a dia" },
    { id: "dark",   titulo: "Escuro",     desc: "Fundo escuro, mais suave à noite" },
    { id: "system", titulo: "Automático", desc: "Acompanha o tema do seu sistema" },
  ];

  const grupo = el("div", { class: "theme-options", role: "radiogroup", "aria-label": "Tema" });

  function marcar(ativo) {
    grupo.querySelectorAll(".theme-option").forEach((b) => {
      const on = b.dataset.theme === ativo;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  for (const op of opcoes) {
    const btn = el("button", {
      type: "button",
      class: "theme-option",
      role: "radio",
      "data-theme": op.id,
    },
      el("span", { class: `theme-option__preview theme-option__preview--${op.id}` },
        el("span", { class: "theme-option__bar" }),
        el("span", { class: "theme-option__dot" })
      ),
      el("span", { class: "theme-option__titulo" }, op.titulo),
      el("span", { class: "theme-option__desc" }, op.desc)
    );
    btn.addEventListener("click", () => {
      setTheme(op.id);
      marcar(op.id);
      salvarPreferencias({ theme: op.id }).catch(console.error);
    });
    grupo.append(btn);
  }

  marcar(getTheme());

  return secao("Aparência",
    el("p", { class: "config__hint" }, "Escolha como o aplicativo aparece para você. A escolha vale em qualquer aparelho onde você entrar."),
    grupo
  );
}

// ── Seção: Empresa ──────────────────────────────────────────────────────────

function secaoEmpresa() {
  const nomeInput = el("input", {
    class: "input",
    type: "text",
    value: state.company.name,
    placeholder: "Nome da empresa",
  });
  const btn = el("button", { class: "btn btn--primary" }, "Salvar");

  async function salvar() {
    const nome = nomeInput.value.trim();
    if (!nome) { toast("Digite o nome da empresa", "erro"); return; }
    if (nome === state.company.name) { toast("Nenhuma alteração", "info"); return; }

    btn.disabled = true;
    btn.textContent = "Salvando...";
    try {
      const atualizada = await atualizarEmpresa(state.company.id, nome);
      state.company = atualizada;
      // Atualiza o badge do topbar
      const badge = $("#empresa-nome");
      if (badge) {
        badge.textContent = atualizada.name;
        badge.setAttribute("title", atualizada.name);
      }
      toast("Nome atualizado!", "ok");
    } catch (err) {
      toast("Não foi possível salvar", "erro");
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = "Salvar";
    }
  }

  btn.addEventListener("click", salvar);
  nomeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") salvar(); });

  return secao("Empresa",
    el("p", { class: "config__hint" }, "Este nome aparece no topo de cada tela e nos relatórios exportados."),
    el("label", { class: "field" },
      el("span", { class: "field__label" }, "Nome da empresa"),
      nomeInput
    ),
    el("div", { class: "form__actions" }, btn)
  );
}

// ── Seção: Email ─────────────────────────────────────────────────────────────

function secaoEmail() {
  const emailAtual = state.user?.email ?? "";
  const emailInput = el("input", {
    class: "input",
    type: "email",
    placeholder: emailAtual,
    autocomplete: "email",
  });
  const btn = el("button", { class: "btn btn--primary" }, "Atualizar email");
  const aviso = el("p", { class: "config__sucesso", hidden: "" });

  async function salvar() {
    const email = emailInput.value.trim();
    if (!email) { toast("Digite o novo email", "erro"); return; }
    if (email === emailAtual) { toast("É o mesmo email atual", "info"); return; }

    btn.disabled = true;
    btn.textContent = "Enviando...";
    try {
      await updateEmail(email);
      aviso.textContent =
        `Enviamos um link de confirmação para ${email}. ` +
        `O email só muda depois que você abrir esse email e clicar no link.`;
      aviso.hidden = false;
      emailInput.value = "";
    } catch (err) {
      toast(traduzErro(err), "erro");
    } finally {
      btn.disabled = false;
      btn.textContent = "Atualizar email";
    }
  }

  btn.addEventListener("click", salvar);

  return secao("Email da conta",
    el("p", { class: "config__hint" }, `Email atual: ${emailAtual}`),
    el("label", { class: "field" },
      el("span", { class: "field__label" }, "Novo email"),
      emailInput
    ),
    el("p", { class: "config__note" },
      "O email não muda na hora: enviamos um link de confirmação para o novo " +
      "endereço, e a troca só acontece depois que você clica nele."
    ),
    aviso,
    el("div", { class: "form__actions" }, btn)
  );
}

// ── Seção: Senha ─────────────────────────────────────────────────────────────

function secaoSenha() {
  const { wrap: novaSenhaWrap, input: novaSenha } = senhaInput({
    placeholder: "Mínimo 6 caracteres",
    autocomplete: "new-password",
  });
  const { wrap: confirmarWrap, input: confirmar } = senhaInput({
    placeholder: "Repita a nova senha",
    autocomplete: "new-password",
  });
  const btn = el("button", { class: "btn btn--primary" }, "Atualizar senha");

  async function salvar() {
    const senha = novaSenha.value;
    if (senha.length < 6) { toast("A senha precisa ter pelo menos 6 caracteres", "erro"); return; }
    if (senha !== confirmar.value) { toast("As senhas não coincidem", "erro"); return; }

    btn.disabled = true;
    btn.textContent = "Salvando...";
    try {
      await updatePassword(senha);
      toast("Senha atualizada!", "ok");
      novaSenha.value = "";
      confirmar.value = "";
    } catch (err) {
      toast(traduzErro(err), "erro");
    } finally {
      btn.disabled = false;
      btn.textContent = "Atualizar senha";
    }
  }

  btn.addEventListener("click", salvar);

  return secao("Senha",
    el("label", { class: "field" },
      el("span", { class: "field__label" }, "Nova senha"),
      novaSenhaWrap
    ),
    el("label", { class: "field" },
      el("span", { class: "field__label" }, "Confirmar nova senha"),
      confirmarWrap
    ),
    el("div", { class: "form__actions" }, btn)
  );
}

// ── Seção: Sair ──────────────────────────────────────────────────────────────

function secaoSair() {
  const btn = el("button", { class: "btn btn--danger" }, "Sair da conta");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Saindo...";
    try {
      await signOut();
      window.location.reload();
    } catch {
      btn.disabled = false;
      btn.textContent = "Sair da conta";
    }
  });

  const sec = secao("Sessão",
    el("p", { class: "config__hint" }, `Conectado como ${state.user?.email ?? "—"}`),
    el("p", { class: "config__note" }, "Ao sair, você precisará entrar novamente com seu email e senha."),
    btn
  );
  sec.classList.add("config-secao--full");
  return sec;
}

// ── Utilitários ──────────────────────────────────────────────────────────────

// ── Seção: Plano ──────────────────────────────────────────────────────────────

function secaoPlano() {
  const plano = planoDe(state.company);
  const nome = nomePlano(plano);
  const badgeClass = plano === "trial" ? "badge badge--muted" : "badge badge--info";
  const modulos = {
    trial: "Todos os módulos liberados pra você experimentar.",
    pro: "Financeiro, Vendas, Estoque e Clientes.",
    empresarial: "Tudo do Pro + Funcionários e múltiplas empresas.",
  };
  const sec = secao("Seu plano",
    el("div", { class: "plano__head" },
      el("span", { class: "plano__nome" }, nome),
      el("span", { class: badgeClass }, plano === "trial" ? "Acesso total" : "Ativo")
    ),
    el("p", { class: "config__hint" }, modulos[plano] || modulos.trial),
    el("div", { class: "form__actions", style: "justify-content:flex-start" },
      el("button", { class: "btn btn--primary", onclick: abrirAssinatura },
        plano === "trial" ? "Assinar um plano" : "Renovar / mudar plano"),
      el("a", { class: "btn btn--ghost", href: "mailto:monetta.erp@gmail.com?subject=Planos%20Monetta" }, "Falar com a gente")
    )
  );
  // O plano é o cabeçalho da tela: ocupa a largura toda, acima das duas colunas.
  sec.classList.add("config-secao--full");
  return sec;
}

// Modal de assinatura: coleta os dados e abre o link de pagamento do Asaas.
function abrirAssinatura() {
  const planoSel = el("select", { class: "input" },
    el("option", { value: "pro" }, "Pro — R$ 49/mês"),
    el("option", { value: "empresarial" }, "Empresarial — R$ 99/mês")
  );
  planoSel.value = planoDe(state.company) === "empresarial" ? "empresarial" : "pro";
  const nome = el("input", { class: "input", value: state.company?.name || "", placeholder: "Nome ou razão social" });
  const email = el("input", { class: "input", type: "email", value: state.user?.email || "", placeholder: "Email de cobrança" });
  const doc = el("input", { class: "input", placeholder: "CPF ou CNPJ" });
  const btn = el("button", { class: "btn btn--primary" }, "Ir para o pagamento");

  async function pagar() {
    if (!doc.value.trim()) { toast("Informe o CPF ou CNPJ", "erro"); return; }
    btn.disabled = true; btn.textContent = "Gerando...";
    try {
      const r = await criarAssinatura({
        companyId: state.company.id,
        plan: planoSel.value,
        name: nome.value.trim(),
        email: email.value.trim(),
        cpfCnpj: doc.value.trim(),
      });
      closeModal();
      if (r?.invoiceUrl) { window.open(r.invoiceUrl, "_blank", "noopener"); toast("Abrindo o pagamento…", "ok"); }
      else toast("Assinatura criada. Verifique o pagamento no seu email.", "info");
    } catch (err) {
      console.error(err);
      toast(err.message || "Não foi possível gerar o pagamento", "erro");
      btn.disabled = false; btn.textContent = "Ir para o pagamento";
    }
  }
  btn.addEventListener("click", pagar);

  openModal("Assinar a Monetta",
    el("div", { class: "form" },
      el("p", { class: "config__note", style: "margin-top:0" },
        "Você escolhe PIX, boleto ou cartão na tela de pagamento. A cobrança é mensal e você pode cancelar quando quiser."),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Plano"), planoSel),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Nome / razão social"), nome),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "Email de cobrança"), email),
      el("label", { class: "field" }, el("span", { class: "field__label" }, "CPF / CNPJ"), doc),
      el("div", { class: "form__actions" },
        el("button", { class: "btn btn--ghost", onclick: closeModal }, "Cancelar"), btn)
    )
  );
}

function secao(titulo, ...filhos) {
  return el("section", { class: "card config-secao" },
    el("h2", { class: "card__title" }, titulo),
    ...filhos
  );
}

function traduzErro(err) {
  const msg = (err?.message || "").toLowerCase();
  if (msg.includes("email") && msg.includes("taken")) return "Este email já está em uso";
  if (msg.includes("password") && msg.includes("6")) return "A senha precisa ter pelo menos 6 caracteres";
  if (msg.includes("same password")) return "A nova senha não pode ser igual à atual";
  return "Algo deu errado. Tente de novo.";
}
