// Compila netlify/api-handler.mts → netlify/build/handler.mjs num único arquivo.
// Tudo é embutido (código do monorepo e dependências npm), exceto módulos com binários
// nativos (Prisma e argon2), que o empacotador da Netlify rastreia e inclui à parte.
// Embutir as dependências também elimina incompatibilidades CJS/ESM no runtime
// (ex.: light-my-request faz require() do pacote ESM-only `cookie@2`).
import { build } from 'esbuild';

await build({
  entryPoints: ['netlify/api-handler.mts'],
  outfile: 'netlify/build/handler.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: 'inline',
  external: ['@prisma/client', '.prisma/*', '@node-rs/argon2'],
  // Pacotes CJS embutidos num bundle ESM ainda chamam require() de módulos nativos do Node
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
console.log('Function compilada: netlify/build/handler.mjs');
