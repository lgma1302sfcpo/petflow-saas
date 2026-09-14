# Preparação para produção

## Banco e recuperação

1. Criar PostgreSQL exclusivo por ambiente com TLS e usuário de privilégio mínimo.
2. Definir `DATABASE_URL`, aplicar `npx prisma migrate deploy` e executar o smoke test autenticado.
3. Habilitar backup automático, retenção fora da região primária e criptografia.
4. Restaurar um backup em ambiente isolado regularmente; backup sem teste de restauração não é considerado válido.

## Segurança operacional

- Substituir o rate limit em memória por Redis compartilhado antes de usar mais de uma instância.
- Gerar `NEXTAUTH_SECRET` aleatório, habilitar HTTPS e restringir hosts/proxies confiáveis.
- Armazenar certificados fiscais somente em KMS/cofre, com chave e política separadas por ambiente.
- Revisar acessos de plataforma, expiração das sessões sensíveis e logs de auditoria.
- Configurar Sentry/OpenTelemetry ou equivalente sem enviar documento, telefone ou conteúdo de vendas.

## Integrações

- WhatsApp: credenciais oficiais, templates aprovados, opt-in e tratamento de falhas/reenvios.
- Fiscal: homologar provedor e certificado antes de habilitar produção. A aplicação não emite documento simulado.
- Cobrança SaaS: mapear webhooks para `Subscription`, validar assinatura do webhook e aplicar idempotência.
- Arquivos: usar storage privado com URL assinada; nunca salvar binário ou segredo no banco da aplicação.

## Validação de liberação

Execute `npm run check`. Em seguida, com o banco de homologação disponível, aplique migrações, seed somente em ambiente descartável e realize testes E2E de login, troca de filial, venda, cancelamento, fechamento de caixa e tentativa de acesso cruzado entre duas empresas.
