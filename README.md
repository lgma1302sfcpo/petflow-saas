# PetFlow — SaaS multiempresa para pet shops

Sistema modular funcional com autenticação sem e-mail obrigatório, plataforma administrativa, empresas, planos, lojas, RBAC, catálogo por loja, estoque, clientes e pets, PDV com pagamento dividido, caixa, financeiro recorrente, banho e tosa, indicadores, relatórios CSV, importação em lotes e configuração fiscal isolada.

## Requisitos

- Node.js 22.12 ou superior (LTS recomendado; `.nvmrc` incluído)
- Docker Desktop, ou PostgreSQL 17 acessível
- npm

## Início rápido

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Acesse `http://localhost:3000`.

Credenciais de desenvolvimento do seed:

| Área | Empresa | Usuário | Senha |
| --- | --- | --- | --- |
| Plataforma | `plataforma` | `plataforma` | `Dev@123456` |
| Pet shop demo | `pet-demo` | `admin.demo` | `Demo@123456` |

Troque todas as credenciais e segredos fora do desenvolvimento.

## Scripts

- `npm run dev`: desenvolvimento
- `npm run build`: build de produção
- `npm run lint`: ESLint
- `npm run typecheck`: TypeScript estrito
- `npm test`: Vitest
- `npm run test:coverage`: cobertura
- `npm run db:validate`: valida o schema Prisma
- `npm run db:generate`: gera o cliente Prisma
- `npm run db:migrate`: aplica/cria migrações locais
- `npm run db:seed`: cria planos, permissões e a empresa demo
- `npm run check`: validação completa

## Arquitetura

O projeto é um monólito modular em Next.js App Router. As páginas protegidas são Server Components dinâmicos; mutações passam por Route Handlers, Zod, autenticação e autorização no servidor. PostgreSQL é acessado apenas pela camada Prisma com o adaptador oficial `pg`.

```text
src/
  app/
    login/                 entrada por credenciais
    app/                   painel da empresa
    platform/              painel exclusivo do SaaS
    api/                   consultas, mutações e Auth.js
  components/              interface reutilizável
  lib/
    auth.ts                autenticação e sessão
    tenant-scope.ts        escopo obrigatório de empresa/loja
    permissions.ts         catálogo RBAC
    modules.ts             resolução plano + override
    schemas.ts             validações Zod
  generated/prisma/        cliente gerado
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/
  unit/
  integration/
```

Detalhes e decisões estão em [`docs/architecture.md`](docs/architecture.md).

## Isolamento multiempresa

- `tenantId` nunca é aceito como autoridade do navegador; ele vem da sessão Auth.js.
- `branchId` precisa pertencer à lista de lojas da sessão.
- Repositórios usam `tenantWhere`/`tenantBranchWhere` para sobrescrever tentativas de injeção de escopo.
- Chaves estrangeiras compostas garantem que usuário, cargo e loja de vínculos pertençam ao mesmo tenant.
- Operações administrativas e críticas geram `AuditLog`.
- Testes tentam injetar outro `tenantId` e consultar loja externa.

## Personalizações por pet shop

Não é necessário clonar o projeto para atender uma regra diferente. Planos e `TenantModule` controlam módulos, `TenantSetting` guarda regras e identidade visual da empresa, `BranchSetting` permite exceções por loja e `customFeatures`/`customOverrides` armazenam feature flags contratadas. A resolução sempre começa pelo `tenantId` autenticado e aplica o override da loja autorizada, preservando o isolamento.

Mudanças úteis a vários clientes devem virar configuração tipada. Integrações ou jornadas exclusivas podem ficar atrás de uma feature flag para apenas a empresa contratante, mantendo uma única base de código.

Para defesa adicional em produção, recomenda-se habilitar PostgreSQL Row-Level Security por papel de banco/transação quando a infraestrutura de conexão estiver definida. A aplicação não depende de RLS para aplicar autorização, mas pode usá-la como segunda barreira.

## Segurança

- Hash bcrypt com custo 12.
- Sessões JWT HttpOnly/SameSite gerenciadas pelo Auth.js.
- Bloqueio após cinco senhas inválidas e rate limit de processo no login.
- Autorização no backend para plataforma e permissões do tenant.
- Zod em entradas externas.
- Transações para onboarding, vendas, estoque, caixa e importações auditadas.
- Baixa de estoque atômica e venda em isolamento serializável para evitar saldo concorrente incorreto.
- Idempotência em vendas e importações; importações repetidas atualizam pelo código interno sem duplicar.
- Verificação de origem e limite de mutações no proxy, além do bloqueio progressivo de login.
- Soft delete preparado em usuários e lojas.
- Fluxo sem cadastro público de empresa.

O rate limit em memória é adequado somente ao desenvolvimento e a uma única instância. Em produção, substitua-o por Redis/serviço distribuído mantendo a mesma interface. Defina CSP no proxy/reverse proxy, HTTPS obrigatório e rotação de segredos.

## Backup e recuperação

Em produção, configure backups automáticos do PostgreSQL, retenção em armazenamento separado, criptografia e testes regulares de restauração. Certificados fiscais futuros devem usar cofre de segredos/KMS e nunca colunas em texto puro.

## Escopo entregue

Além da fundação multiempresa, o projeto inclui os módulos operacionais: produtos por loja com inativação/reativação, estoque e transferências, clientes/pets, venda transacional e por peso, pagamentos divididos e troco, caixa por operador com correção/cancelamento/reabertura, contas a pagar/receber recorrentes, agenda com capacidade, bloqueios e sugestão de horário, pacotes, lembrete manual por WhatsApp, dashboard com filtros, quinze relatórios CSV e importações idempotentes de produtos/estoque em lotes com prévia, progresso e CSV de erros.

O superadministrador possui onboarding fechado, planos, limites, módulos, assinatura, auditoria e acesso comercial temporário. Qualquer resumo sensível exige motivo, expira em até 60 minutos e registra início, consulta e encerramento.

A configuração fiscal possui separação explícita entre homologação e produção, mas a emissão de NFC-e/NF-e permanece desabilitada até contratar/configurar um provedor fiscal e um cofre seguro para certificado. Integrações externas de WhatsApp, pagamentos, contabilidade e emissão fiscal dependem das credenciais desses serviços.

## Dependências externas para produção

O código local está preparado, mas estes itens não podem ser concluídos somente no repositório:

- PostgreSQL gerenciado, execução da migração e teste de restauração com credenciais reais.
- Redis ou serviço distribuído para rate limit em múltiplas instâncias.
- Armazenamento de objetos para upload do logotipo; hoje a empresa informa uma URL HTTPS.
- API oficial de WhatsApp para disparo automático; hoje o lembrete abre o WhatsApp manualmente e audita a ação.
- Provedor fiscal e KMS/cofre para certificados; emissão permanece intencionalmente bloqueada.
- Provedor de cobrança recorrente, monitoramento, alertas, domínio/HTTPS e política de backup do ambiente contratado.

Nenhum desses itens deve ser simulado como produção. Consulte [`docs/production-readiness.md`](docs/production-readiness.md).

## Fuso, moeda e idioma

Interface em pt-BR, moeda BRL e fuso padrão `America/Sao_Paulo`. Datas persistem como timestamps e são formatadas no limite da apresentação.
