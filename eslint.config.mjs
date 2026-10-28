import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/dist-test/**',
      '**/.next/**',
      '**/.next-e2e/**',
      '**/next-env.d.ts',
      '**/node_modules/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextVitals.map((config) => ({ ...config, files: ['apps/web/**/*.{ts,tsx}'] })),
  { files: ['apps/web/**/*.{ts,tsx}'], settings: { next: { rootDir: 'apps/web/' } } },
];
