export default [
    {
      files: ['*.js'],// Only .js files in the root folder (otherwise **/*.js)
      languageOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
      },
      plugins: {},
      rules: {
        'no-unused-vars': 'warn',
        'no-console': 'off',
        'semi': ['error', 'always'],
      }
    }
  ];
  