module.exports = {
  extends: ['next'],
  rules: {
    '@next/next/no-html-link-for-pages': 'off',
    'react/no-unescaped-entities': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
    '@next/next/no-page-custom-font': 'warn',
    '@next/next/no-sync-scripts': 'warn'
  },
};
