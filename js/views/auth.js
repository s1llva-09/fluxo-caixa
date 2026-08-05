// ============================================================================
//  views/auth.js — Telas de entrada: login, cadastro e criar empresa
// ============================================================================

import { el, $, toast, senhaInput } from "../ui.js";
import { signIn, signUp, resetPassword, updatePassword } from "../auth.js";
import { criarEmpresa, criarCategoria } from "../api.js";

// Categorias que já vêm prontas quando a empresa é criada (pra não nascer vazia).
const CATEGORIAS_PADRAO = [
  ["Vendas", "entrada"],
  ["Serviços", "entrada"],
  ["Fornecedores", "saida"],
  ["Aluguel", "saida"],
  ["Salários", "saida"],
  ["Contas (água/luz/internet)", "saida"],
];

// SVG do "$" da marca, reaproveitado em vários lugares.
const MARK_SVG = `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="mg" x1="0.12" y1="0" x2="0.82" y2="1"><stop offset="0" stop-color="#C68BFF"/><stop offset="0.5" stop-color="#9A3FF0"/><stop offset="1" stop-color="#7A28DD"/></linearGradient></defs><path d="M4 15 L4 5.6 L10 13 L16 4.8 L16 15" fill="none" stroke="url(#mg)" stroke-width="2.8" stroke-linejoin="miter" stroke-linecap="butt"/></svg>`;
const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const BACK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;

function marca(extra = "") {
  return el("div", { class: `brand brand--lg ${extra}` },
    el("span", { class: "brand__mark", "aria-hidden": "true", html: MARK_SVG }),
    el("span", { class: "brand__name" }, "Monetta")
  );
}

function tick(texto) {
  return el("li", { class: "auth__tick" },
    el("span", { class: "auth__tick-ic", "aria-hidden": "true", html: CHECK_SVG }),
    texto
  );
}

// Mini dashboard decorativo que "flutua" no painel — mostra o produto de verdade.
function asideMock() {
  const arrowUp = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
  const barras = [40, 56, 48, 72, 60, 94];
  return el("div", { class: "auth__mock", "aria-hidden": "true" },
    el("div", { class: "auth__mock-bar" },
      el("i", {}), el("i", {}), el("i", {}),
      el("span", { class: "auth__mock-url" }, "app · Monetta")
    ),
    el("div", { class: "auth__mock-body" },
      el("div", { class: "auth__mock-label" }, "Saldo total acumulado"),
      el("div", { class: "auth__mock-saldo" }, "R$ 12.480,00"),
      el("div", { class: "auth__mock-delta" }, "▲ 18% em relação ao mês passado"),
      el("div", { class: "auth__mock-bars" },
        ...barras.map((h, i) =>
          el("i", { style: `height:${h}%;animation-delay:${0.05 + i * 0.07}s` }))
      ),
      el("div", { class: "auth__mock-tx" },
        el("span", { class: "auth__mock-ic", html: arrowUp }),
        el("span", { class: "auth__mock-tx-main" },
          el("b", {}, "Venda — Cliente Souza"),
          el("span", {}, "Hoje · Vendas")
        ),
        el("span", { class: "auth__mock-v" }, "+ R$ 1.250")
      )
    )
  );
}

// Layout compartilhado: painel de marca à esquerda + card do formulário à direita.
// No mobile o painel some e sobra só o card, centralizado.
function authShell(...cardChildren) {
  return el("div", { class: "auth" },
    el("aside", { class: "auth__aside", "aria-hidden": "true" },
      el("a", { class: "brand auth__aside-brand", href: "/" },
        el("span", { class: "brand__mark", html: MARK_SVG }),
        el("span", { class: "brand__name" }, "Monetta")
      ),
      el("div", { class: "auth__aside-mid" },
        el("h2", { class: "auth__aside-title" },
          "Controle ", el("span", { class: "hl" }, "o caixa do seu negócio"), " num lugar só."),
        el("ul", { class: "auth__ticks" },
          tick("Entradas e saídas em segundos"),
          tick("Contas a pagar e saldo projetado"),
          tick("Relatórios, equipe e no celular")
        )
      ),
      asideMock()
    ),
    el("div", { class: "auth__card card" },
      el("a", { class: "auth__back", href: "/", "aria-label": "Voltar para a página inicial" },
        el("span", { html: BACK_SVG }), "Voltar ao site"),
      ...cardChildren
    )
  );
}

