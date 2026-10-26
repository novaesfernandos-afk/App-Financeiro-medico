import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Sincroniza o schema no banco de testes (TEST_DATABASE_URL) — operação não destrutiva.
 * Os testes criam usuários com e-mails únicos e o isolamento por userId garante
 * que execuções anteriores não interfiram, sem necessidade de apagar dados.
 */
export default function setup() {
  if (existsSync('.env')) {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const m = /^([A-Z_]+)="?([^"]*)"?$/.exec(line.trim());
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2];
    }
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Defina TEST_DATABASE_URL para rodar os testes de integração');
  if (!/test/i.test(url)) throw new Error('TEST_DATABASE_URL deve apontar para um banco de testes (nome contendo "test")');
  try {
    execSync('npx prisma db push --skip-generate', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  } catch (e) {
    throw new Error(`Falha ao sincronizar schema de testes: ${String((e as { stderr?: Buffer }).stderr ?? e)}`);
  }
}
