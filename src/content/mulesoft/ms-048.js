export default {
  id: 'ms-048',
  category: 'mulesoft',
  title: 'Writing a RAML 1.0 Spec for a System API: Types, Traits, Resource Types and Examples',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'raml', 'api-design', 'system-api', 'traits', 'resource-types'],
  estMinutes: 20,
  quiz: [
    {
      type: 'match',
      needsScenario: true,
      prompt: 'Match each problem in the junior\'s draft to the RAML feature that fixes it.',
      pairs: [
        ['`page`/`pageSize` repeated on every GET', 'A trait (e.g. `pageable`) applied with `is:`'],
        ['Every collection has a paginated GET and a POST returning 201', 'A resource type (e.g. `collection`)'],
        ['The customer object defined inline in three places', 'A named data type under `types`'],
      ],
      explain: 'A trait is a reusable **method-level** fragment; a resource type is a template for a **whole resource**; types remove duplicated object definitions.',
    },
    {
      type: 'single',
      prompt: 'The `collection` resource type uses `<<itemType>>` and `<<listType>>`. A developer adds `/orders` with `type: collection` and passes no parameters. What happens?',
      options: [
        'The parameters default to `any`, so `/orders` accepts any body',
        'They fall back to the resource name, as `<<resourcePathName>>` does',
        'APIkit fills them at runtime from the body of each request',
        'The spec fails to validate, as the parameters have no values',
      ],
      answer: 3,
      explain: '`<<itemType>>` and `<<listType>>` are parameters, and each one needs a value where the resource type is applied, for example `type: { collection: { itemType: Order, listType: OrderList } }`. Without values the parser reports an error. There is no `any` default, and only reserved parameters such as `<<resourcePathName>>` are filled in by RAML. APIkit works from the resolved spec, so nothing is filled at runtime.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The `collection` resource type declares `get?:` and `post?:`. The resource `/audit-logs` applies it and declares only `get:`. A client sends `POST /audit-logs` to the APIkit app. What comes back?',
      options: [
        '405, as the optional POST is not applied to `/audit-logs`',
        '501, as POST comes from the type but no flow was scaffolded for it',
        '201, as the type gives a POST to every resource that applies it',
        '400, as POST is allowed but its body type was never declared',
      ],
      answer: 0,
      explain: 'A method ending in `?` is applied only if the resource declares that method, so `/audit-logs` has GET and no POST. The router then raises APIKIT:METHOD_NOT_ALLOWED, which maps to 405. A 501 is for a method that is in the spec but has no flow. Optional methods let one resource type serve resources that declare only some of its methods.',
    },
    {
      type: 'single',
      prompt: 'A RAML spec declares realistic response examples. Process API developers want to start before the implementation of this API exists. How do the examples help them?',
      options: [
        'APIkit returns them as the real responses in production',
        'APIkit validates requests against them instead of the types',
        'The backend loads them as seed data for the real database',
        'The mocking service in Exchange and API Designer returns them',
      ],
      answer: 3,
      explain: 'The mocking service returns the examples, so Process API developers get realistic responses early. Examples do more: API Designer validates them against the declared types, which catches contract mistakes, and they become test data ideas for MUnit and functional monitors. The implementation, not the example, produces production responses.',
    },
    {
      type: 'multi',
      prompt: 'What should the Customers **System** API deliberately hide?',
      options: [
        'Physical table and column names',
        'Vendor-specific error codes and stack traces',
        'Surrogate keys with no business meaning',
        'A stable customer identifier',
        'Consumer-specific shaping for the mobile app',
        'The `page` and `pageSize` query parameters on collections',
      ],
      answer: [0, 1, 2, 4],
      explain: 'Changing the CRM should change only the implementation, so tables, vendor errors and internal keys stay hidden. A stable business identifier belongs in the contract; channel-specific shaping belongs in Experience/Process APIs. Paging is part of the contract that every System API shares, so `page` and `pageSize` are exposed through the trait.',
    },
    {
      type: 'single',
      prompt: 'Every future System API must page the same way. Where should the `pageable` trait live?',
      options: [
        'In the first System API spec, which the others include by URL',
        'In a shared RAML library published to Exchange',
        'In each Mule app\'s `config.yaml`',
        'In an API Manager policy on every instance',
      ],
      answer: 1,
      explain: 'A shared library in Exchange gives one versioned definition every spec can reference. Pointing at another API\'s spec ties every API to that one spec\'s releases. `config.yaml` and policies act at runtime and do not shape the contract.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The Customer type declares `email: string`. Some CRM customers have no email, and API Designer flags the example `{ customerId: \'C-1001\', name: \'Ada Stone\' }` as invalid. Which change fixes it?',
      options: [
        '`email: string?`, which marks the property as optional',
        '`optional: true` on the `email` property declaration',
        '`email?: string`, or `required: false` on the property',
        '`minLength: 0` on `email`, so an empty or missing value passes',
      ],
      answer: 2,
      explain: 'Append `?` to the property name or set `required: false` on its declaration. A `?` after the type, as in `string?`, means `string | nil`: the value may be null, but the property must still be there. RAML has no `optional` facet, and `minLength` only limits a value that is present.',
    },
  ],
  description: `
You are designing the **Customers System API** over a CRM database. Requirements:

- \`GET /customers\`: paginated list, optional filter by \`email\`
- \`POST /customers\`: create, returns **201**
- \`GET /customers/{customerId}\`: one customer, **404** if missing
- Every collection in this and future System APIs must page the **same way** (\`page\`, \`pageSize\` max 100)
- Consumers want realistic **examples** so the mock is useful

A junior's first draft repeats the \`page\`/\`pageSize\` query params on every GET, defines the customer object inline in three places, and has no examples.

**Questions**
1. Write a RAML 1.0 spec fragment covering the requirements using \`types\`, a \`traits\` entry for pagination and \`resourceTypes\` for collection/item.
2. Explain what traits and resource types each solve, and how parameters (\`<<itemType>>\`) work.
3. Why do examples matter beyond documentation?
4. What should a **System API** spec deliberately *not* expose?
`,
  answerTemplate: `## RAML spec

## Traits vs resource types

## Why examples matter

## What a System API should not expose
`,
  keyPoints: [
    'Declare reusable data types under types and reference them by name, with no inline duplicate objects.',
    'A trait is a reusable method-level fragment (query params, headers, responses) applied with is: [ ... ].',
    'A resource type is a template for a whole resource (its methods and responses), parameterised with <<name>> placeholders and applied with type: { name: { param: value } }.',
    'Examples power the mocking service, the Exchange console and consumer tests; they are validated against the declared types.',
    'A System API models the backend domain cleanly but should hide backend internals (table names, DB keys, vendor error codes) behind a stable contract.',
  ],
  solution: `
\`\`\`raml
#%RAML 1.0
title: Customers System API
version: v1
baseUri: https://api.example.com/customers-sapi/{version}
mediaType: application/json
protocols: [ HTTPS ]

types:
  CustomerStatus:
    type: string
    enum: [ ACTIVE, SUSPENDED, CLOSED ]
  Customer:
    type: object
    properties:
      id:
        type: string
        required: false
      firstName: string
      lastName: string
      email:
        type: string
        pattern: '^[^@]+@[^@]+$'
      status: CustomerStatus
    example:
      id: C-1001
      firstName: Ada
      lastName: Lovelace
      email: ada@example.com
      status: ACTIVE
  CustomerList:
    type: object
    properties:
      data: Customer[]
      page: integer
      pageSize: integer
      total: integer
  Error:
    type: object
    properties:
      code: string
      message: string

traits:
  pageable:
    queryParameters:
      page:
        type: integer
        minimum: 1
        default: 1
      pageSize:
        type: integer
        minimum: 1
        maximum: 100
        default: 20

resourceTypes:
  collection:
    get?:
      is: [ pageable ]
      responses:
        200:
          body:
            type: <<listType>>
    post?:
      body:
        type: <<itemType>>
      responses:
        201:
          body:
            type: <<itemType>>
        400:
          body:
            type: Error
  item:
    get?:
      responses:
        200:
          body:
            type: <<itemType>>
        404:
          body:
            type: Error
            example:
              code: NOT_FOUND
              message: Customer not found

/customers:
  type: { collection: { itemType: Customer, listType: CustomerList } }
  get:
    queryParameters:
      email?: string
  post:
  /{customerId}:
    type: { item: { itemType: Customer } }
    uriParameters:
      customerId: string
    get:
\`\`\`

**Traits vs resource types**
- A **trait** captures method-level behaviour shared across many operations: pagination params, a correlation-ID header, standard error responses. Applied with \`is: [ pageable ]\`.
- A **resource type** captures the *shape of a resource*: a collection always has a paginated GET and a POST returning 201; an item always has a GET with 404. Methods ending in \`?\` are optional: they are only applied if the resource declares that method.
- \`<<itemType>>\` / \`<<listType>>\` are parameters filled in where the type is applied. RAML also provides reserved parameters such as \`<<resourcePathName>>\` and functions like \`!singularize\`.
- Both are best moved into a shared **library** in Exchange so every System API pages the same way.

**Why examples matter**
- The mocking service (Design Center and Exchange) returns them, so Process API developers get realistic responses before the implementation exists.
- API Designer validates examples against types, catching contract mistakes early.
- They become test data ideas for MUnit and for functional monitors.

**What a System API should not expose**
It should present the backend's data in a clean canonical-ish form, but hide: physical table/column names, surrogate keys that have no business meaning, vendor-specific error codes and stack traces, and connection details. Changing the CRM should ideally change only the implementation, not the contract. It also should not contain consumer-specific shaping. That belongs in Process/Experience APIs.
`,
  followUps: [
    {
      q: 'How do you make a property optional in a RAML type?',
      a: 'Either append ? to the property name (email?: string) or set required: false on the property declaration.',
    },
    {
      q: 'What is the difference between example and examples?',
      a: 'example holds a single example value; examples is a map of named examples, which lets you show several scenarios (e.g. active and closed customers) for the same type.',
    },
    {
      q: 'Can a method apply both a resource type trait and its own trait?',
      a: 'Yes. Traits listed on the method merge with what the resource type contributes; the explicitly declared method content takes precedence where they overlap.',
    },
  ],
}
