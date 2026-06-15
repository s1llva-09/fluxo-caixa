// ============================================================================
//  views/configuracoes.js — Configurações da empresa e da conta
// ============================================================================

import { el, $, toast } from "../ui.js";
import { state } from "../state.js";
import { atualizarEmpresa } from "../api.js";
import { updateEmail, updatePassword } from "../auth.js";

export function renderConfiguracoes(root) {
  root.innerHTML = "";
  root.append(
    el("header", { class: "page-head" },
      el("h1", { class: "page-title" }, "Configurações"),
      el("p", { class: "page-sub" }, "Empresa e dados da conta")
    ),
    secaoEmpresa(),
    secaoEmail(),
    secaoSenha()
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
      if (badge) badge.textContent = atualizada.name;
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
  const novaSenha = el("input", {
    class: "input",
    type: "password",
    placeholder: "Mínimo 6 caracteres",
    autocomplete: "new-password",
  });
  const confirmar = el("input", {
    class: "input",
    type: "password",
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
      novaSenha
    ),
    el("label", { class: "field" },
      el("span", { class: "field__label" }, "Confirmar nova senha"),
      confirmar
    ),
    el("div", { class: "form__actions" }, btn)
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
