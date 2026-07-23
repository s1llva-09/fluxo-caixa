Fluxo Caixa — Entrega final

O que foi implementado
- Cadastro e gestão de funcionários (`employees`) com audit log (`employees_audit`).
- Importação CSV com pré-visualização antes de aplicar os registros.
- Upload de anexos por funcionário com visualização de miniaturas no modal.
- Soft-delete de funcionários.
- Sistema de equipe (`company_members`) com papéis: `owner`, `admin`, `manager`, `member`.
- RPC `set_member_role` para alterar papéis (apenas `owner` pode alterar).
- Auditoria de mudanças de papel (`company_members_audit`) com função RPC `company_members_audit_with_emails` que junta emails legíveis.
- UI: Configurações → Equipe tem gestão de papéis, remoção, histórico e export CSV.
- Teste rápido: `tests/funcionarios_test.html` que cria/atualiza/upload/deleta registros de teste.

Como rodar localmente
1. Inicie um servidor estático na raiz do projeto (`fluxo-caixa`). Exemplo:

# Com Python 3
python -m http.server 5500

# Ou com npx serve
npx serve .

2. Abra no navegador a página de testes e o app:
- Testes: http://localhost:5500/tests/funcionarios_test.html
- App: http://localhost:5500/

Aplicar migrations no Supabase
1. Abra o projeto no Supabase → SQL Editor.
2. Rode, nesta ordem (cada arquivo inteiro):
   - `supabase/schema.sql`
   - `supabase/comprovantes.sql` (se existir)
   - `supabase/equipe.sql`
   - `supabase/funcionarios.sql`
3. Verifique no Table Editor as tabelas: `employees`, `employees_audit`, `company_members`, `company_members_audit`, `invites`, `attachments`.

Testes e verificações recomendadas
- Na UI: Configurações → Equipe — como dono altere papel e verifique histórico; como member tente editar funcionário (deve respeitar RLS).
- CSV: clique em Importar CSV → valide o preview → confirme import.
- Anexos: ao editar funcionário, faça upload de uma imagem e abra o modal de detalhes para ver a miniatura.
- Rodar `tests/funcionarios_test.html` e inspecionar a saída na página e no console.

Limpeza de dados de teste
- Use o arquivo `supabase/test_data.sql` para inserir/remover dados de teste (ajuste UUIDs). Ele contém instruções de cleanup comentadas.

Observações finais
- Recomendado aplicar as migrations em ambiente de staging antes de production.
- Se precisar, eu crio um endpoint admin para exportar logs completos ou uma página dedicada com filtros.

Se quiser, eu gero agora a página de administração de permissões ou executo a opção A (rodar checks automáticos com um script simulador).