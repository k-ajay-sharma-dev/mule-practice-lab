export default {
  id: 'rm-004',
  category: 'api-design',
  title: 'Bank Statements API: Typed URI Parameters',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'uri-parameters', 'resources', 'banking'],
  estMinutes: 12,
  description: `
A bank wants an API that returns the statements of an account, for a year or for one month of that year.

A **URI parameter** is a part of the path that changes per request, written in curly brackets. With no other detail it is a string. To give it a type and limits, add \`uriParameters\` on the resource that has it in its path. This goes on the resource, not on a method.

**Requirements**
- \`GET /accounts/{accountId}\` returns 200, or 404 when the account does not exist.
- \`accountId\` is always 10 digits and can start with 0. Choose its type with that in mind, and make the rule for its length part of the contract. You can do this with \`minLength\` and \`maxLength\`, or with a \`pattern\`.
- \`GET /accounts/{accountId}/statements/{year}\` returns 200.
- \`year\` is an integer with a minimum of 2000.
- \`GET /accounts/{accountId}/statements/{year}/{month}\` returns 200, or 404 when there is no statement for that month.
- \`month\` is an integer from 1 to 12.
`,
  starter: `#%RAML 1.0
title: Bank Statements API
mediaType: application/json

/accounts:
  /{accountId}:
    uriParameters:
    get:
`,
  ramlChecks: [
    {
      label: 'accountId is a string with a fixed length of 10, so a leading 0 survives',
      rule: {
        type: 'any',
        rules: [
          { type: 'param', path: '/accounts/{}', in: 'uri', want: { type: 'string', minLength: 10, maxLength: 10 } },
          { type: 'param', path: '/accounts/{}', in: 'uri', want: { type: 'string', pattern: { set: true } } },
        ],
      },
    },
    {
      label: 'GET /accounts/{accountId} returns 200, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/accounts/{}', method: 'get', status: '200' },
          { type: 'response', path: '/accounts/{}', method: 'get', status: '404' },
        ],
      },
    },
    { label: 'year is an integer with a minimum of 2000', rule: { type: 'param', path: '/accounts/{}/statements/{}', in: 'uri', want: { type: 'integer', minimum: 2000 } } },
    { label: 'GET /accounts/{accountId}/statements/{year} returns 200', rule: { type: 'response', path: '/accounts/{}/statements/{}', method: 'get', status: '200' } },
    { label: 'month is an integer from 1 to 12', rule: { type: 'param', path: '/accounts/{}/statements/{}/{}', in: 'uri', want: { type: 'integer', minimum: 1, maximum: 12 } } },
    {
      label: 'GET /accounts/{accountId}/statements/{year}/{month} returns 200, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/accounts/{}/statements/{}/{}', method: 'get', status: '200' },
          { type: 'response', path: '/accounts/{}/statements/{}/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Bank Statements API
mediaType: application/json

/accounts:
  /{accountId}:
    uriParameters:
      accountId:
        type: string
        minLength: 10
        maxLength: 10
    get:
      responses:
        200:
          description: The account.
        404:
          description: No account has this id.
    /statements:
      /{year}:
        uriParameters:
          year:
            type: integer
            minimum: 2000
        get:
          responses:
            200:
              description: The statements for this year.
        /{month}:
          uriParameters:
            month:
              type: integer
              minimum: 1
              maximum: 12
          get:
            responses:
              200:
                description: The statement for this month.
              404:
                description: There is no statement for this month.
`,
  keyPoints: [
    'uriParameters sits on the resource whose path holds the parameter, not on a method.',
    'A URI parameter is a string unless you give it another type.',
    'An id made of digits is often a string, because a number would lose a leading 0.',
    'Limits such as minimum and maximum let bad values be refused before any logic runs.',
  ],
  solution: `
\`accountId\` looks like a number, but it is an identifier. You never do arithmetic on it, and as an integer \`0012345678\` would lose its leading zeros. So it is a string with a fixed length.

\`year\` and \`month\` are real numbers with a real range, so \`integer\` with limits fits them. A request for month 13 now breaks the contract.

Each \`uriParameters\` block sits on the resource that introduces the parameter. The name inside it must match the name in the curly brackets.
`,
  followUps: [
    {
      q: 'Why not make accountId an integer, since it only holds digits?',
      a: 'An integer drops leading zeros and can overflow for long ids. A value you only compare and never calculate with is better as a string.',
    },
    {
      q: 'What is the difference between uriParameters and queryParameters in where they are written?',
      a: 'uriParameters goes on a resource, because the value is part of its path. queryParameters goes on a method, because each method can accept different options.',
    },
    {
      q: 'Is a pattern better than minLength and maxLength here?',
      a: 'A pattern such as ^[0-9]{10}$ is stricter, since it also refuses letters. Both state a fixed length, so choose the pattern when the characters matter too.',
    },
  ],
}
