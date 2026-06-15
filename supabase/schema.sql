-- ============================================================================
--  FLUXO DE CAIXA — Schema do banco (Supabase / PostgreSQL)
-- ============================================================================
--  Como usar:
--   1. Crie um projeto em https://supabase.com
--   2. Vá em "SQL Editor" > "New query"
--   3. Cole TODO este arquivo e clique em "Run"
--
--  O que este arquivo cria:
--   - Tabelas: companies (empresas), company_members, categories, transactions
--   - RLS (Row Level Security): cada usuário só enxerga os dados da SUA empresa.
--     É isso que torna o sistema "multi-tenant" (vários clientes no mesmo banco,
--     sem um ver o dado do outro) — base pra virar um SaaS depois.
--   - Lançamentos IMUTÁVEIS: não se edita nem apaga um lançamento. Pra "corrigir",
--     cria-se um estorno (um contra-lançamento). Isso evita dor de cabeça de
--     auditoria e deixa o histórico financeiro confiável.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------

-- Empresas (cada cliente do sistema é uma empresa / "tenant")
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Vínculo entre usuários e empresas.
-- Hoje cada dono tem 1 empresa, mas esta tabela já deixa pronto pra ter
-- vários usuários na mesma empresa no futuro (equipe / contador).
create table if not exists public.company_members (
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'owner',  -- owner | member
  created_at  timestamptz not null default now(),
  primary key (company_id, user_id)
);

-- Categorias dos lançamentos (ex.: Vendas, Aluguel, Fornecedores...)
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null,
  -- 'entrada', 'saida' ou null (serve pros dois)
  kind        text check (kind in ('entrada', 'saida')),
  created_at  timestamptz not null default now()
);

-- Lançamentos (o coração do sistema: o que entra e o que sai do caixa)
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  kind         text not null check (kind in ('entrada', 'saida')),
  -- Valor guardado em CENTAVOS (número inteiro). Nunca guarde dinheiro em
  -- "float" (1.10 + 2.20 pode dar 3.3000000001). Em centavos é sempre exato.
  amount_cents bigint not null check (amount_cents > 0),
  description  text not null default '',
  category_id  uuid references public.categories (id) on delete set null,
  occurred_on  date not null default current_date,
  -- Se este lançamento for um estorno, aponta pro lançamento original.
  reverses_id  uuid references public.transactions (id) on delete restrict,
  created_by   uuid not null default auth.uid() references auth.users (id),
  created_at   timestamptz not null default now()
);

-- Índices pra deixar as consultas rápidas
create index if not exists idx_transactions_company on public.transactions (company_id, occurred_on);
create index if not exists idx_categories_company   on public.categories (company_id);


-- ----------------------------------------------------------------------------
-- 2) VIEW com o campo "estornado" calculado
-- ----------------------------------------------------------------------------
-- Um lançamento está "estornado" se existe outro lançamento apontando pra ele.
-- A view calcula isso automaticamente, então o front não precisa se preocupar.
-- security_invoker = on faz a view respeitar o RLS da tabela de baixo.
create or replace view public.v_transactions
with (security_invoker = on) as
select
  t.*,
  exists (
    select 1 from public.transactions r where r.reverses_id = t.id
  ) as is_reversed
from public.transactions t;


-- ----------------------------------------------------------------------------
-- 3) FUNÇÕES AUXILIARES
-- ----------------------------------------------------------------------------

-- Diz se o usuário logado faz parte de uma empresa.
-- Usada nas regras de segurança (RLS) abaixo.
create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
  );
$$;

-- Cria uma empresa e já adiciona o usuário logado como dono.
-- Feito como função pra evitar o problema do "ovo e galinha" no RLS
-- (não dá pra criar empresa e vínculo ao mesmo tempo respeitando as regras).
create or replace function public.create_company(p_name text)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies;
begin
  insert into public.companies (name, owner_id)
  values (p_name, auth.uid())
  returning * into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company.id, auth.uid(), 'owner');

  return v_company;
