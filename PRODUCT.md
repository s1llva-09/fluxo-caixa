# Product

<!-- impeccable:product-schema 1 -->

> Nota de origem: no init de 2026-08-06 o usuário delegou as três perguntas ("decida você").
> Tudo abaixo foi derivado de evidência no repositório e está marcado como
> **[código]** (verificável no repo) ou **[inferido]** (dedução a confirmar).

## Platform

web

## Users

**Primário — dono de pequeno negócio com movimento diário** (comércio de bairro,
serviço, revenda). Usa no celular, entre atendimentos, em sessões curtas: lançar o
que entrou/saiu, ver o saldo de hoje, checar o que vence. **[inferido]** — sustentado
por: PWA instalável em modo `standalone`/`portrait` com ícones 180/192/512
(`manifest.webmanifest`), bottom-nav dedicada abaixo de 860px (`css/layout.css:430+`),
e o vocabulário de tela ser operacional (lançamento, conta a pagar, comprovante), não
contábil (sem plano de contas, sem DRE, sem conciliação).

**Secundário — funcionário com papel limitado.** `company_members` com papéis, convite
por email, RPC `set_member_role` restrita ao owner e auditoria com email resolvido no
servidor (`company_members_audit_with_emails`). O módulo `funcionarios` só existe no
plano Empresarial (`js/planos.js:16`). **[código]**

**Terceiro — o operador do próprio Monetta.** Painel admin visível só para um email
(`supabase/admin.sql`), com lista de clientes, pagamentos, receita mensal/por período e
definição de plano e vencimento. O produto é operado como SaaS por uma pessoa.
**[código]**

## Product Purpose

Dar a um pequeno negócio um retrato confiável do próprio caixa sem exigir conhecimento
contábil nem instalação: entra pelo navegador, cria a empresa, começa a lançar. Sucesso
é o dono conseguir responder "quanto eu tenho, quanto entra e o que vence" em segundos,
e continuar respondendo isso meses depois com um histórico em que ele confia. **[inferido]**

## Positioning

Duas coisas que o repositório sustenta e que um concorrente não copia sem refazer a base:

1. **O caixa é um livro, não uma planilha.** Não existe editar nem apagar lançamento —
   correção é estorno (lançamento contrário). Dinheiro trafega sempre em centavos
   inteiros. O histórico é, por construção, auditável. **[código: README.md:111-119, js/money.js:1-7]**
2. **ERP que começa como fluxo de caixa e cresce por módulo.** Núcleo sempre liberado
   (dashboard, lançamentos, contas, categorias, relatórios, configurações) e módulos
   ligados por plano — vendas, estoque, clientes no Pro; funcionários no Empresarial.
   O cliente não troca de sistema quando cresce, só muda de plano. **[código: js/planos.js]**

Não afirmar superioridade sobre produto nomeado: não há comparação, benchmark ou teste
com concorrente neste repositório.

## Operating Context

- Uso predominante no celular, em pé, com uma mão, entre outras tarefas. **[inferido]**
- Sessões curtas e repetidas ao longo do dia (lançar) e uma sessão mais longa
  ocasional (relatório, fechar o mês, conferir contas). **[inferido]**
- Documentos que entram no fluxo: comprovante anexado por lançamento (Supabase Storage),
  exportação CSV de relatório e de auditoria, importação CSV de funcionários com preview
  obrigatório. **[código]**
- Rituais de cobrança: aviso de vencimento da mensalidade no topo do app dentro de N dias
  (`#sub-banner`, dispensável por sessão), regularização por PIX/manual e assinatura via
  Asaas. **[código: js/index.js:341-373]**

## Capabilities and Constraints

**Funcionalidade confirmada:** autenticação e multi-empresa por usuário; lançamentos com
data, categoria, descrição e comprovante; estorno; recorrências; contas a pagar/receber
com baixa; categorias; clientes; estoque; vendas; funcionários com anexos e log; relatório
por categoria com CSV; dashboard com saldo, totais do mês e gráfico de 6 meses; convites e
papéis; painel admin de assinatura; tema claro/escuro; seletor de moeda.

