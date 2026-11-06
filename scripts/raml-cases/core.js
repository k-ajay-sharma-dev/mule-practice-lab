// Answers for scripts/check-raml.js. swap: [from, to] or [from, to, file] applied to the model answer.
export default [
  {
    id: 'rm-001',
    wrong: [{ swap: [['        404:\n          description: No store has this id.\n', '']], fails: '404' }],
    right: [{ swap: [['{storeId}', '{id}']] }],
  },
  {
    id: 'rm-048',
    wrong: [
      { swap: [['/videos:\n  get:\n', '/videos:\n  get:\n    securedBy: [ oauth2 ]\n']], fails: 'stay open' },
      { swap: [['https://auth.example.com/token', 'https://login.example.com/oauth']], fails: 'settings' },
    ],
  },
]
