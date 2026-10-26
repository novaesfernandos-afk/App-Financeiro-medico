import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET deve ter ao menos 16 caracteres'),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY deve ter 64 caracteres hexadecimais'),
  PORT: z.coerce.number().default(3333),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Variáveis de ambiente inválidas:\n${parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  }
  if (parsed.data.NODE_ENV === 'production' && /^0+$/.test(parsed.data.ENCRYPTION_KEY)) {
    throw new Error('ENCRYPTION_KEY padrão não pode ser usada em produção');
  }
  return parsed.data;
}
