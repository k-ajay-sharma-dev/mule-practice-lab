export default {
  id: 'ms-223',
  category: 'mulesoft',
  title: 'Validation Module: Single Checks, the All Scope and Turning Failures into a 400',
  level: 'INTERMEDIATE',
  tags: ['validation', 'validation-module', 'error-handling', 'regex', 'http', 'logistics'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A flow runs three validators in a row: is-not-null on the parcel id, matches-regex on the postcode, and is-email on the contact. The parcel id check fails. What happens?',
      options: [
        'All three run, and one error lists every failure',
        'The flow logs a warning and goes on to the next check',
        'The first check raises an error, and the other two do not run',
        'The payload is set to null, and the other two checks run',
      ],
      answer: 2,
      explain: 'Each validator raises an error as soon as its check fails. Like any error, it stops the flow at that point, and the error handler takes over.',
    },
    {
      type: 'single',
      prompt: 'The courier app wants every problem with a booking in one reply. What fits?',
      options: [
        'Wrap the validators in a validation:all scope',
        'Put each validator in its own Try scope with On Error Propagate',
        'Wrap all the validators in one Try scope with On Error Continue',
        'Give each validator its own Try with On Error Continue, and keep the last error',
      ],
      answer: 0,
      explain: 'The All scope runs every validator inside it and raises one error that reports all the failures together.',
    },
    {
      type: 'single',
      prompt: 'A UK postcode must look like `LS1 4AP` or `M60 1QD`. The flow checks it with is-not-blank-string, and a booking with the postcode `12345` goes through. What should the flow use?',
      options: [
        'validate-size with `min="6"` and `max="8"` on the postcode',
        'is-not-blank-string with `message="Enter a valid postcode"`',
        'matches-regex with a pattern for the UK postcode format',
        'is-not-null and is-not-blank-string together in an All scope',
      ],
      answer: 2,
      explain: 'Only matches-regex checks the shape of the value against a regular expression. validate-size checks the length, so `ABCDEFG` would still pass. A clearer message or a second presence check does not reject `12345`, which is present and not blank.',
    },
    {
      type: 'single',
      prompt: 'The weight must be above 0 and at most 30 kg. What is a clear way to check it?',
      options: [
        'validate-size with `min="1"` and `max="30"` on `payload.weightKg`',
        'matches-regex with `#[payload.weightKg]` and the regex `^[0-9]{1,2}$`',
        'is-not-null with `#[payload.weightKg > 0 and payload.weightKg <= 30]`',
        'is-true with `#[payload.weightKg > 0 and payload.weightKg <= 30]`',
      ],
      answer: 3,
      explain: 'is-true takes any DataWeave condition. Give it a message such as "Weight must be above 0 and at most 30 kg" so the caller knows what to fix.',
    },
    {
      type: 'multi',
      prompt: 'An error handler must turn validation failures into a 400. Which are good parts of that handler?',
      options: [
        'Match only validation errors, for example with `when="#[error.errorType.namespace == \'VALIDATION\']"`',
        'Return a body built from `error.description`, which holds the validator messages',
        'Read the validator messages from `error.errorMessage.payload`, where the module puts them',
        'Set the status the listener sends to 400',
        'Match `type="VALIDATION:MULTIPLE"`, the error type that each validator raises',
      ],
      answer: [0, 1, 3],
      explain: 'Validation errors are the caller\'s fault, so they get a 400 with the messages from `error.description`. Each validator raises its own type, such as `VALIDATION:BLANK_STRING`, and `VALIDATION:MULTIPLE` comes only from an All scope, so match on the namespace. The module does not put the messages in `error.errorMessage.payload`. Other errors, such as a database outage, are not the caller\'s fault and should keep their own status.',
    },
    {
      type: 'match',
      prompt: 'Match each rule to the check that fits it.',
      pairs: [
        ['The contact email looks like an email', 'is-email'],
        ['The reference is 6 to 12 characters long', 'validate-size'],
        ['The delivery date is not in the past', 'is-true with a DataWeave condition'],
      ],
      explain: 'Use the specific validator when one exists, and is-true for rules that compare values or dates.',
    },
  ],
  description: `
Swiftlane Couriers takes parcel bookings from shops through a Process API. Bad bookings reach the depot every day: postcodes in the wrong format, weights of 0 kg, and contact emails with no @ sign.

The API has a JSON Schema in its spec, which checks the shape of the body. The team now wants rules the schema does not hold well, such as "the delivery date is not in the past", and clear messages for the shops.

The first version had two problems. A shop that sent three mistakes had to fix them one call at a time. And every validation failure came back as a 500.

**Questions**
1. How does a single validator behave when its check fails?
2. How do you report every problem in one reply?
3. Which checks fit which validator?
4. How do you turn validation failures into a 400 with useful messages, without hiding real server errors?
`,
  answerTemplate: `## One validator

## Every problem at once

## Which check for which rule

## A 400 with messages
`,
  keyPoints: [
    'A validator raises an error as soon as its check fails, and the flow stops there.',
    'The validation:all scope runs every validator inside it and raises one error that lists all failures.',
    'Use the specific validators, such as is-email, matches-regex and validate-size, where they fit.',
    'is-true takes any DataWeave condition, which suits rules that compare values or dates.',
    'Give each validator a clear message, because that is what the caller reads.',
    'Map validation errors to 400 and leave other errors with their own status.',
  ],
  solution: `
**1. One validator.** A validator checks one thing. If the check passes, nothing changes and the flow goes on. If it fails, it raises an error in the \`VALIDATION\` namespace with the message you gave it, and the error handler takes over. Later validators do not run.

**2. Every problem at once.** Put the validators in a \`validation:all\` scope. It runs each one, collects the failures, and raises one error whose description lists them all. A shop with three mistakes now sees three messages in one reply.

**3. Which check for which rule.**
| Rule | Check |
|---|---|
| Parcel id is present | is-not-null |
| Postcode format | matches-regex |
| Reference length | validate-size |
| Contact email | is-email |
| Weight above 0 and up to 30 kg | is-true with a condition |
| Delivery date not in the past | is-true with a condition |

The JSON Schema still checks the shape first. The validators add the rules a schema cannot say well.

**4. A 400 with messages.** In the error handler, add an On Error Continue that matches validation errors only, for example with \`when="#[error.errorType.namespace == 'VALIDATION']"\`. It sets the status to 400 and builds a body from \`error.description\`. Every other error falls through to the handlers below it and keeps its own status, so a database outage still shows as a 5xx and the monitors see it.
`,
  followUps: [
    {
      q: 'When would you use a JSON Schema instead of validators?',
      a: 'Use the schema for structure: required fields, types, lengths and enums. It lives in the spec, so clients see it too. Use validators for rules that need logic or data, such as comparing two fields or checking a date against today.',
    },
    {
      q: 'Can a validator check something in a database, such as a known shop id?',
      a: 'Not on its own. Look the shop up first, keep the result in a variable, and then use is-true or is-not-null on that variable. Return 400 or 404 for an unknown shop, depending on the API design.',
    },
    {
      q: 'How would you return the failures as a list instead of one long text?',
      a: 'Run the checks in DataWeave instead, building a list with one entry per failed rule. If the list is not empty, keep it in a variable and raise one error with Raise Error. The error handler then returns that list as the body.',
    },
  ],
}
