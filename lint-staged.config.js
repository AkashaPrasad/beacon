/** @type {import('lint-staged').Configuration} */
export default {
  '*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}': ['prettier --write', 'eslint --fix --no-warn-ignored'],
  '*.{json,jsonc,md,yml,yaml,css,html}': ['prettier --write'],
};
