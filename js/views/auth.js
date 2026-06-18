// ============================================================================
//  views/auth.js — Telas de entrada: login, cadastro e criar empresa
// ============================================================================

import { el, $, toast, senhaInput } from "../ui.js";
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
    const { wrap: senhaWrap, input: senha } = senhaInput({
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
          const data = await signUp(emailVal, senhaVal);

          // Email já cadastrado: o Supabase devolve um "usuário" sem identidades
          // (pra não vazar quem tem conta). Tratamos como "já existe".
          if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            toast("Este email já tem conta. Faça login.", "erro");
            modo = "login";
            root.innerHTML = "";
            root.append(tela());
            return;
          }

          if (data?.session) {
            // Confirmação de email está DESLIGADA no Supabase: já entrou.
            onSuccess();
          } else {
            // Confirmação LIGADA: não entra ainda. Mostra a tela de
            // "verifique seu email" e só libera depois que ele confirmar.
            mostrarConfirmacao(emailVal);
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
        el("span", { class: "field__label" }, "Senha"), senhaWrap),
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
            html: `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><text x="10" y="10" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="800" fill="white" font-family="system-ui,-apple-system,sans-serif">$</text></svg>` }),
          el("span", { class: "brand__name" }, "Fluxo de Caixa")
        ),
        el("p", { class: "auth__sub" },
          modo === "login"
            ? "Bem-vindo de volta. Acesse sua conta."
            : "Crie sua conta e comece a controlar seu caixa."),
        el("h2", { class: "auth__title", style: "margin-bottom:22px" }, titulo),
        form
      )
    );
  }

  // Tela mostrada depois do cadastro, quando o email precisa ser confirmado.
  function mostrarConfirmacao(email) {
    const voltar = el("button", {
      type: "button",
      class: "btn btn--ghost btn--block",
      onclick: () => {
        modo = "login";
        root.innerHTML = "";
        root.append(tela());
      },
    }, "Voltar ao login");

    root.innerHTML = "";
    root.append(
      el("div", { class: "auth" },
        el("div", { class: "auth__card card" },
          el("div", { class: "auth__lock auth__lock--ok", "aria-hidden": "true",
            html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z" opacity="0"/><path d="M22 6 12 13 2 6"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>` }),
          el("h1", { class: "auth__title" }, "Confirme seu email"),
          el("p", { class: "auth__sub" },
            "Enviamos um link de confirmação para ", el("strong", {}, email),
            ". Abra o email e clique no link para ativar sua conta — depois é só entrar."),
          el("p", { class: "auth__contato" },
            "Não recebeu? Verifique a caixa de spam."),
          voltar
        )
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
        el("div", { class: "brand brand--lg", style: "margin-bottom:20px" },
          el("span", { class: "brand__mark", "aria-hidden": "true",
            html: `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><text x="10" y="10" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="800" fill="white" font-family="system-ui,-apple-system,sans-serif">$</text></svg>` }),
          el("span", { class: "brand__name" }, "Fluxo de Caixa")
        ),
        el("h1", { class: "auth__title" }, "Quase pronto"),
        el("p", { class: "auth__sub" }, "Qual é o nome do seu negócio?"),
        el("label", { class: "field" },
          el("span", { class: "field__label" }, "Nome da empresa"), nome),
        btnCriar
      )
    )
  );
}

// ---- Tela de acesso suspenso (mensalidade vencida / cliente bloqueado) -----
// onSair: função chamada ao clicar em "Sair".
export function renderBloqueado(root, onSair) {
  const btnSair = el("button", { class: "btn btn--ghost btn--block" }, "Sair");
  btnSair.addEventListener("click", () => {
    btnSair.disabled = true;
    btnSair.textContent = "Saindo...";
    onSair();
  });

  root.innerHTML = "";
  root.append(
    el("div", { class: "auth" },
      el("div", { class: "auth__card card" },
        el("div", { class: "auth__lock", "aria-hidden": "true",
          html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>` }),
        el("h1", { class: "auth__title" }, "Acesso suspenso"),
        el("p", { class: "auth__sub" },
          "Sua assinatura está vencida ou o acesso foi suspenso. " +
          "Regularize o pagamento para liberar novamente o sistema."),
        el("p", { class: "auth__contato" }, "Em caso de dúvida, entre em contato com o suporte."),
        btnSair
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
