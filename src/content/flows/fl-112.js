import { design, flow, handler, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-112',
  category: 'flows',
  title: 'New Employee API: Validate the Body and Reject Bad Requests with 400',
  level: 'BEGINNER',
  tags: ['validation', 'http-status', 'error-handling', 'on-error-propagate', 'database', 'hr'],
  estMinutes: 10,
  flowChecks: [
    {
      label: 'A Validate step checks that the email is present (is-not-null)',
      rule: { type: 'exists', component: 'validation', where: { check: 'is-not-null' } },
    },
    {
      label: 'A Validate step checks the email format (is-email)',
      rule: { type: 'exists', component: 'validation', where: { check: 'is-email' } },
    },
    {
      label: 'Validation happens before the Database Insert',
      rule: { type: 'before', first: 'validation', then: 'db-insert' },
    },
    {
      label: 'An On Error Propagate handles the VALIDATION errors',
      rule: { type: 'exists', component: 'on-error-propagate', where: { type: 'VALIDATION' } },
    },
    {
      label: 'The handler sets vars.httpStatus to 400',
      rule: { type: 'inside', component: 'set-variable', within: 'on-error-propagate', where: { variableName: 'httpStatus', value: '400' } },
    },
  ],
  referenceFlow: design(
    flow(
      'create-employee',
      source('http-listener', { path: '/employees', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'is-not-null', expression: '#[payload.email]', message: 'email is required' }),
        step('validation', { check: 'is-email', expression: '#[payload.email]', message: 'email is not a valid address' }),
        step('db-insert', { database: 'MySQL', sql: 'INSERT INTO employees (full_name, email) VALUES (:fullName, :email)' }),
        step('set-payload', { value: '#[output application/json --- { status: "CREATED" }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:NULL, VALIDATION:INVALID_EMAIL' }, [
          step('set-variable', { variableName: 'httpStatus', value: '400' }),
          step('set-payload', { value: '#[output application/json --- { code: "BAD_REQUEST", message: error.description }]' }),
        ]),
      ],
    ),
  ),
  description: `
An HR portal adds new staff with \`POST /employees\`. The JSON body looks like \`{ "fullName": "Asha Rao", "email": "asha@example.com" }\`.

Some requests arrive with no email, or with an address like \`asha.example.com\`. These rows reach the database, and the welcome emails bounce later. Bad requests must be stopped at the door.

The **Validate** component checks one rule. If the rule holds, nothing changes and the flow moves on. If it fails, it raises an error with the message you gave it.

**Requirements**
- Expose \`POST /employees\` with an HTTP Listener.
- Check that \`payload.email\` is present, with the message \`email is required\`.
- Check that it is a valid address, with the message \`email is not a valid address\`.
- Insert the employee only when both checks pass, then return \`{ "status": "CREATED" }\`.
- For a failed check, return HTTP status **400** with \`{ "code": "BAD_REQUEST", "message": "..." }\`, using the Validate message. 400 means the caller sent a bad request.

**How the status gets out:** the listener has an Error Response setting that is not shown on the canvas. Assume its status code is \`#[vars.httpStatus default 500]\` and its body is \`#[payload]\`. Your handler only needs to set the variable \`httpStatus\` and the payload.

**Design the flow.**
`,
  answerTemplate: `## The checks

## The normal path

## Which errors are handled

## What the caller sees
`,
  keyPoints: [
    'Validate steps go first, so bad data never reaches the database.',
    'Each Validate checks one rule and has its own message, so the caller knows what to fix.',
    'is-not-null raises VALIDATION:NULL and is-email raises VALIDATION:INVALID_EMAIL.',
    'error.description holds the message set on the Validate step.',
    'On Error Propagate keeps the request a failure, and 400 tells the caller the problem is in the request.',
  ],
  solution: `
1. **HTTP Listener**: \`POST /employees\`.
2. **Validate** \`is-not-null\` on \`#[payload.email]\`, message \`email is required\`.
3. **Validate** \`is-email\` on \`#[payload.email]\`, message \`email is not a valid address\`.
4. **Database Insert**: the new employee.
5. **Set Payload**: \`#[output application/json --- { status: "CREATED" }]\`.

**Error handling on the flow:** one **On Error Propagate** with type \`VALIDATION:NULL, VALIDATION:INVALID_EMAIL\`.
- **Set Variable** \`httpStatus\` to \`400\`.
- **Set Payload**: \`#[output application/json --- { code: "BAD_REQUEST", message: error.description }]\`.

When a check fails, Mule skips every step up to the end of the flow and runs the handler, so the Insert never happens. The flow ends as failed and the listener sends its Error Response with status 400.

All errors from the Validation module are children of \`VALIDATION:VALIDATION\`. You could use that one type in the handler and it would still catch both checks.

A database failure is not a \`VALIDATION\` error, so this handler does not touch it. It stays a server error and is not reported as the caller's mistake.
`,
  followUps: [
    {
      q: 'Why two Validate steps and not one?',
      a: 'Each step has one message. Two steps let the caller tell a missing email from a badly formed one.',
    },
    {
      q: 'The request has three bad fields. How many does the caller hear about?',
      a: 'Only the first, because the flow stops at the first failed Validate. The caller fixes it and may then hit the next one. Reporting every problem at once needs a different approach, such as a JSON schema check.',
    },
    {
      q: 'Why not On Error Continue for a bad request?',
      a: 'It would end the flow as a success, so the listener would send the normal response and the caller would see a success status for a rejected request.',
    },
  ],
}
