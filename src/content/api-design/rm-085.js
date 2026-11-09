export default {
  id: 'rm-085',
  category: 'api-design',
  title: 'Hotel Check-in API: Two Security Schemes, One per Kind of Caller',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'security', 'oauth2', 'basic-authentication', 'securedBy', 'hospitality'],
  estMinutes: 25,
  description: `
A hotel group with 85 hotels is adding self check-in. Guests use the mobile app, where they sign in and the app gets an OAuth 2.0 token through the authorization code grant. The group also has 240 lobby kiosks. The kiosk vendor's software can only send a username and a password, and it will not be updated before the launch in March.

So one API has two kinds of caller and two schemes. The guest app uses \`oauth2\` everywhere. The kiosks use \`kioskBasic\`, and only on the kiosk resource.

\`securedBy\` at the top of the file is the default. \`securedBy\` on a resource replaces that default for the methods of that resource. A list with two schemes, such as \`[ oauth2, kioskBasic ]\`, means a caller may use either one, which is wider than you want here.

**Requirements**
- Title \`Hotel Check-in API\`, with JSON as the default media type. \`protocols\` allows HTTPS and nothing else.
- A security scheme \`oauth2\` of type \`OAuth 2.0\`. Its \`settings\` give \`authorizationUri\` \`https://login.example.com/authorize\`, \`accessTokenUri\` \`https://login.example.com/token\` and the grant \`authorization_code\`.
- A security scheme \`kioskBasic\` of type \`Basic Authentication\`. Its \`describedBy\` has a 401 response with a \`WWW-Authenticate\` header.
- The default for the whole API is \`oauth2\` alone.
- A type \`Booking\` with a required string \`bookingRef\`, a required date-only \`arrival\` and a required string \`roomType\`.
- A type \`CheckIn\` with a required string \`bookingRef\` and a required string \`lastName\`.
- \`GET /bookings/{bookingRef}\` returns a \`Booking\` with status 200, or 404. The guest app calls it.
- \`POST /bookings/{bookingRef}/check-in\` returns 200. The guest app calls it.
- \`GET /kiosk-check-ins\` returns \`CheckIn[]\` with status 200, the check-ins done at that kiosk today.
- \`POST /kiosk-check-ins\` takes a \`CheckIn\` and returns 201.
- Both kiosk methods use \`kioskBasic\`, set once on the resource.
`,
  starter: `#%RAML 1.0
title: Hotel Check-in API
mediaType: application/json

securitySchemes:

types:

/bookings:

/kiosk-check-ins:
`,
  ramlChecks: [
    { label: 'protocols allows HTTPS only', rule: { type: 'root', key: 'protocols', want: { exactly: ['HTTPS'] } } },
    {
      label: 'oauth2 is OAuth 2.0 with the two URLs and the authorization_code grant',
      rule: {
        type: 'scheme',
        name: 'oauth2',
        schemeType: 'OAuth 2.0',
        values: {
          'settings.authorizationUri': 'https://login.example.com/authorize',
          'settings.accessTokenUri': 'https://login.example.com/token',
          'settings.authorizationGrants': ['authorization_code'],
        },
      },
    },
    { label: 'kioskBasic is a Basic Authentication scheme', rule: { type: 'scheme', name: 'kioskBasic', schemeType: 'Basic Authentication' } },
    { label: 'kioskBasic describes a 401 with a WWW-Authenticate header', rule: { type: 'scheme', name: 'kioskBasic', has: 'describedBy.responses.401.headers.WWW-Authenticate' } },
    { label: 'The default for the whole API is oauth2 alone', rule: { type: 'root', key: 'securedBy', want: { exactly: ['oauth2'] } } },
    {
      label: 'Booking has bookingRef, a date-only arrival and roomType',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Booking', prop: 'bookingRef', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Booking', prop: 'arrival', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'Booking', prop: 'roomType', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'GET /bookings/{bookingRef} returns a Booking or 404, secured by oauth2',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/bookings/{}', method: 'get', status: '200', typeIs: 'Booking' },
          { type: 'response', path: '/bookings/{}', method: 'get', status: '404' },
          { type: 'secured', path: '/bookings/{}', method: 'get', scheme: 'oauth2', required: true },
        ],
      },
    },
    {
      label: 'POST /bookings/{bookingRef}/check-in returns 200, secured by oauth2',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/bookings/{}/check-in', method: 'post', status: '200' },
          { type: 'secured', path: '/bookings/{}/check-in', method: 'post', scheme: 'oauth2', required: true },
        ],
      },
    },
    {
      label: 'GET /kiosk-check-ins returns CheckIn[] and POST takes a CheckIn and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/kiosk-check-ins', method: 'get', status: '200', typeIs: 'CheckIn[]' },
          { type: 'body', path: '/kiosk-check-ins', method: 'post', typeIs: 'CheckIn' },
          { type: 'response', path: '/kiosk-check-ins', method: 'post', status: '201' },
        ],
      },
    },
    {
      label: 'Both kiosk methods are secured by kioskBasic',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/kiosk-check-ins', method: 'get', scheme: 'kioskBasic', required: true },
          { type: 'secured', path: '/kiosk-check-ins', method: 'post', scheme: 'kioskBasic', required: true },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Hotel Check-in API
protocols: [ HTTPS ]
mediaType: application/json

securitySchemes:
  oauth2:
    type: OAuth 2.0
    description: Guests sign in to the mobile app, which receives a token for them.
    describedBy:
      headers:
        Authorization:
          type: string
      responses:
        401:
          description: The token is missing, wrong or expired.
    settings:
      authorizationUri: https://login.example.com/authorize
      accessTokenUri: https://login.example.com/token
      authorizationGrants: [ authorization_code ]
  kioskBasic:
    type: Basic Authentication
    description: Each lobby kiosk has its own username and password.
    describedBy:
      headers:
        Authorization:
          type: string
      responses:
        401:
          description: The kiosk username or password is wrong.
          headers:
            WWW-Authenticate:
              type: string

securedBy: [ oauth2 ]

types:
  Booking:
    type: object
    properties:
      bookingRef: string
      arrival: date-only
      roomType: string
  CheckIn:
    type: object
    properties:
      bookingRef: string
      lastName: string

/bookings:
  /{bookingRef}:
    get:
      responses:
        200:
          body:
            type: Booking
        404:
          description: No booking has this reference.
    /check-in:
      post:
        responses:
          200:
            description: The guest is checked in and the digital key is ready.

/kiosk-check-ins:
  securedBy: [ kioskBasic ]
  get:
    responses:
      200:
        body:
          type: CheckIn[]
  post:
    body:
      type: CheckIn
    responses:
      201:
        description: The guest is checked in. The kiosk prints the key card.
`,
  keyPoints: [
    'One API can declare several schemes and use each where it fits.',
    'securedBy on a resource replaces the API default for the methods of that resource.',
    'A securedBy list with two schemes means either one is enough, not both.',
    'Basic Authentication sends a reusable password, so keep it to the callers that cannot do better.',
    'The authorization code grant suits an app where a person signs in.',
  ],
  solution: `
The default is \`oauth2\` alone, so the guest methods need no \`securedBy\` of their own. Any method added later is also closed to kiosks.

\`/kiosk-check-ins\` states \`securedBy: [ kioskBasic ]\` once, and both of its methods use it. The kiosk password works there and nowhere else. If the default had been \`[ oauth2, kioskBasic ]\`, a kiosk password could also read any booking.

Writing the kiosk scheme into the contract also records a debt. When the vendor adds OAuth 2.0 support, the team removes one scheme and one line, and the change is quick to review.
`,
  followUps: [
    {
      q: 'Why not let the kiosks use the guest OAuth flow?',
      a: 'The authorization code grant needs a person to sign in through a browser. A kiosk has no guest account of its own, and its software cannot handle the redirect.',
    },
    {
      q: 'What would a better long term option for the kiosks be?',
      a: 'The client credentials grant, where each kiosk has its own client and gets short lived tokens. A stolen token then expires within minutes.',
    },
    {
      q: 'How do you stop one kiosk password unlocking all 240 kiosks?',
      a: 'Give every kiosk its own username and password. A single leaked password can then be revoked without touching the others.',
    },
    {
      q: 'Why does the 401 from Basic Authentication carry WWW-Authenticate?',
      a: 'The HTTP standard requires it on a 401. It names the scheme the client must use, here Basic with a realm.',
    },
  ],
}
