export default [
    {
      files: ['js/**/*.js'],
      languageOptions: {
        ecmaVersion: 2021,
        sourceType: 'script',
      },
      plugins: {},
      rules: {
        'no-unused-vars': 'warn',
        'no-console': 'off',
        'semi': ['error', 'always'],
      }
    }
  ];
  