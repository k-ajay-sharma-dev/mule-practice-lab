export default {
  id: 'rm-062',
  category: 'api-design',
  title: 'Course Catalogue API: Facets on a Type and an Example That Must Fit',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'data-types', 'facets', 'examples', 'education'],
  estMinutes: 14,
  description: `
A university publishes its 2,300 modules to a student app and to three partner colleges. Last term a partner loaded a module with the title \`""\` and 400 credits, because the contract only said "string" and "integer".

A **facet** is a rule added to a type. Strings take \`pattern\`, \`minLength\` and \`maxLength\`. Numbers take \`minimum\` and \`maximum\`. Any type can take \`enum\`.

An \`example\` on a type is checked against the type and its facets. An example that breaks a facet is an error in the file, so a wrong example tells you the facets and the data disagree. The starter already has an example, and it does not fit the rules below. Fix the example, not the rules.

Module codes are three capital letters and three digits, such as \`CSC101\`.

**Requirements**
- A type \`Course\` with these required properties:
  - \`courseCode\`: a string that must look like \`CSC101\`.
  - \`title\`: a string of 3 to 120 characters.
  - \`credits\`: an integer from 5 to 60.
  - \`level\`: only \`undergraduate\` or \`postgraduate\`.
- \`Course\` has an example that fits all of these rules.
- \`GET /courses\` returns a list of \`Course\`.
- \`GET /courses/{courseCode}\` returns a \`Course\` with an example, or 404.
`,
  starter: `#%RAML 1.0
title: Course Catalogue API
mediaType: application/json

types:
  Course:
    type: object
    properties:
      courseCode: string
      title: string
      credits: integer
      level: string
    example:
      courseCode: csc-101
      title: AI
      credits: 400
      level: Undergraduate

/courses:
`,
  ramlChecks: [
    {
      label: 'courseCode is a string whose pattern accepts CSC101 only',
      rule: { type: 'prop', typeName: 'Course', prop: 'courseCode', want: { type: 'string', required: true, pattern: { accepts: ['CSC101', 'HIS210'], rejects: ['csc101', 'CS101', 'CSC1010', 'CSC-101', 'XCSC101'] } } },
    },
    { label: 'title is a string of 3 to 120 characters', rule: { type: 'prop', typeName: 'Course', prop: 'title', want: { type: 'string', required: true, minLength: 3, maxLength: 120 } } },
    { label: 'credits is an integer from 5 to 60', rule: { type: 'prop', typeName: 'Course', prop: 'credits', want: { type: 'integer', required: true, minimum: 5, maximum: 60 } } },
    { label: 'level allows only undergraduate and postgraduate', rule: { type: 'prop', typeName: 'Course', prop: 'level', want: { required: true, enum: { exactly: ['undergraduate', 'postgraduate'] } } } },
    {
      label: 'Course has an example',
      rule: { type: 'any', rules: [{ type: 'typeDecl', name: 'Course', has: 'example' }, { type: 'typeDecl', name: 'Course', has: 'examples' }] },
    },
    { label: 'GET /courses returns a list of Course', rule: { type: 'response', path: '/courses', method: 'get', status: '200', typeIs: 'Course[]' } },
    { label: 'GET /courses/{courseCode} returns a Course with an example', rule: { type: 'response', path: '/courses/{}', method: 'get', status: '200', typeIs: 'Course', example: true } },
    { label: 'GET /courses/{courseCode} returns 404 for an unknown code', rule: { type: 'response', path: '/courses/{}', method: 'get', status: '404' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Course Catalogue API
mediaType: application/json

types:
  Course:
    type: object
    properties:
      courseCode:
        type: string
        pattern: ^[A-Z]{3}[0-9]{3}$
      title:
        type: string
        minLength: 3
        maxLength: 120
      credits:
        type: integer
        minimum: 5
        maximum: 60
      level:
        type: string
        enum: [ undergraduate, postgraduate ]
    example:
      courseCode: CSC101
      title: Introduction to Artificial Intelligence
      credits: 20
      level: undergraduate

/courses:
  get:
    responses:
      200:
        body:
          type: Course[]
  /{courseCode}:
    get:
      responses:
        200:
          body:
            type: Course
        404:
          description: No course has this code.
`,
  keyPoints: [
    'A facet is a rule on a type, such as pattern, minLength, maxLength, minimum, maximum or enum.',
    'Examples are checked against the type, so a broken example shows a mismatch between data and rules.',
    'enum values compare exactly, so Undergraduate does not match undergraduate.',
    'A response that uses a named type shows that type\'s example in Exchange and in the mocking service.',
  ],
  solution: `
The four facets turn "string" and "integer" into real rules. \`^[A-Z]{3}[0-9]{3}$\` accepts \`CSC101\` and refuses \`csc-101\`. \`minLength: 3\` refuses the empty title. \`maximum: 60\` refuses 400 credits. The enum makes \`level\` one of two known values.

The starter example broke every rule, so after the facets were added the file reported it as invalid. The fixed example uses a real code, a full title, 20 credits and the lower case enum value.

\`GET /courses/{courseCode}\` returns \`Course\`, so its 200 shows the type's example. Partners see a value that is known to pass, which is the point of putting it in the contract.
`,
  followUps: [
    {
      q: 'Why fix the example rather than loosen the facet?',
      a: 'The facet states the business rule. If the example breaks it, the example is the wrong data, and loosening the rule would let bad modules through.',
    },
    {
      q: 'Is an enum case sensitive?',
      a: 'Yes. Values compare exactly, so Undergraduate and undergraduate are different values. Pick one style and keep to it.',
    },
    {
      q: 'Where does a pattern check run in Mule?',
      a: 'APIkit validates request bodies and parameters against the RAML at runtime. It does not validate responses, so a bad response still needs tests.',
    },
    {
      q: 'Why use minimum 5 rather than minimum 0 for credits?',
      a: 'The smallest real module is worth 5 credits. Facets should state the business rule, not only the data type.',
    },
  ],
}
