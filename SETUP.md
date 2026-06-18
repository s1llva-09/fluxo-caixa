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

## 3. Confirmação de email no cadastro  ⚙️ opcional
Faz o cadastro **esperar a confirmação** por email antes de liberar o app.

- [ ] **Authentication → Providers → Email → "Confirm email" = ON**.

Com isso desligado, o cadastro entra direto (sem pedir confirmação).

## 4. "Esqueci minha senha" / redirecionamentos  ✅ pra reset funcionar
O link de redefinição precisa voltar pro seu app.

- [ ] **Authentication → URL Configuration**:
  - **Site URL**: a URL do app no Vercel (ex.: `https://seu-app.vercel.app`).
  - **Redirect URLs**: a mesma URL (e, pra testar local, `http://localhost:5500`
    ou a porta que você usar).

Sem isso, o email de redefinição não consegue abrir a tela de nova senha.

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
