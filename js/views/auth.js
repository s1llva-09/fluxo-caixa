// ============================================================================
//  views/auth.js — Telas de entrada: login, cadastro e criar empresa
// ============================================================================

import { el, $, toast } from "../ui.js";
import { signIn, signUp } from "../auth.js";
import { criarEmpresa } from "../api.js";

// ---- Tela de login / cadastro ----------------------------------------------
// Recebe onSuccess: função chamada quando o usuário entra com sucesso.
export function renderAuth(root, onSuccess) {
  let modo = "login"; // "login" ou "cadastro"

  function tela() {
    const titulo = modo === "login" ? "Entrar" : "Criar conta";
    const trocar = modo === "login" ? "Criar conta" : "Já tenho conta";

    const email = el("input", {
      type: "email",
      class: "input",
      placeholder: "seu@email.com",
      autocomplete: "email",
      autofocus: "",
    });
    const senha = el("input", {
      type: "password",
      class: "input",
      placeholder: modo === "login" ? "Sua senha" : "Mínimo 6 caracteres",
      autocomplete: modo === "login" ? "current-password" : "new-password",
    });
    const btnSubmit = el("button", { class: "btn btn--primary btn--block" }, titulo);

    function setCarregando(carregando) {
      btnSubmit.disabled = carregando;
      btnSubmit.textContent = carregando ? "Aguarde..." : titulo;
    }

    async function enviar() {
      const emailVal = email.value.trim();
      const senhaVal = senha.value;

      if (!emailVal || !senhaVal) {
        toast("Preencha email e senha", "erro");
        return;
      }
      if (modo === "cadastro" && senhaVal.length < 6) {
        toast("A senha precisa ter pelo menos 6 caracteres", "erro");
        return;
      }

      setCarregando(true);
      try {
        if (modo === "login") {
          await signIn(emailVal, senhaVal);
          onSuccess();
        } else {
          await signUp(emailVal, senhaVal);
          // Tenta entrar direto. Se o projeto exigir confirmação de email,
          // o Supabase rejeita aqui e orientamos o usuário.
          try {
            await signIn(emailVal, senhaVal);
            onSuccess();
          } catch (errLogin) {
            const m = (errLogin?.message || "").toLowerCase();
            if (m.includes("email not confirmed") || m.includes("email_not_confirmed")) {
              toast("Conta criada! Verifique seu email para confirmar o cadastro.", "info");
              modo = "login";
              root.innerHTML = "";
              root.append(tela());
            } else {
              throw errLogin;
            }
          }
        }
      } catch (err) {
        toast(traduzErro(err), "erro");
        setCarregando(false);
      }
    }

    btnSubmit.type = "submit";

    const form = el("form", {
      class: "auth__form",
      onsubmit: (e) => { e.preventDefault(); enviar(); },
      autocomplete: "on",
    },
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Email"), email),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Senha"), senha),
      btnSubmit,
      el("button", {
        type: "button",
        class: "btn btn--ghost btn--block",
        onclick: () => {
          modo = modo === "login" ? "cadastro" : "login";
          root.innerHTML = "";
          root.append(tela());
        },
      }, trocar)
    );

    return el(
      "div",
      { class: "auth" },
      el(
        "div",
        { class: "auth__card card" },
        el("div", { class: "brand brand--lg" },
          el("span", { class: "brand__mark", "aria-hidden": "true",
            html: `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8.5" stroke="white" stroke-width="1.8" fill="rgba(255,255,255,0.12)"/><polygon points="10,5 6.5,9.5 8.5,9.5 8.5,15 11.5,15 11.5,9.5 13.5,9.5" fill="white"/></svg>` }),
          el("span", { class: "brand__name" }, "Fluxo de Caixa")
        ),
        el("p", { class: "auth__sub" },
          "Saiba o que entra e o que sai do seu caixa."),
        form
      )
    );
  }

  root.innerHTML = "";
  root.append(tela());
}

// ---- Tela de criar empresa (primeiro acesso) -------------------------------
export function renderOnboarding(root, onDone) {
  const nome = el("input", {
    type: "text",
    class: "input",
    placeholder: "Ex.: Auto Center São José",
    autofocus: "",
  });
  const btnCriar = el("button", { class: "btn btn--primary btn--block" }, "Criar e continuar");

  async function criar() {
    if (!nome.value.trim()) {
      toast("Digite o nome da empresa", "erro");
      return;
    }
    btnCriar.disabled = true;
    btnCriar.textContent = "Criando...";
    try {
      await criarEmpresa(nome.value.trim());
      toast("Empresa criada!", "ok");
      onDone();
    } catch (err) {
      toast("Não foi possível criar a empresa", "erro");
      console.error(err);
      btnCriar.disabled = false;
      btnCriar.textContent = "Criar e continuar";
    }
  }

  btnCriar.addEventListener("click", criar);
  nome.addEventListener("keydown", (e) => { if (e.key === "Enter") criar(); });

  root.innerHTML = "";
  root.append(
    el(
      "div",
      { class: "auth" },
      el(
        "div",
        { class: "auth__card card" },
        el("h1", { class: "auth__title" }, "Vamos começar"),
        el("p", { class: "auth__sub" }, "Como se chama o seu negócio?"),
        el("label", { class: "field" },
          el("span", { class: "field__label" }, "Nome da empresa"), nome),
        btnCriar
      )
    )
  );
}

// Deixa as mensagens de erro do Supabase mais amigáveis em português.
function traduzErro(err) {
  const msg = (err?.message || "").toLowerCase();
  if (msg.includes("invalid login credentials") || msg.includes("invalid login"))
    return "Email ou senha incorretos";
  if (msg.includes("already registered") || msg.includes("user already registered"))
    return "Este email já tem conta. Faça login.";
  if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed"))
    return "Confirme seu email antes de entrar";
  if (msg.includes("password") && msg.includes("6"))
    return "A senha precisa ter pelo menos 6 caracteres";
  if (msg.includes("rate limit") || msg.includes("too many"))
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (msg.includes("network") || msg.includes("fetch"))
    return "Sem conexão. Verifique sua internet e tente de novo.";
  return "Algo deu errado. Tente de novo.";
}
