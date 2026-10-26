# 10 — Integrações externas e credenciais

Nenhuma integração externa é necessária para a Fase 2. O app funciona com PostgreSQL e as variáveis de `.env.example`.

| Integração | Fase | Credenciais necessárias | Observações |
|---|---|---|---|
| PostgreSQL | 2 | `DATABASE_URL` | obrigatória |
| Segredos da aplicação | 2 | `COOKIE_SECRET`, `ENCRYPTION_KEY` (64 hex) | gerar com `openssl rand -hex 32` |
| Google Fonts | 2 | — | fontes Inter/JetBrains Mono (pode ser auto-hospedado) |
| Google Calendar (sincronização opcional) | 3 | OAuth Client ID/Secret do Google Cloud, escopo `calendar.events` | sincronização unidirecional app → agenda dedicada; `extendedProperties.private.medfinanceKey` evita duplicação |
| Armazenamento de comprovantes | 3 | S3/GCS: bucket, chave de acesso, KMS | criptografia no servidor; URLs assinadas curtas |
| OCR de comprovantes | 3 | provedor de OCR ou LLM com visão | requer consentimento; revisão antes de gravar |
| Cotações (B3, Tesouro, CDI/IPCA, cripto) | 3 | API de dados de mercado (ex.: brapi, BCB SGS — sem chave) | exibir fonte e horário de atualização |
| Open Finance Brasil | 3+ | **somente via provedor autorizado** (ex.: Pluggy, Belvo) — client id/secret | opcional, consentimento explícito do titular, revogável |
| Provedor de LLM (assistente) | 4 | `ANTHROPIC_API_KEY` (ou outro provedor via adaptador) | opt-in; minimização e mascaramento de PII |
| E-mail / push | 3 | SMTP/SES; VAPID keys para Web Push | conteúdo de notificação sem valores |
