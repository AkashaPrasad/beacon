/** @type {import('prettier').Config} */
const config = {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all',
  semi: true,
  arrowParens: 'always',
  endOfLine: 'lf',
  overrides: [
    {
      files: ['*.md'],
      options: { proseWrap: 'preserve' },
    },
  ],
};

export default config;
