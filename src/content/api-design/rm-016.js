export default {
  id: 'rm-016',
  category: 'api-design',
  title: 'Factory Floor API: A Trait with Parameters',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'traits', 'trait-parameters', 'manufacturing'],
  estMinutes: 20,
  description: `
A manufacturer has list endpoints for machines and for work orders. Each one needs a filter, and the only differences are the name of the filter and its type. Writing two nearly equal traits would miss the point of a trait.

A **trait** holds reusable parts of a method. A **trait parameter** is a placeholder inside a trait, written in double angle brackets, such as \`<<field>>\`. The value is given where the trait is applied:

\`\`\`
is: [ myTrait: { field: plant } ]
\`\`\`

Every \`<<field>>\` in the trait then becomes \`plant\`, even in a key.

**Requirements**
- A trait \`filterable\` with two parameters, \`<<field>>\` and \`<<fieldType>>\`.
- The trait adds one optional query parameter. Its name is \`<<field>>\` and its type is \`<<fieldType>>\`.
- \`GET /machines\` uses \`filterable\` so that it has an optional string query parameter \`plant\`. It returns 200.
- \`GET /work-orders\` uses \`filterable\` so that it has an optional integer query parameter \`priority\`. It returns 200.
`,
  starter: `#%RAML 1.0
title: Factory Floor API
mediaType: application/json

traits:
  filterable:

/machines:
  get:

/work-orders:
  get:
`,
  ramlChecks: [
    {
      label: 'The filterable trait adds a query parameter named <<field>>',
      rule: {
        type: 'any',
        rules: [
          { type: 'trait', name: 'filterable', has: 'queryParameters.<<field>>' },
          { type: 'trait', name: 'filterable', has: 'queryParameters.<< field >>' },
        ],
      },
    },
    { label: 'GET /machines uses filterable', rule: { type: 'applied', path: '/machines', method: 'get', trait: 'filterable' } },
    { label: 'GET /machines has an optional string plant', rule: { type: 'param', path: '/machines', method: 'get', in: 'query', name: 'plant', want: { type: 'string', required: false } } },
    { label: 'GET /machines returns 200', rule: { type: 'response', path: '/machines', method: 'get', status: '200' } },
    { label: 'GET /work-orders uses filterable', rule: { type: 'applied', path: '/work-orders', method: 'get', trait: 'filterable' } },
    { label: 'GET /work-orders has an optional integer priority', rule: { type: 'param', path: '/work-orders', method: 'get', in: 'query', name: 'priority', want: { type: 'integer', required: false } } },
    { label: 'GET /work-orders returns 200', rule: { type: 'response', path: '/work-orders', method: 'get', status: '200' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Factory Floor API
mediaType: application/json

traits:
  filterable:
    usage: Apply to a list method to add one filter.
    queryParameters:
      <<field>>:
        type: <<fieldType>>
        required: false
        description: Keep only the items that match this <<field>>.

/machines:
  get:
    is: [ filterable: { field: plant, fieldType: string } ]
    responses:
      200:
        description: The machines.

/work-orders:
  get:
    is: [ filterable: { field: priority, fieldType: integer } ]
    responses:
      200:
        description: The work orders.
`,
  keyPoints: [
    'A trait parameter is written <<name>> and can sit in a key or in a value.',
    'Values are given where the trait is applied, in is: [ trait: { name: value } ].',
    'One parameterised trait replaces several nearly equal traits.',
    'RAML also fills in reserved parameters such as <<resourcePathName>> and <<methodName>> for you.',
  ],
  solution: `
\`filterable\` holds the pattern once. \`<<field>>\` is used as the key, so the name of the query parameter comes from whoever applies the trait. \`<<fieldType>>\` does the same for the type.

Applying it to \`/machines\` gives an optional string called \`plant\`. Applying it to \`/work-orders\` gives an optional integer called \`priority\`.

\`required: false\` makes the parameter optional. The \`usage\` key tells other developers when to apply the trait.
`,
  followUps: [
    {
      q: 'What happens if you write is: [ filterable ] with no values?',
      a: 'The trait uses parameters, so the values must be given. Leaving them out is an error, because <<field>> has nothing to become.',
    },
    {
      q: 'Which parameters can you use without passing them?',
      a: 'The reserved ones. In a trait these are <<resourcePath>>, <<resourcePathName>> and <<methodName>>, and RAML fills them in from where the trait is applied.',
    },
    {
      q: 'What does <<resourcePathName | !singularize>> do?',
      a: 'It applies a function to the value. On /machines it gives machine, which suits a description or a type name. Other functions include !pluralize, !uppercase and !lowercase.',
    },
  ],
}
