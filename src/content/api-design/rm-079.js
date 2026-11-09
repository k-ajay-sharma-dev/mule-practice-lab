export default {
  id: 'rm-079',
  category: 'api-design',
  title: 'Outage Alerts API: A List Whose Items Are a Union Type',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'data-types', 'union-types', 'arrays', 'utilities'],
  estMinutes: 20,
  description: `
A water company serves 410,000 homes. When a main bursts, it alerts the homes in the area. Each customer picks up to five ways to be told: an email address, a mobile number for SMS, or a landline for a voice call. One customer may pick an email and two mobiles.

A **union type** says a value is one of several types, written \`EmailChannel | SmsChannel\`. You can give the union a name and then use a list of it, such as \`Channel[]\`. Each item in the list may then be a different kind.

**Requirements**
- Title \`Outage Alerts API\`, with JSON as the default media type.
- \`EmailChannel\` with a required string \`email\`.
- \`SmsChannel\` with a required string \`mobile\` in international format, with the pattern \`^\\+[1-9][0-9]{7,14}$\`.
- \`VoiceChannel\` with a required string \`landline\`.
- \`Channel\`, a union of the three channel types.
- \`AlertPreferences\` with a required string \`customerId\`, a required list \`channels\` of \`Channel\` with 1 to 5 items, and an optional time-only \`quietHoursStart\`. Give it an example with an email and an SMS channel.
- \`GET /customers/{customerId}/alert-preferences\` returns \`AlertPreferences\`, or 404.
- \`PUT /customers/{customerId}/alert-preferences\` takes \`AlertPreferences\`, returns it with 200, and returns 400 for a list that is empty or too long.
`,
  starter: `#%RAML 1.0
title: Outage Alerts API
mediaType: application/json

types:
  AlertPreferences:
    type: object
    properties:
      customerId: string
      email?: string
      mobile?: string
      landline?: string

/customers:
  /{customerId}:
    /alert-preferences:
`,
  ramlChecks: [
    {
      label: 'EmailChannel, SmsChannel and VoiceChannel each have their required field',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'EmailChannel', prop: 'email', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'SmsChannel', prop: 'mobile', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'VoiceChannel', prop: 'landline', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'SmsChannel.mobile only accepts international numbers',
      rule: { type: 'prop', typeName: 'SmsChannel', prop: 'mobile', want: { pattern: { accepts: ['+447700900123', '+14155550100'], rejects: ['07700900123', '+0447700900', '+44'] } } },
    },
    { label: 'Channel is a union of EmailChannel, SmsChannel and VoiceChannel', rule: { type: 'typeDecl', name: 'Channel', want: { type: ['EmailChannel', 'SmsChannel', 'VoiceChannel', '|'] } } },
    {
      label: 'AlertPreferences.channels is a required list of Channel with 1 to 5 items',
      rule: { type: 'prop', typeName: 'AlertPreferences', prop: 'channels', want: { type: 'Channel[]', required: true, minItems: 1, maxItems: 5 } },
    },
    {
      label: 'The old single email, mobile and landline fields are gone from AlertPreferences',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Channel' },
          { type: 'noProp', typeName: 'AlertPreferences', prop: 'email' },
          { type: 'noProp', typeName: 'AlertPreferences', prop: 'mobile' },
          { type: 'noProp', typeName: 'AlertPreferences', prop: 'landline' },
        ],
      },
    },
    { label: 'AlertPreferences.quietHoursStart is an optional time-only', rule: { type: 'prop', typeName: 'AlertPreferences', prop: 'quietHoursStart', want: { type: 'time-only', required: false } } },
    {
      label: 'AlertPreferences has an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'AlertPreferences', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'AlertPreferences', want: { examples: { set: true } } },
        ],
      },
    },
    {
      label: 'GET alert-preferences returns AlertPreferences, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/customers/{}/alert-preferences', method: 'get', status: '200', typeIs: 'AlertPreferences' },
          { type: 'response', path: '/customers/{}/alert-preferences', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'PUT alert-preferences takes and returns AlertPreferences, and returns 400',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/customers/{}/alert-preferences', method: 'put', typeIs: 'AlertPreferences' },
          { type: 'response', path: '/customers/{}/alert-preferences', method: 'put', status: '200', typeIs: 'AlertPreferences' },
          { type: 'response', path: '/customers/{}/alert-preferences', method: 'put', status: '400' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Outage Alerts API
mediaType: application/json

types:
  EmailChannel:
    type: object
    properties:
      email: string
  SmsChannel:
    type: object
    properties:
      mobile:
        type: string
        pattern: ^\\+[1-9][0-9]{7,14}$
  VoiceChannel:
    type: object
    properties:
      landline: string
  Channel:
    type: EmailChannel | SmsChannel | VoiceChannel
  AlertPreferences:
    type: object
    properties:
      customerId: string
      channels:
        type: Channel[]
        minItems: 1
        maxItems: 5
      quietHoursStart?: time-only
    example:
      customerId: C-5520193
      channels:
        - email: j.morgan@example.com
        - mobile: "+447700900123"

/customers:
  /{customerId}:
    /alert-preferences:
      get:
        responses:
          200:
            body:
              type: AlertPreferences
          404:
            description: No customer has this id.
      put:
        body:
          type: AlertPreferences
        responses:
          200:
            body:
              type: AlertPreferences
          400:
            description: The list of channels is empty, has more than 5 items, or holds a channel that fits no type.
`,
  keyPoints: [
    'A union is written A | B | C and the value must fit at least one member.',
    'A named union such as Channel can be used like any other type, including Channel[].',
    'minItems and maxItems sit on the array, not on the items.',
    'A union of objects is told apart by which properties each item has.',
    'Quote a value such as "+447700900123" so YAML keeps it a string.',
  ],
  solution: `
The old type had one \`email\`, one \`mobile\` and one \`landline\`, so a customer could not add a second mobile. A list of \`Channel\` allows any mix, up to five.

\`Channel\` is a union, so each item must fit \`EmailChannel\`, \`SmsChannel\` or \`VoiceChannel\`. An item with only a \`fax\` field fits none and is rejected.

\`minItems: 1\` stops a customer from turning every alert off by mistake, which matters for a burst main. \`maxItems: 5\` keeps one outage from sending dozens of messages to one home.

The pattern on \`mobile\` needs the leading \`+\` and a country code, because the SMS gateway sends to many countries.
`,
  followUps: [
    {
      q: 'How does a reader know which kind of channel an item is?',
      a: 'It checks which property is present: email, mobile or landline. If the types overlapped, a discriminator property such as kind would be safer, because it names the type outright.',
    },
    {
      q: 'What is the difference between Channel[] and EmailChannel[] | SmsChannel[]?',
      a: 'Channel[] allows a mix in one list. EmailChannel[] | SmsChannel[] means the whole list is one kind, either all emails or all mobiles.',
    },
    {
      q: 'How would DataWeave send each channel to the right gateway?',
      a: 'Loop over channels and match on the fields of each item, such as item.email? or item.mobile?. Each match calls the email, SMS or voice service.',
    },
  ],
}
