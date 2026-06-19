# Setup do Supabase — checklist

Passos pra deixar tudo funcionando (painel de admin, assinatura, confirmação
de email e "esqueci minha senha"). Faça na ordem. Marque conforme avança.

> Onde rodar SQL: Supabase → **SQL Editor → New query** → cole → **Run**.
> Os arquivos `.sql` ficam na pasta `supabase/` (no seu PC).

---

## 1. Banco base — `supabase/schema.sql`  ✅ obrigatório
Cria as tabelas e a segurança (RLS) do app.

- [ ] Rodar o conteúdo inteiro de `supabase/schema.sql`.

## 2. Painel de admin + assinatura + pagamentos — `supabase/admin.sql`  ✅ recomendado
Cria o painel (só você vê), o controle de bloqueio/vencimento, a tabela de
pagamentos, **e marca a sua conta como admin**.

- [ ] **Sua conta já precisa existir** (crie/entre no app uma vez antes).
- [ ] Conferir o email no topo do arquivo (`xink.kr@gmail.com`) — troque se for outro.
- [ ] Rodar o conteúdo inteiro de `supabase/admin.sql`.
- [ ] Recarregar o app → o item **"Admin"** aparece no menu (lateral no desktop,
      barra de baixo no celular).

Conferir se você ficou admin:
```sql
select u.email from public.app_admins a
join auth.users u on u.id = a.user_id;
```
Se vier **vazio** (rodou antes de criar a conta), rode:
```sql
insert into public.app_admins (user_id)
select id from auth.users where email = 'xink.kr@gmail.com'
on conflict do nothing;
```

## 3. Lançamentos recorrentes — `supabase/recorrencias.sql`  ✅ recomendado
Permite cadastrar lançamentos que se repetem (aluguel, salário, assinatura) e
que viram lançamentos sozinhos quando o cliente entra no app.

- [ ] Rodar o conteúdo inteiro de `supabase/recorrencias.sql`.

No app: **Lançamentos → 🔁 Recorrentes**.

## 4. Contas a pagar / a receber — `supabase/contas.sql`  ✅ recomendado
Compromissos futuros com vencimento e **saldo projetado** (saldo atual +
a receber − a pagar). Ao marcar como pago, vira lançamento no caixa.

- [ ] Rodar o conteúdo inteiro de `supabase/contas.sql`.

No app: aba **Contas**.

## 5. Comprovantes (anexos) — `supabase/comprovantes.sql`  ✅ recomendado
Permite anexar foto/PDF do comprovante a cada lançamento (Supabase Storage).

- [ ] Rodar o conteúdo inteiro de `supabase/comprovantes.sql`.

No app: em **Lançamentos**, cada linha tem 📎 (Ver ou Anexar); o formulário de
novo lançamento também aceita um comprovante.

## 6. Equipe (convidar usuários) — `supabase/equipe.sql`  ✅ recomendado
Vários usuários na mesma empresa (sócio, contador). O dono convida por email;
quem foi convidado aceita ao entrar (precisa de conta com o mesmo email).

- [ ] Rodar o conteúdo inteiro de `supabase/equipe.sql`.

No app: **Configurações → Equipe**. Quem já está logado vê o convite num
**aviso no topo** (não só ao entrar).

> Email do convite (opcional): pra mandar email automático ao convidar, faça o
> deploy da função e configure o Resend (igual ao passo 9):
> `supabase functions deploy enviar-convite`. Sem isso, o convite é criado e
> aparece pra pessoa no app — você só avisa a URL na mão.

## 7. Confirmação de email no cadastro  ⚙️ opcional
Faz o cadastro **esperar a confirmação** por email antes de liberar o app.

- [ ] **Authentication → Providers → Email → "Confirm email" = ON**.

Com isso desligado, o cadastro entra direto (sem pedir confirmação).

## 8. "Esqueci minha senha" / redirecionamentos  ✅ pra reset funcionar
O link de redefinição precisa voltar pro seu app.

- [ ] **Authentication → URL Configuration**:
  - **Site URL**: a URL do app no Vercel (ex.: `https://seu-app.vercel.app`).
  - **Redirect URLs**: a mesma URL (e, pra testar local, `http://localhost:5500`
    ou a porta que você usar).

Sem isso, o email de redefinição não consegue abrir a tela de nova senha.

## 9. Email automático de vencimento  ⚙️ opcional (mais avançado)
Avisa o cliente por email alguns dias antes de vencer. Precisa de um serviço de
email e de uma Edge Function agendada.

- [ ] Criar conta no **Resend** (resend.com), verificar um domínio e pegar a API key.
- [ ] Definir os segredos:
  ```bash
  supabase secrets set RESEND_API_KEY=re_xxx
  supabase secrets set EMAIL_FROM="Fluxo de Caixa <avisos@seu-dominio.com>"
  ```
- [ ] Deploy da função:
  ```bash
  supabase functions deploy avisos-vencimento
  ```
- [ ] Agendar 1x/dia (pg_cron + pg_net) — o SQL de exemplo está no fim de
      `supabase/functions/avisos-vencimento/index.ts`.

Enquanto isso não estiver configurado, o cliente ainda vê o **banner de aviso**
dentro do app (isso já funciona sem nada extra).

---

## Chaves do app — `js/config.js`
Não esquecer de preencher (uma vez):
```js
export const SUPABASE_URL = "https://seu-projeto.supabase.co";
export const SUPABASE_ANON_KEY = "sua-chave-anon";
```
A chave `anon` é pública de propósito — quem protege os dados é o RLS, não o
segredo da chave. **Nunca** use a `service_role` no front.

---

## Trocar / corrigir o admin
Se precisar mudar quem é admin, tem um bloco pronto (comentado) no fim do
`supabase/admin.sql` — descomente a linha que precisar e rode.
