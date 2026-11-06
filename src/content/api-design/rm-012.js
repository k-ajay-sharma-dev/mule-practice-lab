export default {
  id: 'rm-012',
  category: 'api-design',
  title: 'Campus People API: Type Inheritance',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'data-types', 'inheritance', 'education'],
  estMinutes: 15,
  description: `
A university has separate records for students, staff and lecturers. Each record repeats the same id, name and email, and the three copies have already drifted apart.

**Type inheritance** lets one type build on another. Set \`type\` to the name of the parent, and the child gets every property of the parent. Its own \`properties\` block then adds what is new. A child can be a parent as well, which makes a chain.

**Requirements**
- A type \`Person\` with a required string \`personId\`, a required string \`fullName\`, and a required string \`email\`.
- A type \`Student\` that inherits from \`Person\` and adds a required string \`studentNumber\` and a required \`date-only\` \`enrolledOn\`.
- A type \`Staff\` that inherits from \`Person\` and adds a required string \`department\`.
- A type \`Lecturer\` that inherits from \`Staff\` and adds an optional string \`officeRoom\`.
- \`Lecturer\` has an example that fits it. Remember what it inherits.
- \`GET /students/{studentId}\` returns a \`Student\` with status 200, or 404.
- \`GET /lecturers/{lecturerId}\` returns a \`Lecturer\` with status 200, or 404.
`,
  starter: `#%RAML 1.0
title: Campus People API
mediaType: application/json

types:
  Person:
    type: object
    properties:
      personId: string

/students:
`,
  ramlChecks: [
    {
      label: 'Person has required personId, fullName and email',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Person', prop: 'personId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Person', prop: 'fullName', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Person', prop: 'email', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'Student inherits from Person', rule: { type: 'typeDecl', name: 'Student', extends: 'Person' } },
    {
      label: 'Student adds studentNumber and enrolledOn',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Student', prop: 'studentNumber', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Student', prop: 'enrolledOn', want: { type: 'date-only', required: true } },
        ],
      },
    },
    { label: 'Staff inherits from Person', rule: { type: 'typeDecl', name: 'Staff', extends: 'Person' } },
    { label: 'Staff adds a required string department', rule: { type: 'prop', typeName: 'Staff', prop: 'department', want: { type: 'string', required: true } } },
    { label: 'Lecturer inherits from Staff', rule: { type: 'typeDecl', name: 'Lecturer', extends: 'Staff' } },
    { label: 'Lecturer adds an optional string officeRoom', rule: { type: 'prop', typeName: 'Lecturer', prop: 'officeRoom', want: { type: 'string', required: false } } },
    {
      label: 'Lecturer has an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'Lecturer', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'Lecturer', want: { examples: { set: true } } },
        ],
      },
    },
    {
      label: 'GET /students/{studentId} returns a Student, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/students/{}', method: 'get', status: '200', typeIs: 'Student' },
          { type: 'response', path: '/students/{}', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'GET /lecturers/{lecturerId} returns a Lecturer, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/lecturers/{}', method: 'get', status: '200', typeIs: 'Lecturer' },
          { type: 'response', path: '/lecturers/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Campus People API
mediaType: application/json

types:
  Person:
    type: object
    properties:
      personId: string
      fullName: string
      email: string
  Student:
    type: Person
    properties:
      studentNumber: string
      enrolledOn: date-only
  Staff:
    type: Person
    properties:
      department: string
  Lecturer:
    type: Staff
    properties:
      officeRoom?: string
    example:
      personId: P-3310
      fullName: Maya Rao
      email: maya.rao@example.edu
      department: Physics
      officeRoom: B-214

/students:
  /{studentId}:
    get:
      responses:
        200:
          body:
            type: Student
        404:
          description: No student has this id.
/lecturers:
  /{lecturerId}:
    get:
      responses:
        200:
          body:
            type: Lecturer
        404:
          description: No lecturer has this id.
`,
  keyPoints: [
    'A child type names its parent in type, and gets all of its properties.',
    'The properties block of a child holds only what is new.',
    'Inheritance chains: Lecturer has the properties of Staff and of Person.',
    'An example for a child must include the required properties it inherits.',
  ],
  solution: `
\`Person\` now holds the shared properties once. \`Student\` and \`Staff\` name it in \`type\`, and each adds only what is new. \`Lecturer\` names \`Staff\`, so it gets \`department\` and also all of \`Person\`.

The example on \`Lecturer\` has to include \`personId\`, \`fullName\`, \`email\` and \`department\`, because all of them are required on \`Lecturer\` through its parents. \`officeRoom\` could be left out.

If the university adds a \`phone\` to \`Person\`, all three child types get it with a one line change.
`,
  followUps: [
    {
      q: 'Can a type inherit from two parents?',
      a: 'Yes, for object types. Write type: [ Person, Auditable ] and the child gets the properties of both. The parents must not conflict with each other.',
    },
    {
      q: 'Can a child type remove a property it inherits?',
      a: 'No. A child must still be valid as its parent, so it can add properties and can make a rule stricter, but it cannot take a property away.',
    },
    {
      q: 'When is inheritance the wrong choice?',
      a: 'When two types only happen to share a field and are not the same kind of thing. A deep chain also makes a type hard to read, since its shape is spread over many places.',
    },
  ],
}
