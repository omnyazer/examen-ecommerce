import js from '@eslint/js';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/build/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.git/**',
      'docs/api/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,cjs,mjs,jsx}'],
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
    },
  },
  {
    files: [
      'backend/**/*.js',
      'backend/**/*.cjs',
      'gateway/**/*.js',
      'microservices/**/*.js',
      'microservices/**/*.cjs',
    ],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['frontend/src/**/*.{js,jsx}'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['frontend/**/*.test.{js,jsx}'],
    languageOptions: {
      globals: Object.fromEntries(
        [
          'vi',
          'test',
          'expect',
          'describe',
          'it',
          'beforeEach',
          'afterEach',
          'beforeAll',
          'afterAll',
        ].map((name) => [name, 'readonly'])
      ),
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['frontend/postcss.config.js', 'frontend/tailwind.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  prettier,
];
