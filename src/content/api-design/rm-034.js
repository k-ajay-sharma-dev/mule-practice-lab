export default {
  id: 'rm-034',
  category: 'api-design',
  title: 'Library Loans API: Fix a Broken File',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'debugging', 'data-types', 'resources', 'public-sector'],
  estMinutes: 12,
  description: `
A city library wrote its first RAML file by hand, and it does not work. The file in the editor holds seven mistakes that people often make.

The **parser** is the part of the site that reads your file. It lists each error with a line number. Start at the top and fix one error at a time, because fixing one can reveal the next.

One mistake is not an error at all. A file can be valid RAML and still describe the wrong URL, so read the requirements too.

**Requirements**
- All bodies are JSON, set once with \`mediaType\`.
- \`Loan\` has the required strings \`loanId\` and \`isbn\`.
- \`Loan\` has a required \`dueDate\`, which is a calendar day with no time.
- \`Loan\` has an example that fits it.
- \`GET /loans\` returns \`Loan[]\` with status 200.
- \`POST /loans\` takes a \`Loan\` body and returns 201.
- \`GET /loans/{loanId}\` sits under \`/loans\` and returns a \`Loan\` with status 200, or 404 when the loan does not exist. Nothing is left at \`/{loanId}\` on its own.
`,
  starter: `#%RAML 1.0
title: Library Loans API
version: v1
baseUri: https://api.example.com/library/{version}
mediatype: application/json

types:
  Loan:
    type: object
    properties:
      loanId: string
      isbn: string
      dueDate: date
    example:
      loanId: L-2041
      isbn: 978-0-14-103614-4
      dueDate: 14/03/2026

/loans:
  GET:
    responses:
      200:
        body:
          type: Loan[]
  post:
    body:
      type: Loan
    respones:
      201:
        description: The loan was recorded.
/{loanId}:
  get:
    responses:
      200:
        body:
          type: Loan
      NotFound:
        description: No loan has this id.
`,
  ramlChecks: [
    { label: 'JSON is set once with mediaType', rule: { type: 'root', key: 'mediaType', want: 'application/json' } },
    {
      label: 'loanId and isbn are required strings',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Loan', prop: 'loanId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Loan', prop: 'isbn', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'dueDate is a required date-only', rule: { type: 'prop', typeName: 'Loan', prop: 'dueDate', want: { type: 'date-only', required: true } } },
    {
      label: 'Loan has an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'Loan', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'Loan', want: { examples: { set: true } } },
        ],
      },
    },
    { label: 'GET /loans returns Loan[]', rule: { type: 'response', path: '/loans', method: 'get', status: '200', typeIs: 'Loan[]' } },
    {
      label: 'POST /loans takes a Loan and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/loans', method: 'post', typeIs: 'Loan' },
          { type: 'response', path: '/loans', method: 'post', status: '201' },
        ],
      },
    },
    {
      label: 'The single loan is nested under /loans and returns a Loan',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/loans/{}', method: 'get', status: '200', typeIs: 'Loan' },
          { type: 'noResource', path: '/{}' },
        ],
      },
    },
    { label: 'GET /loans/{loanId} returns 404 for an unknown loan', rule: { type: 'response', path: '/loans/{}', method: 'get', status: '404' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Library Loans API
version: v1
baseUri: https://api.example.com/library/{version}
mediaType: application/json

types:
  Loan:
    type: object
    properties:
      loanId: string
      isbn: string
      dueDate: date-only
    example:
      loanId: L-2041
      isbn: 978-0-14-103614-4
      dueDate: 2026-03-14

/loans:
  get:
    responses:
      200:
        body:
          type: Loan[]
  post:
    body:
      type: Loan
    responses:
      201:
        description: The loan was recorded.
  /{loanId}:
    get:
      responses:
        200:
          body:
            type: Loan
        404:
          description: No loan has this id.
`,
  keyPoints: [
    'RAML keys are case sensitive. mediaType and get work, while mediatype and GET do not.',
    'RAML 1.0 has no date type. Use date-only, time-only, datetime-only or datetime.',
    'A date-only value is written as yyyy-mm-dd, so 14/03/2026 does not fit.',
    'Indentation decides the path. A resource at the left edge is a new top-level path, even when the file stays valid.',
    'Response keys are numeric HTTP status codes, never words.',
  ],
  solution: `
The seven mistakes:
- \`mediatype\` needs a capital T. Until it is fixed, every body also reports that it has no media type.
- \`date\` is not a RAML 1.0 type. A calendar day is \`date-only\`.
- The example date \`14/03/2026\` must be \`2026-03-14\`. This error only appears once the type is fixed.
- \`GET\` must be \`get\`.
- \`respones\` must be \`responses\`.
- \`/{loanId}\` was at the left edge, so its path was \`/{loanId}\` and not \`/loans/{loanId}\`. The parser cannot catch this, because that path is legal.
- \`NotFound\` must be the status code \`404\`.

Reading errors from the top is the quickest route. One small typo near the top can cause several errors further down.
`,
  followUps: [
    {
      q: 'Why did the parser not report the wrongly indented resource?',
      a: 'A top-level path called /{loanId} is legal RAML, so the parser has nothing to complain about. Only the requirements show that the URL is wrong.',
    },
    {
      q: 'Why can one typo produce several errors?',
      a: 'Later parts depend on earlier ones. With mediaType misspelled, each body has no default media type, so each body reports its own error.',
    },
    {
      q: 'What is the difference between a parser error and a design mistake?',
      a: 'A parser error breaks the rules of the language and stops the file being used. A design mistake is valid RAML that describes the wrong API, and only a review or a test against the requirements finds it.',
    },
  ],
}
