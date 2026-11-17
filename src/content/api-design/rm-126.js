export default {
  id: 'rm-126',
  category: 'api-design',
  title: 'Library Newsletter API: A Form-Encoded POST from an HTML Form',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'request-body', 'media-types', 'x-www-form-urlencoded', 'public-sector'],
  estMinutes: 15,
  description: `
Wrenfield Libraries has a sign-up form for its monthly newsletter on every branch web page. The page is plain HTML with no JavaScript, so the browser sends the form as \`application/x-www-form-urlencoded\`, not JSON. The answer goes back as JSON to a small script on the thank-you page.

In RAML, a method can name the media type of its body as a key under \`body\`. That media type then wins over the default \`mediaType\` for that one body:

\`\`\`yaml
body:
  application/x-www-form-urlencoded:
    type: SignUpForm
\`\`\`

**Requirements**
- Title \`Library Newsletter API\`, with JSON as the default media type.
- A type \`SignUpForm\` with:
  - \`email\`: a required string with a pattern that needs one \`@\`, some text before it, and a dot in the part after it, such as \`ana@example.com\`. No spaces.
  - \`firstName\`: an optional string of at most 40 characters.
  - \`consent\`: a required boolean.
- A type \`Subscription\` with a required string \`subscriptionId\`, a required string \`email\`, and a required \`status\` that is one of \`PENDING\`, \`ACTIVE\`.
- \`POST /subscriptions\` takes a \`SignUpForm\` as \`application/x-www-form-urlencoded\`, and returns a \`Subscription\` with 201, or 400 when the form does not fit.
`,
  starter: `#%RAML 1.0
title: Library Newsletter API
mediaType: application/json

types:
  SignUpForm:
    type: object
    properties:
      email: string

/subscriptions:
  post:
    body:
      type: SignUpForm
`,
  ramlChecks: [
    {
      label: 'The title is Library Newsletter API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Library Newsletter API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'email is a required string that looks like an email address',
      rule: {
        type: 'prop',
        typeName: 'SignUpForm',
        prop: 'email',
        want: {
          type: 'string',
          required: true,
          pattern: { accepts: ['ana@example.com', 'j.smith@wrenfield.org.uk'], rejects: ['ana.example.com', 'ana@example', '@example.com', 'ana @example.com', 'ana@exa@mple.com'] },
        },
      },
    },
    { label: 'firstName is an optional string of at most 40 characters', rule: { type: 'prop', typeName: 'SignUpForm', prop: 'firstName', want: { type: 'string', required: false, maxLength: 40 } } },
    { label: 'consent is a required boolean', rule: { type: 'prop', typeName: 'SignUpForm', prop: 'consent', want: { type: 'boolean', required: true } } },
    {
      label: 'Subscription has subscriptionId, email and a status of PENDING or ACTIVE',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Subscription', prop: 'subscriptionId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Subscription', prop: 'email', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Subscription', prop: 'status', want: { required: true, enum: { exactly: ['PENDING', 'ACTIVE'] } } },
        ],
      },
    },
    {
      label: 'POST /subscriptions takes a SignUpForm as a form-encoded body',
      rule: { type: 'body', path: '/subscriptions', method: 'post', media: 'application/x-www-form-urlencoded', typeIs: 'SignUpForm' },
    },
    {
      label: 'POST /subscriptions returns a Subscription with 201, or 400',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/subscriptions', method: 'post', status: '201', typeIs: 'Subscription' },
          { type: 'response', path: '/subscriptions', method: 'post', status: '400' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Library Newsletter API
mediaType: application/json

types:
  SignUpForm:
    type: object
    properties:
      email:
        type: string
        pattern: ^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$
      firstName?:
        type: string
        maxLength: 40
      consent: boolean
  Subscription:
    type: object
    properties:
      subscriptionId: string
      email: string
      status:
        type: string
        enum: [ PENDING, ACTIVE ]
    example:
      subscriptionId: NL-40917
      email: ana@example.com
      status: PENDING

/subscriptions:
  post:
    description: Sign up from the HTML form on a branch page.
    body:
      application/x-www-form-urlencoded:
        type: SignUpForm
    responses:
      201:
        description: The sign-up is saved. A confirmation email is on its way.
        body:
          type: Subscription
      400:
        description: The form does not fit, for example the email has no @.
`,
  keyPoints: [
    'An HTML form with no script sends application/x-www-form-urlencoded, not JSON.',
    'A media type written as a key under body applies to that body only and wins over the default mediaType.',
    'A form body still has a type with properties, required fields and facets.',
    'Responses with no media type key use the default, here JSON.',
    'A pattern needs ^ and $ so the whole value is checked, not only part of it.',
  ],
  solution: `
**Two media types in one call.** The request comes from a plain form, so it is \`application/x-www-form-urlencoded\`. The response goes to a script, so JSON suits it. Writing the media type as a key under \`body\` sets the request type for this one method. The 201 response has no key, so it uses the default \`mediaType: application/json\`.

**The form type.** Form fields arrive as text, but RAML still describes what each field must hold. \`consent: boolean\` means the form must send \`true\` or \`false\`. \`firstName?\` is optional, and \`maxLength: 40\` stops a very long name.

**The email pattern.** \`^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$\` reads as: some characters that are not \`@\` or a space, one \`@\`, more of the same, a dot, and more again. It is a shape check only. The confirmation email proves that the address works.

**Why 201.** A new subscription is created, in the \`PENDING\` state until the reader clicks the link in the email.
`,
  followUps: [
    {
      q: 'Why not change the form to send JSON?',
      a: 'A plain HTML form cannot send JSON without a script. Many branch pages run on an old content system, and a form that works without JavaScript also works for more readers.',
    },
    {
      q: 'Can the same method accept JSON as well?',
      a: 'Yes. Add a second key, application/json, under body with the same type. The app and the web form can then call the same endpoint.',
    },
    {
      q: 'How does Mule read a form-encoded body?',
      a: 'DataWeave reads application/x-www-form-urlencoded into an object of field names and text values, so the flow can map it like JSON. Values such as consent arrive as text and may need converting.',
    },
  ],
}
