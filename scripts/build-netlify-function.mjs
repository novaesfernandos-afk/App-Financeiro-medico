// Compila netlify/api-handler.mts → netlify/build/handler.mjs num único arquivo.
// Tudo é embutido (código do monorepo e dependências npm), exceto módulos com binários
// nativos (Prisma e argon2), que o empacotador da Netlify rastreia e inclui à parte.
// Embutir as dependências também elimina incompatibilidades CJS/ESM no runtime
// (ex.: light-my-request faz require() do pacote ESM-only `cookie@2`).
import { build } from 'esbuild';
import { readdirSync, readFileSync } from 'node:fs';

// Migrações Prisma embutidas no bundle (aplicadas pela Function no cold start)
const MIGRATIONS_DIR = 'apps/api/prisma/migrations';
const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
  .map((name) => ({ name, sql: readFileSync(`${MIGRATIONS_DIR}/${name}/migration.sql`, 'utf8') }));

await build({
  entryPoints: ['netlify/api-handler.mts'],
  outfile: 'netlify/build/handler.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: 'inline',
  define: { __MIGRATIONS__: JSON.stringify(migrations) },
  external: ['@prisma/client', '.prisma/*', '@node-rs/argon2'],
  // Pacotes CJS embutidos num bundle ESM ainda chamam require() de módulos nativos do Node
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
console.log(`Function compilada: netlify/build/handler.mjs (${migrations.length} migração(ões) embutida(s))`);