// ---- Tela de login / cadastro ----------------------------------------------
// Recebe onSuccess: função chamada quando o usuário entra com sucesso.
export function renderAuth(root, onSuccess) {
  // Abre direto no cadastro quando vem dos CTAs da landing (/app?signup=1).
  let modo = "login"; // "login" ou "cadastro"
  try {
    const sp = new URLSearchParams(location.search);
    if (sp.get("signup") === "1" || sp.get("cadastro") === "1" || location.hash === "#criar") {
      modo = "cadastro";
    }
  } catch (e) { /* ignore */ }

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
    // No cadastro pedimos a confirmação da senha (evita erro de digitação).
    let senha2Wrap = null, senha2 = null;
    if (modo === "cadastro") {
      ({ wrap: senha2Wrap, input: senha2 } = senhaInput({
        placeholder: "Repita a senha",
        autocomplete: "new-password",
      }));
    }
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
      // Email com formato válido (além do type=email do navegador).
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        toast("Digite um email válido", "erro");
        return;
      }
      if (modo === "cadastro") {
        if (senhaVal.length < 6) {
          toast("A senha precisa ter pelo menos 6 caracteres", "erro");
          return;
        }
        if (senhaVal !== senha2.value) {
          toast("As senhas não coincidem", "erro");
          senha2.focus();
          return;
        }
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
      modo === "cadastro"
        ? el("label", { class: "field" },
            el("span", { class: "field__label" }, "Confirmar senha"), senha2Wrap)
        : null,
      modo === "login"
        ? el("button", {
            type: "button",
            class: "auth__link",
            onclick: () => mostrarRecuperar(email.value.trim()),
          }, "Esqueci minha senha")
        : null,
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

    return authShell(
      marca(),
      el("p", { class: "auth__sub" },
        modo === "login"
          ? "Bem-vindo de volta. Acesse sua conta."
          : "Crie sua conta e comece a controlar seu caixa."),
      el("h2", { class: "auth__title", style: "margin-bottom:22px" }, titulo),
      form
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
      authShell(
        el("div", { class: "auth__lock auth__lock--ok", "aria-hidden": "true",
          html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 6 12 13 2 6"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>` }),
        el("h1", { class: "auth__title" }, "Confirme seu email"),
        el("p", { class: "auth__sub" },
          "Enviamos um link de confirmação para ", el("strong", {}, email),
          ". Abra o email e clique no link para ativar sua conta — depois é só entrar."),
        el("p", { class: "auth__contato" },
          "Não recebeu? Verifique a caixa de spam."),
        voltar
      )
    );
  }

  // Tela de "esqueci minha senha": pede o email e dispara o link de redefinição.
  function mostrarRecuperar(prefillEmail = "") {
    const email = el("input", {
      type: "email", class: "input", placeholder: "seu@email.com",
      autocomplete: "email", value: prefillEmail, autofocus: "",
    });
    const btn = el("button", { class: "btn btn--primary btn--block" }, "Enviar link");

    function voltarLogin() {
      modo = "login";
      root.innerHTML = "";
      root.append(tela());
    }

    async function enviar() {
      const v = email.value.trim();
      if (!v) { toast("Digite seu email", "erro"); return; }
      btn.disabled = true; btn.textContent = "Enviando...";
      try {
        await resetPassword(v);
        // Mensagem genérica de propósito (não revela se o email tem conta).
        root.innerHTML = "";
        root.append(
          authShell(
            el("div", { class: "auth__lock auth__lock--ok", "aria-hidden": "true",
              html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 6 12 13 2 6"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>` }),
            el("h1", { class: "auth__title" }, "Link enviado"),
            el("p", { class: "auth__sub" },
              "Se existe uma conta com ", el("strong", {}, v),
              ", enviamos um link para você criar uma nova senha. Abra o email e clique no link."),
            el("p", { class: "auth__contato" }, "Não recebeu? Verifique a caixa de spam."),
            el("button", { type: "button", class: "btn btn--ghost btn--block", onclick: voltarLogin }, "Voltar ao login")
          )
        );
      } catch (err) {
        toast(traduzErro(err), "erro");
        btn.disabled = false; btn.textContent = "Enviar link";
      }
    }

    btn.addEventListener("click", enviar);
    email.addEventListener("keydown", (e) => { if (e.key === "Enter") enviar(); });

    root.innerHTML = "";
    root.append(
      authShell(
        marca(),
        el("h1", { class: "auth__title" }, "Recuperar senha"),
        el("p", { class: "auth__sub" },
          "Digite seu email e enviamos um link para você criar uma nova senha."),
        el("label", { class: "field" },
          el("span", { class: "field__label" }, "Email"), email),
        btn,
        el("button", { type: "button", class: "btn btn--ghost btn--block", onclick: voltarLogin }, "Voltar ao login")
      )
    );
  }

  root.innerHTML = "";
  root.append(tela());
}

// ---- Tela de convites recebidos (usuário sem empresa, mas convidado) -------
// acoes: { onAceitar(id), onCriarPropria() }
export function renderConvites(root, convites, acoes) {
  const lista = el("div", { class: "auth__convites" });
  for (const c of convites) {
    const btn = el("button", { class: "btn btn--primary btn--block" }, "Entrar nesta empresa");
    btn.addEventListener("click", async () => {
      btn.disabled = true; btn.textContent = "Entrando...";
      try {
        await acoes.onAceitar(c);
      } catch (err) {
        toast("Não foi possível aceitar o convite", "erro");
        btn.disabled = false; btn.textContent = "Entrar nesta empresa";
      }
    });
    lista.append(
      el("div", { class: "auth__convite" },
        el("div", { class: "auth__convite-nome" }, c.company_name || "Empresa"),
        el("div", { class: "auth__convite-papel" }, c.role === "owner" ? "Convidado como dono" : "Convidado como membro"),
        btn
      )
    );
  }

  root.innerHTML = "";
  root.append(
    authShell(
      marca(),
      el("h1", { class: "auth__title" }, "Você foi convidado"),
      el("p", { class: "auth__sub" }, "Aceite para entrar na empresa — ou crie a sua própria."),
      lista,
      el("button", {
        type: "button", class: "btn btn--ghost btn--block", style: "margin-top:6px",
        onclick: acoes.onCriarPropria,
      }, "Criar minha própria empresa")
    )
  );
}

// ---- Tela de criar nova senha (quando volta pelo link de redefinição) ------
// onDone: função chamada após salvar a nova senha com sucesso.
export function renderRedefinir(root, onDone) {
  const { wrap: w1, input: s1 } = senhaInput({ placeholder: "Mínimo 6 caracteres", autocomplete: "new-password" });
  const { wrap: w2, input: s2 } = senhaInput({ placeholder: "Repita a nova senha", autocomplete: "new-password" });
  const btn = el("button", { class: "btn btn--primary btn--block" }, "Salvar nova senha");

  async function salvar() {
    if (s1.value.length < 6) { toast("A senha precisa ter pelo menos 6 caracteres", "erro"); return; }
    if (s1.value !== s2.value) { toast("As senhas não coincidem", "erro"); return; }
    btn.disabled = true; btn.textContent = "Salvando...";
    try {
      await updatePassword(s1.value);
      toast("Senha redefinida!", "ok");
      onDone();
    } catch (err) {
      toast(traduzErro(err), "erro");
      btn.disabled = false; btn.textContent = "Salvar nova senha";
    }
  }
  btn.addEventListener("click", salvar);

  root.innerHTML = "";
  root.append(
    authShell(
      marca(),
      el("h1", { class: "auth__title" }, "Criar nova senha"),
      el("p", { class: "auth__sub" }, "Escolha uma nova senha para sua conta."),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Nova senha"), w1),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Confirmar nova senha"), w2),
      btn
    )
  );
}

// ---- Tela de criar empresa (primeiro acesso) -------------------------------
export function renderOnboarding(root, onDone) {
  const nome = el("input", {
    type: "text",
    class: "input",
    placeholder: "Ex.: Auto Center São José",
    autofocus: "",
  });
  // Ramos de atividade (sugeridos pela Carol). value limpo p/ lógica futura
  // (multi-setor/modular); rótulo com emoji só pra exibir.
  const RAMOS = [
    ["Comércio", "🛒 Comércio"],
    ["Clínica / Consultório", "🏥 Clínica / Consultório"],
    ["Restaurante / Lanchonete", "🍽️ Restaurante / Lanchonete"],
    ["Hotel / Hospedagem", "🏨 Hotel / Hospedagem"],
    ["Imobiliária", "🏠 Imobiliária"],
    ["Construção Civil", "🏗️ Construção Civil"],
    ["Transporte / Logística", "🚚 Transporte / Logística"],
    ["Prestação de Serviços", "💼 Prestação de Serviços"],
    ["Indústria", "🏭 Indústria"],
    ["Educação", "📚 Educação"],
    ["Tecnologia", "💻 Tecnologia"],
    ["Agronegócio", "🌾 Agronegócio"],
    ["Distribuidora", "📦 Distribuidora"],
    ["Outro", "✨ Outro"],
  ];
  const ramo = el("select", { class: "input" },
    el("option", { value: "" }, "Selecione o ramo…"),
    ...RAMOS.map(([val, label]) => el("option", { value: val }, label))
  );

  const btnCriar = el("button", { class: "btn btn--primary btn--block" }, "Criar e continuar");

  async function criar() {
    if (!nome.value.trim()) {
      toast("Digite o nome da empresa", "erro");
      return;
    }
    btnCriar.disabled = true;
    btnCriar.textContent = "Criando...";
    try {
      const empresa = await criarEmpresa(nome.value.trim(), ramo.value || null);
      // Já cria algumas categorias úteis (não-fatal se alguma falhar).
      try {
        await Promise.all(CATEGORIAS_PADRAO.map(([n, k]) => criarCategoria(empresa.id, n, k)));
      } catch (e) { console.error(e); }
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
    authShell(
      marca(),
      el("h1", { class: "auth__title" }, "Bem-vindo à Monetta"),
      el("p", { class: "auth__sub" }, "Conte um pouco sobre a sua empresa pra começar."),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Nome da empresa"), nome),
      el("label", { class: "field" },
        el("span", { class: "field__label" }, "Ramo de atividade"), ramo),
      btnCriar
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
    authShell(
      el("div", { class: "auth__lock", "aria-hidden": "true",
        html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>` }),
      el("h1", { class: "auth__title" }, "Acesso suspenso"),
      el("p", { class: "auth__sub" },
        "Sua assinatura está vencida ou o acesso foi suspenso. " +
        "Regularize o pagamento para liberar novamente o sistema."),
      el("p", { class: "auth__contato" }, "Fale com a gente pra combinar o pagamento (PIX) e liberar o acesso na hora."),
      el("a", { class: "btn btn--primary btn--block",
        href: "mailto:monetta.erp@gmail.com?subject=Regularizar%20acesso%20Monetta",
        style: "margin-bottom:8px" }, "Falar com o suporte"),
      btnSair
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
