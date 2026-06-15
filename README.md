# Fluxo de Caixa

Sistema simples de controle de entradas e saídas de caixa para pequenos negócios.
Feito com **HTML + CSS + JavaScript puro** (sem framework, sem build) e **Supabase**
(banco de dados, login e segurança).

---

## O que ele faz

- Login e cadastro de usuário
- Cada usuário tem sua própria empresa — um cliente **não enxerga** os dados do outro (multi-tenant)
- Lançar entradas e saídas com data, categoria e descrição
- Dashboard com saldo atual, totais do mês e gráfico dos últimos 6 meses
- Filtrar lançamentos por período, tipo e categoria
- Estornar lançamentos (sem apagar o histórico — o lançamento é imutável)
- Relatório por categoria e exportação em CSV (abre no Excel/Google Sheets)

---

## Como rodar (passo a passo)

### 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto (o plano grátis serve).
2. Vá em **SQL Editor → New query**.
3. Abra o arquivo `supabase/schema.sql`, copie todo o conteúdo, cole e clique em **Run**.
   Isso cria as tabelas e as regras de segurança.

### 2. Configurar as chaves

1. No Supabase, vá em **Project Settings → Data API** (ou "API").
2. Copie a **Project URL** e a chave **anon / public**.
3. Abra `js/config.js` e cole nos dois campos:

   ```js
   export const SUPABASE_URL = "https://seu-projeto.supabase.co";
   export const SUPABASE_ANON_KEY = "sua-chave-anon";
   ```

   > A chave `anon` é pública de propósito — quem protege os dados é o RLS no banco,
   > não o segredo da chave. **Nunca** use a chave `service_role` no front.

### 3. Abrir o sistema

Como usa módulos JavaScript (`import`), **não dá pra abrir o HTML com duplo clique** —
precisa de um servidor (mesmo que local). Escolha uma opção:

```bash
# Opção 1 — com Node instalado:
npx serve

# Opção 2 — com Python instalado:
python3 -m http.server 5500
```

Depois abra o endereço que aparecer (ex.: `http://localhost:3000` ou `:5500`).

### 4. Usar

1. Crie uma conta na tela inicial.
2. Dê um nome pra empresa.
3. Comece a lançar entradas e saídas. 🎉

> **Dica:** se quiser, desligue a confirmação de email no Supabase em
> **Authentication → Providers → Email → "Confirm email" (off)** pra testar mais rápido.

---

## Onde fica cada coisa

```
fluxo-caixa/
├── index.html              # página única; importa o CSS e o JS
├── README.md
│
├── supabase/
│   └── schema.sql          # tabelas + segurança (rode isto no Supabase)
│
├── css/
│   ├── index.css           # importa todos os css abaixo (único linkado no HTML)
│   ├── base.css            # variáveis de cor, fontes e reset
│   ├── layout.css          # estrutura (cabeçalho, menu, conteúdo) e responsivo
│   ├── components.css      # botões, cards, inputs, tabelas, modal, toast...
│   └── pages.css           # telas específicas (login)
│
└── js/
    ├── index.js            # ponto de entrada; controla login e navegação
    ├── config.js           # URL e chave do Supabase  ← edite aqui
    ├── supabaseClient.js   # cria o cliente do Supabase
    ├── auth.js             # login, cadastro, logout
    ├── api.js              # todas as conversas com o banco
    ├── money.js            # formatar/converter dinheiro (centavos ↔ R$)
    ├── ui.js               # ajudantes de tela (toast, modal, criar elementos)
    ├── state.js            # estado compartilhado (empresa, categorias)
    └── views/
        ├── auth.js         # tela de login / criar empresa
        ├── dashboard.js    # saldo, totais e gráfico
        ├── lancamentos.js  # lista, novo lançamento e estorno
        ├── categorias.js   # gerenciar categorias
        └── relatorios.js   # relatório por categoria + exportar CSV
```

---

## Decisões importantes (e por quê)

- **Dinheiro em centavos:** valores são guardados como número inteiro de centavos.
  Evita os erros de arredondamento do ponto flutuante (`0.1 + 0.2 ≠ 0.3`).
- **Lançamento imutável:** não existe editar nem apagar lançamento. Pra corrigir,
  faz-se um **estorno** (um lançamento contrário). O histórico fica sempre confiável.
- **Multi-tenant via RLS:** a segurança mora no banco. Mesmo que alguém pegue a chave
  pública, só consegue ver os dados da própria empresa. É a base pra virar um SaaS.

---

## Próximos passos (ideias)

- Lançamentos recorrentes (aluguel, salários)
- Anexar comprovante (Supabase Storage)
- Convidar mais usuários pra mesma empresa (a tabela `company_members` já prevê isso)
- Exportar PDF do relatório
- Integração com Pix / boleto
