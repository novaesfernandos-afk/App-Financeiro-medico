// Netlify Function (API v2). O handler é gerado no build por scripts/build-netlify-function.mjs,
// que embute o código TypeScript do monorepo (@medfinance/core + apps/api) num único arquivo.
export { default } from '../build/handler.mjs';

export const config = { path: '/api/*' };
