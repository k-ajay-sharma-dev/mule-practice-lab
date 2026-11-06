export default {
  id: 'rm-053',
  category: 'api-design',
  title: 'Flight Events Webhook: The Contract Your Partners Must Host',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'webhooks', 'headers', 'security', 'airline'],
  estMinutes: 35,
  description: `
An airline tells travel partners about delays and gate changes the moment they happen. Partners used to poll for this every minute. Now the airline will call them.

A **webhook** is an HTTP call that your system makes to someone else's endpoint when an event happens. So this contract is turned around. You still write RAML, but it describes an API that **partners build and host**, and your system is the caller.

Three things change:

- The host differs per partner, so \`baseUri\` has a parameter. Declare it under \`baseUriParameters\`.
- Anyone on the internet could call a partner's endpoint. A **signature** proves a call came from you: you hash the body with a shared secret, and the partner repeats the hash and compares.
- A call can be delivered twice, because you retry when you are not sure it arrived. A delivery id lets the partner ignore a repeat.

**The 2xx rule:** the airline treats any 2xx status as delivered and retries on anything else. RAML has no way to write a range of status codes. So list the ones partners may use, and state the rule in \`documentation\`, a list of items that each have a \`title\` and \`content\`.

**Requirements**
- Title \`Flight Events Webhook\`, with JSON as the default media type.
- \`baseUri\` is \`https://{partnerHost}/webhooks\`, with \`partnerHost\` declared under \`baseUriParameters\`.
- A \`documentation\` item that states the delivery rules.
- A type \`FlightEvent\` with these required properties:
  - a string \`eventId\`
  - \`eventType\`, one of \`DELAYED\`, \`CANCELLED\`, \`GATE_CHANGED\`
  - a string \`flightNumber\` with a pattern: 2 letters or digits, then 1 to 4 digits, such as \`BA117\`
  - \`occurredAt\`, a date and time with a time zone
- \`FlightEvent\` has an example that fits it.
- \`POST /flight-events\` takes a \`FlightEvent\`.
- It has a required string header \`X-Signature\`, with a pattern for \`sha256=\` and then 64 lower case hex characters.
- It has a required string header \`X-Delivery-Id\`.
- It returns 200, or 204 with no body, when the event was accepted.
- It returns 401 when the signature is wrong.
`,
  starter: `#%RAML 1.0
title: Flight Events Webhook
mediaType: application/json

types:

/flight-events:
`,
  ramlChecks: [
    { label: 'The host in baseUri is a parameter', rule: { type: 'root', key: 'baseUri', want: 'https://{partnerHost}/webhooks' } },
    { label: 'partnerHost is declared under baseUriParameters', rule: { type: 'root', key: 'baseUriParameters', has: 'partnerHost' } },
    { label: 'A documentation item is present for the delivery rules', rule: { type: 'root', key: 'documentation' } },
    { label: 'FlightEvent has a required eventId', rule: { type: 'prop', typeName: 'FlightEvent', prop: 'eventId', want: { type: 'string', required: true } } },
    { label: 'eventType allows the three event types only', rule: { type: 'prop', typeName: 'FlightEvent', prop: 'eventType', want: { required: true, enum: { exactly: ['DELAYED', 'CANCELLED', 'GATE_CHANGED'] } } } },
    {
      label: 'flightNumber has a pattern that fits real flight numbers',
      rule: { type: 'prop', typeName: 'FlightEvent', prop: 'flightNumber', want: { required: true, pattern: { accepts: ['BA117', 'U21234', 'LH9'], rejects: ['BA', 'BA12345', 'flight 117'] } } },
    },
    { label: 'occurredAt is a date and time with a time zone', rule: { type: 'prop', typeName: 'FlightEvent', prop: 'occurredAt', want: { type: 'datetime', required: true } } },
    { label: 'FlightEvent has an example', rule: { type: 'typeDecl', name: 'FlightEvent', want: { example: { set: true } } } },
    { label: 'POST /flight-events takes a FlightEvent', rule: { type: 'body', path: '/flight-events', method: 'post', typeIs: 'FlightEvent' } },
    {
      label: 'X-Signature is required, and its pattern fits sha256= with 64 hex characters',
      rule: {
        type: 'param',
        path: '/flight-events',
        method: 'post',
        in: 'header',
        name: 'X-Signature',
        want: {
          type: 'string',
          required: true,
          pattern: { accepts: [`sha256=${'ab12'.repeat(16)}`], rejects: ['sha256=abc', `md5=${'ab12'.repeat(16)}`, `sha256=${'AB12'.repeat(16)}`, `sha256=${'ab12'.repeat(17)}`] },
        },
      },
    },
    { label: 'X-Delivery-Id is required, so a repeat can be spotted', rule: { type: 'param', path: '/flight-events', method: 'post', in: 'header', name: 'X-Delivery-Id', want: { type: 'string', required: true } } },
    {
      label: 'A partner may answer 200, or 204 with no body',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/flight-events', method: 'post', status: '200' },
          { type: 'response', path: '/flight-events', method: 'post', status: '204', noBody: true },
        ],
      },
    },
    { label: 'A wrong signature gets a 401', rule: { type: 'response', path: '/flight-events', method: 'post', status: '401' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Flight Events Webhook
baseUri: https://{partnerHost}/webhooks
baseUriParameters:
  partnerHost:
    type: string
    description: The host name each partner gives during onboarding.
mediaType: application/json

documentation:
  - title: Delivery rules
    content: |
      Partners host this API, and the airline calls it.
      Any 2xx status counts as delivered. Anything else, or no answer in 5 seconds, is retried.
      A retry keeps the same X-Delivery-Id.

types:
  FlightEvent:
    type: object
    properties:
      eventId: string
      eventType:
        type: string
        enum: [ DELAYED, CANCELLED, GATE_CHANGED ]
      flightNumber:
        type: string
        pattern: '^[A-Z0-9]{2}[0-9]{1,4}$'
      occurredAt: datetime
    example:
      eventId: EV-90017
      eventType: GATE_CHANGED
      flightNumber: BA117
      occurredAt: 2026-03-14T09:30:00Z

/flight-events:
  post:
    headers:
      X-Signature:
        type: string
        pattern: '^sha256=[a-f0-9]{64}$'
      X-Delivery-Id:
        type: string
    body:
      type: FlightEvent
    responses:
      200:
        description: The event was accepted.
      204:
        description: The event was accepted, with nothing to say.
      401:
        description: The signature did not match.
`,
  keyPoints: [
    'A webhook contract describes an API your partners host, and you are the caller.',
    'baseUriParameters declares a variable part of the host, such as a partner name.',
    'A signature proves who sent the call, and the body has not changed on the way.',
    'A delivery id makes retries safe, because a partner can ignore a repeat.',
    'RAML has no status ranges, so list the codes and state the 2xx rule in documentation.',
  ],
  solution: `
This RAML is what you hand to partners. They can generate a mock or a Mule project from it, and test against it before your first event arrives.

The two headers do different jobs. \`X-Signature\` answers "did this really come from the airline?" and \`X-Delivery-Id\` answers "have I seen this already?".

The 401 is what makes the signature worth having. A partner that accepts a bad signature would let anyone fake a gate change. Since a 401 is not a 2xx, the airline will retry it, and a run of them in its logs is a sign that a shared secret is wrong.
`,
  followUps: [
    {
      q: 'Why should a partner answer quickly and do the work later?',
      a: 'The sender treats a slow reply as a failure and retries. A partner should store the event, answer 2xx at once, and process it from a queue.',
    },
    {
      q: 'How does a timestamp in the signature help?',
      a: 'Without one, an attacker who records a valid call can replay it later. If the signed content includes a timestamp, a partner can refuse anything older than a few minutes.',
    },
    {
      q: 'How do you change this contract once partners have built it?',
      a: 'You cannot deploy their side for them, so keep changes additive. Add optional fields, tell partners to ignore unknown ones, and send a new major version only to partners who opt in.',
    },
  ],
}