end;
$$;

-- Estorna um lançamento: cria um contra-lançamento com o tipo invertido
-- (entrada vira saída e vice-versa) e o mesmo valor. O original nunca muda.
create or replace function public.reverse_transaction(p_id uuid)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig public.transactions;
  v_new  public.transactions;
begin
  -- Busca o original e confere se o usuário tem acesso à empresa dele
  select * into v_orig from public.transactions where id = p_id;
  if v_orig.id is null then
    raise exception 'Lançamento não encontrado';
  end if;
  if not public.is_company_member(v_orig.company_id) then
    raise exception 'Sem permissão';
  end if;
  -- Não deixa estornar algo que já foi estornado
  if exists (select 1 from public.transactions where reverses_id = p_id) then
    raise exception 'Este lançamento já foi estornado';
  end if;
  -- Não deixa estornar um estorno
  if v_orig.reverses_id is not null then
    raise exception 'Não é possível estornar um estorno';
  end if;

  insert into public.transactions
    (company_id, kind, amount_cents, description, category_id, occurred_on, reverses_id)
  values (
    v_orig.company_id,
    case when v_orig.kind = 'entrada' then 'saida' else 'entrada' end,
    v_orig.amount_cents,
    'Estorno: ' || coalesce(v_orig.description, ''),
    v_orig.category_id,
    current_date,
    v_orig.id
  )
  returning * into v_new;

  return v_new;
end;
$$;


-- ----------------------------------------------------------------------------
-- 4) RLS — REGRAS DE SEGURANÇA (o usuário só vê/mexe nos dados da sua empresa)
-- ----------------------------------------------------------------------------

alter table public.companies       enable row level security;
alter table public.company_members enable row level security;
alter table public.categories      enable row level security;
alter table public.transactions    enable row level security;

-- COMPANIES: o membro pode ver a empresa. Criar é só pela função create_company.
drop policy if exists "ver empresa" on public.companies;
create policy "ver empresa" on public.companies
  for select using (public.is_company_member(id));

-- Só o dono pode atualizar o nome da empresa.
drop policy if exists "atualizar empresa" on public.companies;
create policy "atualizar empresa" on public.companies
  for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- COMPANY_MEMBERS: cada um vê os vínculos das empresas das quais participa.
drop policy if exists "ver vinculos" on public.company_members;
create policy "ver vinculos" on public.company_members
  for select using (public.is_company_member(company_id));

-- CATEGORIES: membro vê, cria, edita e apaga as categorias da sua empresa.
-- (Categoria pode editar/apagar — não é dado financeiro sensível.)
drop policy if exists "ver categorias" on public.categories;
create policy "ver categorias" on public.categories
  for select using (public.is_company_member(company_id));

drop policy if exists "criar categorias" on public.categories;
create policy "criar categorias" on public.categories
  for insert with check (public.is_company_member(company_id));

drop policy if exists "editar categorias" on public.categories;
create policy "editar categorias" on public.categories
  for update using (public.is_company_member(company_id));

drop policy if exists "apagar categorias" on public.categories;
create policy "apagar categorias" on public.categories
  for delete using (public.is_company_member(company_id));

-- TRANSACTIONS: membro só pode VER e CRIAR.
-- Repare que NÃO existe regra de UPDATE nem DELETE de propósito:
-- lançamento é imutável. Corrigir = estornar (função reverse_transaction).
drop policy if exists "ver lancamentos" on public.transactions;
create policy "ver lancamentos" on public.transactions
  for select using (public.is_company_member(company_id));

drop policy if exists "criar lancamentos" on public.transactions;
create policy "criar lancamentos" on public.transactions
  for insert with check (public.is_company_member(company_id));

-- ============================================================================
--  Pronto! Banco configurado com segurança multi-tenant e lançamentos imutáveis.
-- ============================================================================
