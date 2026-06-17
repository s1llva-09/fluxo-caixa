// ============================================================================
//  views/configuracoes.js — Configurações da empresa e da conta
// ============================================================================

import { el, $, toast, senhaInput } from "../ui.js";
import { state } from "../state.js";
import { atualizarEmpresa } from "../api.js";
import { updateEmail, updatePassword, signOut } from "../auth.js";
import { getTheme, setTheme } from "../theme.js";

export function renderConfiguracoes(root) {
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head" },
      el("h1", { class: "page-title" }, "Configurações"),
      el("p", { class: "page-sub" }, "Empresa, conta e preferências")
    ),
    secaoAparencia(),
    secaoEmpresa(),
    secaoEmail(),
    secaoSenha(),
    secaoSair()
  );
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
    });
    grupo.append(btn);
  }

  marcar(getTheme());

  return secao("Aparência",
    el("p", { class: "config__hint" }, "Escolha como o aplicativo aparece para você. A preferência fica salva neste dispositivo."),
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

  async function salvar() {
    const email = emailInput.value.trim();
    if (!email) { toast("Digite o novo email", "erro"); return; }
    if (email === emailAtual) { toast("É o mesmo email atual", "info"); return; }

    btn.disabled = true;
    btn.textContent = "Enviando...";
    try {
      await updateEmail(email);
      toast("Confirme o novo email pela caixa de entrada", "info");
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
      "Você receberá um link de confirmação no novo endereço."
    ),
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

  return secao("Sessão",
    el("p", { class: "config__hint" }, `Conectado como ${state.user?.email ?? "—"}`),
    el("p", { class: "config__note" }, "Ao sair, você precisará entrar novamente com seu email e senha."),
    btn
  );
}

// ── Utilitários ──────────────────────────────────────────────────────────────

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
