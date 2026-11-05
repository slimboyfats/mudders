import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Rules that keep the simulation deterministic (REQUIREMENTS §6.3, §2c.1).
// Applied to the kernel and to all content.
const determinism = {
  'no-restricted-globals': [
    'error',
    { name: 'Date', message: 'No wall-clock time in sim/content. Use the tick counter.' },
    { name: 'performance', message: 'No wall-clock time in sim/content.' },
    { name: 'window', message: 'sim/content must not touch the DOM.' },
    { name: 'document', message: 'sim/content must not touch the DOM.' },
    { name: 'setTimeout', message: 'No timers in sim/content.' },
    { name: 'setInterval', message: 'No timers in sim/content.' },
    { name: 'requestAnimationFrame', message: 'No frame timing in sim/content.' },
  ],
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Use the match PRNG.' },
    { object: 'Math', property: 'sin', message: 'Use fixed-point or lookup tables (§6.3).' },
    { object: 'Math', property: 'cos', message: 'Use fixed-point or lookup tables (§6.3).' },
    { object: 'Math', property: 'tan', message: 'Use fixed-point or lookup tables (§6.3).' },
    { object: 'Math', property: 'atan2', message: 'Use fixed-point or lookup tables (§6.3).' },
    { object: 'Math', property: 'pow', message: 'Use integer math (§6.3).' },
    { object: 'Math', property: 'exp', message: 'Use integer math (§6.3).' },
    { object: 'Math', property: 'log', message: 'Use integer math (§6.3).' },
    { object: 'Date', property: 'now', message: 'No wall-clock time in sim/content.' },
  ],
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { group: ['react', 'react-dom', 'react/*'], message: 'sim/content must not use React.' },
        { group: ['pixi.js', 'pixi.js/*'], message: 'sim/content must not use the renderer.' },
        {
          group: ['@mudders/client', '@mudders/client/*'],
          message: 'sim/content must not import the client.',
        },
      ],
    },
  ],
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', 'captures/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: [
      'packages/sim/src/**/*.ts',
      'packages/content/core/**/*.ts',
      'packages/content/src/**/*.ts',
    ],
    ignores: ['**/*.test.ts'],
    rules: determinism,
  },
  {
    // Hot loops index typed arrays constantly; with noUncheckedIndexedAccess every read is
    // `number | undefined`, and `!` is the zero-cost way to say "in bounds by construction".
    files: [
      'packages/sim/**/*.ts',
      'packages/content/**/*.ts',
      'packages/capture/src/**/*.ts',
      'packages/client/src/render/**/*.ts',
      'packages/client/src/capture/**/*.ts',
    ],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // The kernel never imports content (§2c.1).
    files: ['packages/sim/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...determinism['no-restricted-imports'][1].patterns,
            {
              group: ['@mudders/content', '@mudders/content/*'],
              message: 'The kernel never imports content.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: [
      'packages/{signal,capture}/**/*.ts',
      'packages/content/{bench,scripts}/**/*.ts',
      'scripts/**/*.ts',
      '*.{js,ts}',
      'packages/*/*.{js,ts}',
    ],
    languageOptions: { globals: globals.node },
  },
);
