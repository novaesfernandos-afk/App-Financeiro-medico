# 09 — Segurança e LGPD

## Implementado

| Requisito | Implementação |
|---|---|
| Senhas | argon2id (`@node-rs/argon2`), política mínima 10 caracteres com letras e números |
| Sessão | token aleatório de 256 bits em cookie `httpOnly`, `SameSite=Strict`, `Secure` em produção, assinado; banco guarda só SHA-256; expira em 7 dias; logout revoga |
| MFA | TOTP (RFC 6238); segredo criptografado em repouso com AES-256-GCM (`ENCRYPTION_KEY`) |
| Isolamento entre usuários | todas as consultas filtram `userId`; `assertOwned` em toda FK recebida; testes de acesso cruzado |
| Validação | zod em todas as entradas; limites de tamanho; body ≤ 1 MB |
| Abuso | rate limit global (300/min) e de autenticação (10/min); mensagem única para e-mail/senha errados |
| Cabeçalhos | `@fastify/helmet` |
| Logs | redação de cookies/authorization; sem valores financeiros em texto livre |
| Auditoria | `AuditLog` para criação/alteração/exclusão, login, MFA, exportação, lotes |
| Operações sensíveis | confirmação explícita: lote (`confirm: true`), MFA off (senha + código), exclusão de conta (senha + frase) |
| LGPD — portabilidade | `GET /api/privacy/export` (JSON completo) |
| LGPD — eliminação | `POST /api/privacy/delete-account` (cascata total) |
| Minimização | sem coleta de CPF; CRM/CNPJ opcionais |
| PWA | service worker não armazena respostas `/api` |
| Segredos | `.env` fora do git; validação na inicialização; chave padrão bloqueada em produção |

## Infraestrutura (responsabilidade do deploy)

- TLS obrigatório (HTTPS/HSTS) no proxy/ingress.
- PostgreSQL com criptografia de disco e backups diários criptografados (PITR); teste trimestral de restauração.
- Segredos em cofre (AWS Secrets Manager, GCP Secret Manager ou equivalente).
- CORS: servir web e API no mesmo domínio (recomendado) ou restringir a `WEB_ORIGIN`.

## Pendente

- Passkeys/WebAuthn (biometria) — Fase 5.
- Revogar demais sessões ao trocar senha; listagem de sessões ativas.
- Consentimento granular para IA e integrações externas (Fase 4) e registro de base legal.
- Política de retenção de logs de auditoria; DPO/canal do titular.
- CSP estrita no frontend servido em produção.