**Restrições técnicas duráveis:**
- **Sem build e sem framework.** HTML + CSS + JS puro com ES modules nativos, servido
  estático na Vercel (`vercel.json`, `cleanUrls`). Qualquer proposta que exija bundler,
  React, Tailwind ou compilação está fora sem decisão explícita do dono. **[código]**
- **Segurança mora no banco.** Multi-tenant por RLS; a chave `anon` é pública de
  propósito; `service_role` nunca chega ao front. **[código: README.md:46-47]**
- **Dinheiro em centavos inteiros**, formatado só na exibição. **[código: js/money.js]**
- **Service worker com lista de assets** (`sw.js`) — arquivo novo de CSS/JS precisa
  entrar nela. **[código]**
- Landing em `index.html` (`/`), app em `app.html` (`/app`), mesma origem.

**Idioma e moeda:** interface só em pt-BR (`lang: "pt-BR"` no manifest, toda a copy em
português). Não há infraestrutura de i18n. A moeda é configurável por dispositivo entre
7 opções (BRL, USD, EUR, GBP, ARS, PYG, CLP) com BRL como padrão — a moeda muda a
exibição, nunca o armazenamento. **[código]**

**Explicitamente indefinido:** NF-e/fiscal aparece como direção futura, não como
capacidade; exportação em PDF e integração PIX/boleto estão listadas como ideias em
`README.md:122-129`, não implementadas.

## Brand Commitments

- Nome **Monetta**; marca é o monograma "M" em traço angular sobre tile escuro
  arredondado, gradiente violeta (`#C68BFF → #9A3FF0 → #7A28DD`) sobre `#0B0E1A`;
  `theme_color` do PWA é `#7C3AED`. **[código: icon.svg, favicon.svg, manifest]**
- Tipografia comprometida: Sora nos títulos, Inter no corpo, numerais tabulares em
  valores monetários. **[código: css/base.css]**
- Voz: segunda pessoa direta, frase curta, português coloquial de negócio ("Sua
  mensalidade vence amanhã", "Não foi possível"). Sem jargão contábil na interface —
  o produto fala "entrada e saída", não "débito e crédito". **[código]**
- Logo 3D definitivo ainda pendente.

## Evidence on Hand

- **Existe:** o produto real, rodando, com dados do próprio dono; a landing com mock do
  produto construído em HTML/CSS (não screenshot); preços publicados (Pro R$49,
  Empresarial R$99); dois harnesses de teste de browser em `tests/`.
- **Não existe — não fabricar:** depoimento, logo de cliente, número de usuários,
  case, avaliação, prêmio, certificação, SLA, dado de mercado. A landing atual não
  contém nenhuma prova social, e isso é uma decisão a preservar até haver cliente real
  disposto a aparecer.

## Product Principles

1. **O histórico é sagrado.** Nada que já aconteceu pode ser reescrito na interface;
   correção é sempre um evento novo e visível.
2. **O celular é o caso principal.** Se a decisão só funciona no desktop, ela está errada.
3. **Vocabulário de dono, não de contador.** Cada palavra na tela tem que ser entendida
   por quem nunca usou sistema de gestão.
4. **Crescer por módulo, não por migração.** O plano liga capacidade; nunca obriga a
   trocar de ferramenta nem quebra o que já existe.
5. **Simples de operar por uma pessoa.** Sem build, sem dependência que exija manutenção
   constante — o custo de manter tem que caber em um dono solo.

## Accessibility & Inclusion

Nenhum padrão formal foi estabelecido pelo usuário. O código já pratica: `aria-label` em
botões de ícone, `:focus-visible` com outline visível, `@media (prefers-reduced-motion:
reduce)` global, e alvos de toque na bottom-nav. Tratar isso como piso a não regredir.
**[código]**
