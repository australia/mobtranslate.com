module.exports = {
  root: true,
  extends: ['eslint:recommended'],
  ignorePatterns: ['node_modules/', '.next/', 'dist/', '.cache/', 'coverage/', '*.min.js'],
  env: {
    es2021: true,
    node: true,
    browser: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended'],
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-empty-object-type': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        'prefer-const': 'off',
        'no-constant-condition': 'off',
      },
    },
  ],
  settings: {
    next: {
      rootDir: ['apps/*/'],
    },
  },
};
