export default {
  id: 'rm-119',
  category: 'api-design',
  title: 'Payroll Mobile Experience API: Payslips, PDFs and Bank Details on a Phone',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'experience-api', 'api-led', 'security', 'oauth2', 'media-types', 'hr'],
  estMinutes: 50,
  description: `
A retail group pays 38,000 staff every four weeks. Most of them have no desk and no work laptop, so the group is launching a payroll app. On payday morning about 20,000 people open it within two hours to check their pay.

The payroll System API already exists. Its \`Payslip\` record has 60 fields, including tax codes and national insurance numbers, and it lets HR look up any employee. A first draft of the mobile API copied it, which is in the editor. You are writing the **Experience API** for the app instead.

**Brief**
- The app works only for the signed-in employee. Nobody can ask for someone else's pay, so paths start at \`/me\` and the employee comes from the token.
- The list screen shows the pay date, the period label and the net pay. The detail screen adds gross pay and the earnings and deductions lines. Tax codes, national insurance numbers and full account numbers never reach the phone.
- An employee can download a payslip as a PDF, from the same URL as the JSON detail.
- Changing bank details is the most common payroll fraud. It needs its own scope, and the response never echoes the full account number.
- Old app versions must be told to update. The app sends its version in \`X-App-Version\`, such as \`3.14.2\`.

**Requirements**
- Title \`Payroll Mobile Experience API\`, HTTPS only, and JSON as the default media type.
- \`PayslipSummary\` has a required string \`payslipId\`, a required \`payDate\` with no time, and a required \`netPay\` of type \`Money\`. It has no \`taxCode\`, \`nationalInsuranceNumber\` or \`bankAccountNumber\`.
- \`PayslipDetail\` inherits from \`PayslipSummary\` and adds a required \`grossPay\` of type \`Money\` and a required \`deductions\` of type \`PayslipLine[]\`.
- \`GET /me/payslips\` returns \`PayslipSummary[]\` with status 200 and has an optional integer \`year\` of at least 2015.
- \`GET /me/payslips/{payslipId}\` returns status 200 with two bodies: \`application/json\` of type \`PayslipDetail\` and \`application/pdf\` of type \`file\`. It returns an \`Error\` with status 404.
- \`BankDetails\` has no \`accountNumber\`. It has a required \`accountNumberMasked\`: four stars and the last four digits.
- \`BankDetailsChange\` has a required \`sortCode\` of exactly six digits and a required \`accountNumber\` of exactly eight digits.
- \`GET /me/bank-details\` returns \`BankDetails\` with status 200. \`PUT /me/bank-details\` takes a \`BankDetailsChange\` and returns \`BankDetails\` with status 200, or an \`Error\` with status 422 when the bank says the account does not exist. There is no \`delete\`.
- Trait \`mobileClient\` has a required header \`X-App-Version\` whose pattern allows three numbers with dots between them, and a 426 response with an \`Error\` body. All four methods use it.
- A scheme \`oauth2\` of type \`OAuth 2.0\` with the grant \`authorization_code\` and an \`authorizationUri\`, since people sign in.
- The two payslip methods need \`payslips:read\` and nothing else. \`GET /me/bank-details\` needs \`bank:read\` and nothing else. \`PUT /me/bank-details\` needs \`bank:write\` and nothing else.
- No resource under \`/employees\`.
`,
  starter: `#%RAML 1.0
title: Payroll Mobile Experience API
mediaType: application/json

types:
  Payslip:
    type: object
    properties:
      payslipId: string
      employeeId: string
      payDate: date-only
      taxCode: string
      nationalInsuranceNumber: string
      bankAccountNumber: string
      netPay: number

/employees/{employeeId}/payslips:
  get:
    responses:
      200:
        body:
          type: Payslip[]
`,
  ramlChecks: [
    {
      label: 'The title, HTTPS only and JSON',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Payroll Mobile Experience API' },
          { type: 'root', key: 'protocols', want: { exactly: ['HTTPS'] } },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    {
      label: 'PayslipSummary holds payslipId, payDate and netPay',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'PayslipSummary', prop: 'payslipId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'PayslipSummary', prop: 'payDate', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'PayslipSummary', prop: 'netPay', want: { type: 'Money', required: true } },
        ],
      },
    },
    {
      label: 'No tax code, national insurance number or account number reaches the phone',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'PayslipDetail' },
          { type: 'noProp', typeName: 'PayslipDetail', prop: 'taxCode' },
          { type: 'noProp', typeName: 'PayslipDetail', prop: 'nationalInsuranceNumber' },
          { type: 'noProp', typeName: 'PayslipDetail', prop: 'bankAccountNumber' },
        ],
      },
    },
    {
      label: 'PayslipDetail inherits from PayslipSummary and adds grossPay and deductions',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'PayslipDetail', extends: 'PayslipSummary' },
          { type: 'prop', typeName: 'PayslipDetail', prop: 'grossPay', want: { type: 'Money', required: true } },
          { type: 'prop', typeName: 'PayslipDetail', prop: 'deductions', want: { type: 'PayslipLine[]', required: true } },
        ],
      },
    },
    {
      label: 'GET /me/payslips returns PayslipSummary[] with an optional year from 2015',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/me/payslips', method: 'get', status: '200', typeIs: 'PayslipSummary[]' },
          { type: 'param', path: '/me/payslips', method: 'get', in: 'query', name: 'year', want: { type: 'integer', required: false, minimum: 2015 } },
        ],
      },
    },
    {
      label: 'GET one payslip returns JSON or a PDF from the same URL, or an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/me/payslips/{}', method: 'get', status: '200', media: 'application/json', typeIs: 'PayslipDetail' },
          { type: 'response', path: '/me/payslips/{}', method: 'get', status: '200', media: 'application/pdf', typeIs: 'file' },
          { type: 'response', path: '/me/payslips/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'BankDetails shows only a masked account number',
      rule: {
        type: 'all',
        rules: [
          { type: 'noProp', typeName: 'BankDetails', prop: 'accountNumber' },
          { type: 'prop', typeName: 'BankDetails', prop: 'accountNumberMasked', want: { type: 'string', required: true, pattern: { accepts: ['****5678', '****0001'], rejects: ['12345678', '5678', '***5678', '****56789'] } } },
        ],
      },
    },
    {
      label: 'BankDetailsChange has a six digit sortCode and an eight digit accountNumber',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'BankDetailsChange', prop: 'sortCode', want: { required: true, pattern: { accepts: ['204188'], rejects: ['20-41-88', '20418', '2041888'] } } },
          { type: 'prop', typeName: 'BankDetailsChange', prop: 'accountNumber', want: { required: true, pattern: { accepts: ['12345678'], rejects: ['1234567', '123456789', '1234567A'] } } },
        ],
      },
    },
    {
      label: 'GET and PUT /me/bank-details work as described, with no delete',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/me/bank-details', method: 'get', status: '200', typeIs: 'BankDetails' },
          { type: 'body', path: '/me/bank-details', method: 'put', typeIs: 'BankDetailsChange' },
          { type: 'response', path: '/me/bank-details', method: 'put', status: '200', typeIs: 'BankDetails' },
          { type: 'response', path: '/me/bank-details', method: 'put', status: '422', typeIs: 'Error' },
          { type: 'noMethod', path: '/me/bank-details', method: 'delete' },
        ],
      },
    },
    {
      label: 'mobileClient requires X-App-Version and adds a 426',
      rule: {
        type: 'all',
        rules: [
          { type: 'trait', name: 'mobileClient', has: 'responses.426' },
          { type: 'param', path: '/me/bank-details', method: 'put', in: 'header', name: 'X-App-Version', want: { required: true, pattern: { accepts: ['3.14.2', '10.0.0'], rejects: ['3.14', '3.14.2-beta', 'v3.14.2', '3.x.2'] } } },
          { type: 'response', path: '/me/bank-details', method: 'put', status: '426', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'All four methods use mobileClient',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/me/payslips', method: 'get', trait: 'mobileClient' },
          { type: 'applied', path: '/me/payslips/{}', method: 'get', trait: 'mobileClient' },
          { type: 'applied', path: '/me/bank-details', method: 'get', trait: 'mobileClient' },
          { type: 'applied', path: '/me/bank-details', method: 'put', trait: 'mobileClient' },
        ],
      },
    },
    {
      label: 'oauth2 uses authorization_code with an authorizationUri',
      rule: { type: 'scheme', name: 'oauth2', schemeType: 'OAuth 2.0', has: ['settings.authorizationUri'], values: { 'settings.authorizationGrants': { oneOf: ['authorization_code'], not: 'client_credentials' } } },
    },
    {
      label: 'Each method needs exactly its own scope',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/me/payslips', method: 'get', scheme: 'oauth2', scopes: ['payslips:read'], onlyScopes: true, required: true },
          { type: 'secured', path: '/me/payslips/{}', method: 'get', scheme: 'oauth2', scopes: ['payslips:read'], onlyScopes: true, required: true },
          { type: 'secured', path: '/me/bank-details', method: 'get', scheme: 'oauth2', scopes: ['bank:read'], onlyScopes: true, required: true },
          { type: 'secured', path: '/me/bank-details', method: 'put', scheme: 'oauth2', scopes: ['bank:write'], onlyScopes: true, required: true },
        ],
      },
    },
    { label: 'Nobody can ask for another employee', rule: { type: 'all', rules: [{ type: 'resource', path: '/me/payslips' }, { type: 'noResource', path: '/employees/{}/payslips' }, { type: 'noResource', path: '/employees' }, { type: 'noResource', path: '/employees/{}' }] } },
  ],
  referenceRaml: `#%RAML 1.0
title: Payroll Mobile Experience API
version: v1
baseUri: https://api.example.com/payroll-mobile/{version}
protocols: [ HTTPS ]
mediaType: application/json

types:
  Money:
    type: object
    properties:
      amount: number
      currency:
        type: string
        pattern: ^[A-Z]{3}$
  PayslipLine:
    type: object
    properties:
      label: string
      amount: number
  PayslipSummary:
    type: object
    properties:
      payslipId: string
      payDate: date-only
      periodLabel: string
      netPay: Money
  PayslipDetail:
    type: PayslipSummary
    properties:
      grossPay: Money
      earnings: PayslipLine[]
      deductions: PayslipLine[]
    example:
      payslipId: PS-2026-04-118204
      payDate: 2026-04-24
      periodLabel: Period 4, 2026
      netPay:
        amount: 1684.12
        currency: GBP
      grossPay:
        amount: 2150.00
        currency: GBP
      earnings:
        - label: Basic pay
          amount: 1980.00
        - label: Sunday premium
          amount: 170.00
      deductions:
        - label: Income tax
          amount: 255.60
        - label: Pension
          amount: 107.50
        - label: National insurance
          amount: 102.78
  BankDetails:
    type: object
    properties:
      accountHolder: string
      accountNumberMasked:
        type: string
        pattern: ^[*]{4}[0-9]{4}$
    example:
      accountHolder: J Mensah
      accountNumberMasked: '****5678'
  BankDetailsChange:
    type: object
    properties:
      accountHolder: string
      sortCode:
        type: string
        pattern: ^[0-9]{6}$
      accountNumber:
        type: string
        pattern: ^[0-9]{8}$
  Error:
    type: object
    properties:
      code: string
      message: string

securitySchemes:
  oauth2:
    type: OAuth 2.0
    describedBy:
      headers:
        Authorization:
          type: string
      responses:
        401:
          description: The token is missing or expired. Sign in again.
    settings:
      authorizationUri: https://login.example.com/authorize
      accessTokenUri: https://login.example.com/token
      authorizationGrants: [ authorization_code ]
      scopes: [ payslips:read, bank:read, bank:write ]

traits:
  mobileClient:
    headers:
      X-App-Version:
        type: string
        pattern: ^[0-9]+[.][0-9]+[.][0-9]+$
    responses:
      426:
        description: This app version is too old. Update the app.
        body:
          type: Error

/me:
  /payslips:
    get:
      is: [ mobileClient ]
      securedBy: [ oauth2: { scopes: [ payslips:read ] } ]
      queryParameters:
        year?:
          type: integer
          minimum: 2015
      responses:
        200:
          body:
            type: PayslipSummary[]
    /{payslipId}:
      get:
        is: [ mobileClient ]
        securedBy: [ oauth2: { scopes: [ payslips:read ] } ]
        responses:
          200:
            body:
              application/json:
                type: PayslipDetail
              application/pdf:
                type: file
          404:
            body:
              type: Error
  /bank-details:
    is: [ mobileClient ]
    get:
      securedBy: [ oauth2: { scopes: [ bank:read ] } ]
      responses:
        200:
          body:
            type: BankDetails
    put:
      securedBy: [ oauth2: { scopes: [ bank:write ] } ]
      body:
        type: BankDetailsChange
      responses:
        200:
          body:
            type: BankDetails
        422:
          description: The bank says this account does not exist.
          body:
            type: Error
`,
  keyPoints: [
    'An Experience API for an app serves the signed-in user through /me. The token says who, so no id in the path can be swapped for another.',
    'Small types for small screens: the list type holds four fields, and the detail type inherits it and adds lines.',
    'One URL can serve JSON and PDF. The Accept header picks the body, and the contract lists both.',
    'A separate bank:write scope lets the identity provider ask for a fresh sign-in before the riskiest change.',
    '426 Upgrade Required lets the API retire old app versions with a clear message.',
  ],
  solution: `
The draft took the System API's shape, and with it every risk. Rebuilding it for the phone changes four things.

**Who.** The app only ever shows the signed-in employee, so every path starts with \`/me\`. With \`/employees/{employeeId}\`, a curious employee could change the id and try a colleague's payslips. With \`/me\`, the Mule app reads the employee id from the token and there is nothing to change.

**What.** \`PayslipSummary\` is what the list draws. \`PayslipDetail\` inherits it and adds the lines, so the shared fields are declared once. Tax codes, national insurance numbers and account numbers stay in the System API.

**How.** The same payslip URL returns JSON for the screen or a PDF to save, chosen by the \`Accept\` header. \`year\` keeps the list short, which matters on payday when 20,000 people open it at once.

**Trust.** People sign in, so the grant is \`authorization_code\`. Each method asks for only its own scope. \`bank:write\` is separate because changing where pay goes is the attack fraudsters try, and the identity provider can demand a second factor for that scope alone. The response echoes only \`accountNumberMasked\`, so a stolen phone screen shows nothing useful. \`mobileClient\` adds \`X-App-Version\` and a 426, so the group can switch off an app version with a security flaw.
`,
  followUps: [
    {
      q: 'Where does the Experience API get the employee id, and how does it reach the System API?',
      a: 'From a claim in the validated access token, such as the subject. The Experience API passes it to the System API as a parameter, and the System API trusts only calls from known internal clients.',
    },
    {
      q: 'Why not let the app call the payroll System API directly with a filter?',
      a: 'The phone would receive 60 fields it does not need, including sensitive ones. Every app version would also depend on the System API shape, so changing it would break phones that never update.',
    },
    {
      q: 'How would you make payday morning fast?',
      a: 'Cache each employee payslip list for a few minutes after the payroll run, since it does not change that day. Scale the Experience API replicas on CloudHub 2.0 ahead of the known peak.',
    },
    {
      q: 'What else would you add to the bank details change?',
      a: 'Send a notice to the employee by a second channel, such as email, when the account changes. Hold the first payment to a new account for review if other risk signals fire.',
    },
  ],
}
