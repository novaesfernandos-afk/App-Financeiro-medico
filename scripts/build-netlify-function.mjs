// Compila netlify/api-handler.mts → netlify/build/handler.mjs.
// Pacotes do workspace (@medfinance/*) e código local são embutidos; dependências npm
// ficam externas para o empacotador da Netlify rastreá-las (Prisma e argon2 têm binários nativos).
import { build } from 'esbuild';

await build({
  entryPoints: ['netlify/api-handler.mts'],
  outfile: 'netlify/build/handler.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: 'inline',
  plugins: [{
    name: 'externalize-npm',
    setup(b) {
      b.onResolve({ filter: /^[^./]/ }, (args) =>
        args.path.startsWith('@medfinance/') ? undefined : { path: args.path, external: true });
    },
  }],
});
console.log('Function compilada: netlify/build/handler.mjs');
