export default [
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "CallExpression[callee.property.name=/^(find|findOne|findById|updateOne|updateMany|findOneAndUpdate|deleteOne|deleteMany|countDocuments)$/] > MemberExpression[object.name='req']",
        message: 'Do not pass req.* directly into a Mongoose query. Build filters/updates from explicitly allowed fields (see docs/query-safety.md).',
      }],
    },
  },
]
