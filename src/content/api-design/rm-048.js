export default {
  id: 'rm-048',
  category: 'api-design',
  title: 'Video Library API: Public and Secured Endpoints Together',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'security', 'oauth2', 'securedBy', 'media'],
  estMinutes: 25,
  description: `
A streaming service lets anyone browse its videos with no account. A viewer who signs in also sees where they stopped watching. Only signed in viewers have a watchlist.

So one API has three kinds of method: open to all, better with a token, and closed without one. RAML covers this with \`securedBy\`.

\`null\` in a \`securedBy\` list means "no security is also fine". So \`securedBy: [ null, oauth2 ]\` lets a caller come with a token or without one.

\`securedBy\` at the top of the file is a default. A method that states its own \`securedBy\` replaces that default completely. A **scope** is a named permission carried by a token, and a method can name the scopes it needs:

\`\`\`
securedBy: [ oauth2: { scopes: [ some:scope ] } ]
\`\`\`

**Requirements**
- Title \`Video Library API\`, with JSON as the default media type.
- A security scheme \`oauth2\` of type \`OAuth 2.0\`. Its \`settings\` give \`authorizationUri\` \`https://auth.example.com/authorize\`, \`accessTokenUri\` \`https://auth.example.com/token\`, the grant \`authorization_code\`, and the scopes \`watchlist:read\` and \`watchlist:write\`.
- The scheme's \`describedBy\` has a 401 response.
- The default for the whole API is \`securedBy: [ null, oauth2 ]\`, so a read works with a token or without one.
- A type \`Video\` with a required string \`videoId\`, a required string \`title\`, and an optional integer \`resumeAt\`. \`resumeAt\` is only sent to a signed in viewer.
- A type \`WatchlistItem\` with a required string \`videoId\`.
- \`GET /videos\` returns \`Video[]\` with status 200, and \`GET /videos/{videoId}\` returns a \`Video\` or 404. They use the default.
- \`GET /watchlist\` needs a token with the scope \`watchlist:read\`, and returns \`Video[]\` with status 200.
- \`POST /watchlist\` needs a token with the scope \`watchlist:write\`. It takes a \`WatchlistItem\` and returns 201.
`,
  starter: `#%RAML 1.0
title: Video Library API
mediaType: application/json

securitySchemes:

types:

/videos:

/watchlist:
`,
  ramlChecks: [
    { label: 'oauth2 is an OAuth 2.0 scheme', rule: { type: 'scheme', name: 'oauth2', schemeType: 'OAuth 2.0' } },
    {
      label: 'The settings give both URIs and the scopes',
      rule: { type: 'scheme', name: 'oauth2', values: {"settings.authorizationUri":"https://auth.example.com/authorize","settings.accessTokenUri":"https://auth.example.com/token","settings.authorizationGrants":["authorization_code"],"settings.scopes":["watchlist:read","watchlist:write"]}, has: ['settings.authorizationUri', 'settings.accessTokenUri', 'settings.authorizationGrants', 'settings.scopes'] },
    },
    { label: 'The scheme describes a 401 response', rule: { type: 'scheme', name: 'oauth2', has: 'describedBy.responses.401' } },
    { label: 'The default is securedBy: [ null, oauth2 ]', rule: { type: 'root', key: 'securedBy', want: { exactly: [null, 'oauth2'] } } },
    {
      label: 'The video reads stay open to callers with no token',
      rule: {
        type: 'all',
        rules: [
          { type: 'public', path: '/videos', method: 'get' },
          { type: 'public', path: '/videos/{}', method: 'get' },
        ],
      },
    },
    {
      label: 'Video has a required videoId and title',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Video', prop: 'videoId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Video', prop: 'title', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'resumeAt is optional, since an anonymous caller does not get it', rule: { type: 'prop', typeName: 'Video', prop: 'resumeAt', want: { type: 'integer', required: false } } },
    { label: 'WatchlistItem has a required videoId', rule: { type: 'prop', typeName: 'WatchlistItem', prop: 'videoId', want: { type: 'string', required: true } } },
    { label: 'GET /videos returns Video[]', rule: { type: 'response', path: '/videos', method: 'get', status: '200', typeIs: 'Video[]' } },
    {
      label: 'GET /videos/{videoId} returns a Video, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/videos/{}', method: 'get', status: '200', typeIs: 'Video' },
          { type: 'response', path: '/videos/{}', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'GET /watchlist replaces the default and needs watchlist:read',
      rule: { type: 'secured', path: '/watchlist', method: 'get', scheme: 'oauth2', scopes: ['watchlist:read'], onlyScopes: true, required: true },
    },
    { label: 'GET /watchlist returns Video[]', rule: { type: 'response', path: '/watchlist', method: 'get', status: '200', typeIs: 'Video[]' } },
    {
      label: 'POST /watchlist replaces the default and needs watchlist:write',
      rule: { type: 'secured', path: '/watchlist', method: 'post', scheme: 'oauth2', scopes: ['watchlist:write'], onlyScopes: true, required: true },
    },
    {
      label: 'POST /watchlist takes a WatchlistItem and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/watchlist', method: 'post', typeIs: 'WatchlistItem' },
          { type: 'response', path: '/watchlist', method: 'post', status: '201' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Video Library API
mediaType: application/json

securitySchemes:
  oauth2:
    type: OAuth 2.0
    describedBy:
      responses:
        401:
          description: The token is missing, wrong or expired.
    settings:
      authorizationUri: https://auth.example.com/authorize
      accessTokenUri: https://auth.example.com/token
      authorizationGrants: [ authorization_code ]
      scopes: [ watchlist:read, watchlist:write ]

securedBy: [ null, oauth2 ]

types:
  Video:
    type: object
    properties:
      videoId: string
      title: string
      resumeAt?: integer
  WatchlistItem:
    type: object
    properties:
      videoId: string

/videos:
  get:
    responses:
      200:
        body:
          type: Video[]
  /{videoId}:
    get:
      responses:
        200:
          body:
            type: Video
        404:
          description: No video has this id.

/watchlist:
  get:
    securedBy: [ oauth2: { scopes: [ watchlist:read ] } ]
    responses:
      200:
        body:
          type: Video[]
  post:
    securedBy: [ oauth2: { scopes: [ watchlist:write ] } ]
    body:
      type: WatchlistItem
    responses:
      201:
        description: The video was added.
`,
  keyPoints: [
    'null in a securedBy list means a caller may come with no security at all.',
    'securedBy at the top of the file is a default, and a method can replace it.',
    'A method with its own securedBy does not keep the null from the default.',
    'A field that only some callers receive must be optional in the type.',
  ],
  solution: `
The default says "token or no token", which suits every read. The two watchlist methods state their own \`securedBy\`. That replaces the default, so \`null\` no longer applies and a token is needed.

\`resumeAt\` is optional because an anonymous caller has no position to resume. If it were required, the same type could not describe both replies.

Read the default with care on a real project. Any new method a developer adds is open until someone closes it. Many teams prefer the opposite: \`securedBy: [ oauth2 ]\` at the top, and \`[ null, oauth2 ]\` on each public method. A new method is then closed by default.
`,
  followUps: [
    {
      q: 'What does securedBy: [ null ] mean on one method when the API has oauth2 as its default?',
      a: 'That method replaces the default and needs no security at all. This is how a single public method sits inside a secured API, such as a health check.',
    },
    {
      q: 'Does null in the contract switch off the policy in API Manager?',
      a: 'No, the contract only documents the rule. A policy applied to the whole API still blocks anonymous calls unless it is limited to chosen methods and resources.',
    },
    {
      q: 'How should the backend treat a request that may or may not carry a token?',
      a: 'If a token is present it must be valid, so a bad token still gets a 401. If there is no token, the caller gets the public view with personal fields left out.',
    },
  ],
}
