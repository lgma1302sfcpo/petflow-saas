# Arquitetura da Fase 1

## Contextos

1. **Plataforma:** administra planos, empresas, limites, status e auditoria. Não recebe acesso implícito aos dados comerciais.
2. **Tenant:** unidade legal/comercial isolada.
3. **Branch:** loja pertencente a um tenant.
4. **User:** funcionário identificado por `tenant + username`, vinculado a cargo e lojas.

## Fluxo de autenticação

O login recebe identificador da empresa, usuário e senha. `plataforma` seleciona o domínio administrativo; os demais identificadores resolvem o tenant. A sessão armazena IDs derivados do banco: tipo de usuário, tenant, lojas e permissões. Nenhuma mutação usa um tenant fornecido no corpo da requisição.

## Autorização

As páginas protegidas fazem verificação de sessão no servidor. Route Handlers repetem a verificação no ponto de mutação. RBAC usa chaves estáveis, como `users:manage`. A disponibilidade funcional resulta de módulos do plano com overrides por tenant.

## Integridade do banco

Índices únicos compostos evitam colisões de usuário, cargo e código de loja dentro de um tenant. Relações compostas em `UserBranch`, `User.role` e `BranchSetting` impedem vínculos cruzados entre empresas. Histórico sensível usa restrição de exclusão e soft delete.

## Onboarding

Apenas o superadministrador cria empresas. Uma transação cria tenant, assinatura trial, configurações, matriz, cargo administrador, permissões, usuário inicial e auditoria. Falha parcial reverte tudo.

## Superadmin e acesso excepcional

O modelo `ImpersonationSession` exige motivo, expiração e tenant explícitos. A Fase 1 não expõe impersonação na interface; portanto, não existe acesso silencioso a dados comerciais. Quando implementado, cada início, ação e encerramento deverá ser auditado.

## Evolução

Cada módulo futuro terá serviço de domínio e repositório scoped. Vendas, estoque e caixa usarão transações e chaves idempotentes. Fiscal será um bounded context opcional, com ambientes de homologação e produção separados e segredos em cofre externo.

## Riscos e mitigação

- **Consulta sem tenant:** helpers, revisão e testes hostis; RLS futuro como defesa adicional.
- **Sessão desatualizada:** sessões de até oito horas; operações críticas podem recarregar permissões do banco.
- **Rate limit horizontal:** trocar armazenamento em memória por Redis antes de escalar instâncias.
- **Plano versus override:** uma única função resolve módulos efetivos.
- **Crescimento de auditoria:** particionamento/retenção e exportação imutável em produção.
