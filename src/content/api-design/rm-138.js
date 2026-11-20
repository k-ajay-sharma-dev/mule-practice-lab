export default {
  id: 'rm-138',
  category: 'api-design',
  title: 'Supplier Onboarding API: A 400 That Lists Every Field Error',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'validation', 'errors', 'field-errors', 'examples', 'status-codes', 'procurement'],
  estMinutes: 20,
  description: `
Oakmere Hospital Trust signs up new suppliers through a web form. The form posts to a Supplier Onboarding API. Today a bad request gets \`400\` with the text "Invalid request". Suppliers fix one field, try again, hit the next problem, and give up.

The new contract returns **every** problem in one response, as a list of field errors. The form can then mark each field in red at once.

**Requirements**
- Title \`Supplier Onboarding API\`, with JSON as the default media type.
- A type \`Supplier\` with:
  - \`companyName\`: a required string of at most 100 characters.
  - \`companyNumber\`: required, two capital letters and eight digits, such as \`SC01234567\`.
  - \`contactEmail\`: a required string.
- A type \`FieldError\` with:
  - \`field\`: a required string, the name of the field.
  - \`code\`: required, one of \`REQUIRED\`, \`TOO_LONG\`, \`BAD_FORMAT\`.
  - \`message\`: a required string for people.
- A type \`ValidationProblem\` with a required string \`message\` and a required \`errors\` list of \`FieldError\` with at least one item.
- \`POST /suppliers\` takes a \`Supplier\` and returns:
  - 201 with a \`Location\` header,
  - 400 with a \`ValidationProblem\`, and the 400 response has its **own example** with two field errors.
`,
  starter: `#%RAML 1.0
title: Supplier Onboarding API
mediaType: application/json

types:
  Supplier:
    type: object
    properties:
      companyName: string
      companyNumber: string
      contactEmail: string

/suppliers:
  post:
    body:
      type: Supplier
    responses:
      201:
      400:
        body:
          type: string
          example: Invalid request
`,
  ramlChecks: [
    {
      label: 'The title is Supplier Onboarding API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Supplier Onboarding API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'Supplier has companyName of at most 100 characters and a companyNumber of two letters and eight digits',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Supplier', prop: 'companyName', want: { type: 'string', required: true, maxLength: 100 } },
          { type: 'prop', typeName: 'Supplier', prop: 'companyNumber', want: { required: true, pattern: { accepts: ['SC01234567', 'NI99887766'], rejects: ['SC0123456', 'sc01234567', 'S01234567', 'SC012345678', '1234567890'] } } },
          { type: 'prop', typeName: 'Supplier', prop: 'contactEmail', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'FieldError has field, a code of REQUIRED, TOO_LONG or BAD_FORMAT, and message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'FieldError', prop: 'field', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'FieldError', prop: 'code', want: { required: true, enum: { exactly: ['REQUIRED', 'TOO_LONG', 'BAD_FORMAT'] } } },
          { type: 'prop', typeName: 'FieldError', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'ValidationProblem has a message and at least one FieldError in errors',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ValidationProblem', prop: 'message', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'ValidationProblem', prop: 'errors', want: { type: 'FieldError[]', required: true, minItems: 1 } },
        ],
      },
    },
    {
      label: 'POST /suppliers takes a Supplier and returns 201 with Location',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/suppliers', method: 'post', typeIs: 'Supplier' },
          { type: 'response', path: '/suppliers', method: 'post', status: '201', header: 'Location' },
        ],
      },
    },
    {
      label: 'The 400 response returns a ValidationProblem with its own example',
      rule: { type: 'response', path: '/suppliers', method: 'post', status: '400', typeIs: 'ValidationProblem', example: 'own' },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Supplier Onboarding API
version: v1
baseUri: https://api.example.com/suppliers/{version}
mediaType: application/json

types:
  Supplier:
    type: object
    properties:
      companyName:
        type: string
        maxLength: 100
      companyNumber:
        type: string
        pattern: ^[A-Z]{2}[0-9]{8}$
      contactEmail: string
    example:
      companyName: Linden Medical Supplies
      companyNumber: SC01234567
      contactEmail: orders@linden.example.com
  FieldError:
    type: object
    properties:
      field:
        type: string
        description: The name of the field, as sent in the request.
      code:
        type: string
        enum: [ REQUIRED, TOO_LONG, BAD_FORMAT ]
        description: A fixed code the form can act on.
      message:
        type: string
        description: Text for people. It may change, so clients must not match on it.
  ValidationProblem:
    type: object
    properties:
      message: string
      errors:
        type: FieldError[]
        minItems: 1

/suppliers:
  post:
    body:
      type: Supplier
    responses:
      201:
        headers:
          Location:
            type: string
            example: /suppliers/SUP-30218
      400:
        description: The request broke one or more field rules. Every broken rule is listed.
        body:
          type: ValidationProblem
          example:
            message: 2 fields need attention.
            errors:
              - field: companyNumber
                code: BAD_FORMAT
                message: Use two capital letters and eight digits, such as SC01234567.
              - field: contactEmail
                code: REQUIRED
                message: Enter an email address for orders.
`,
  keyPoints: [
    'Return every field problem in one response, so the caller can fix them all at once.',
    'Each field error names the field, gives a fixed code, and a message for people.',
    'Clients act on the code. The message text may change.',
    'minItems: 1 says a validation problem always lists at least one error.',
    'An example on the 400 response shows client developers what to expect.',
  ],
  solution: `
**One response, every problem.** The API checks every rule before it answers. A supplier with a wrong company number and no email gets both errors in one \`400\`, and the form marks both fields.

**The shape of a field error.**
| Field | Purpose |
|---|---|
| \`field\` | Which input to mark in red |
| \`code\` | A fixed value the form can act on, such as showing a hint for \`BAD_FORMAT\` |
| \`message\` | Text a person can read |

Fixed codes matter because the message text may be changed or translated. A form that matches on the text breaks the day someone fixes a typo.

**At least one error.** \`minItems: 1\` on \`errors\` says a \`ValidationProblem\` is never empty. A 400 with an empty list would tell the client nothing.

**The example.** The 400 response carries its own example with two errors. API Designer shows it in the docs and the mocking service returns it, so the form team can build the error display before the API exists.
`,
  followUps: [
    {
      q: 'Some rules span two fields, such as "a VAT number is required for suppliers outside the UK". What goes in field?',
      a: 'Name the field the user must change, here the VAT number. For rules about the whole request, some teams use a fixed field value such as \`request\`, because \`field\` is a required string here and cannot be null.',
    },
    {
      q: 'Should a company number that already exists also be a field error in this 400?',
      a: 'No. The request is well formed, but it clashes with existing data. Answer 409 Conflict, so the form can say the company is already registered.',
    },
    {
      q: 'APIkit already rejects requests that break the RAML types. Does the app still need its own checks?',
      a: 'APIkit checks the types and facets in the contract and raises one APIKIT:BAD_REQUEST error with a text description. To give this field list, run your own field checks and build the ValidationProblem from them, including rules that RAML cannot express.',
    },
  ],
}
