export default {
  id: 'rm-063',
  category: 'api-design',
  title: 'Leave Requests API: When to Answer 409 Conflict',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'status-codes', 'conflict', 'errors', 'request-body', 'hr'],
  estMinutes: 14,
  description: `
A retailer with 18,000 staff moves holiday booking into an HR app. Employees ask for leave, and the API checks two business rules before it saves anything:
- the dates must not overlap a request the employee already has, and
- annual leave cannot go past the days the employee has left.

A request that breaks one of those rules is well formed. Every field is present and has the right type, so 400 is the wrong answer. **409 Conflict** says the request clashes with the current state of the data. The app then shows the reason, so the body of a 409 should say what clashed.

Use one \`Error\` type for every error body, so the app can read all of them the same way.

**Requirements**
- A type \`LeaveRequest\` with:
  - \`startDate\` and \`endDate\`: required calendar days with no time.
  - \`leaveType\`: required, only \`annual\`, \`sick\`, \`parental\` or \`unpaid\`.
  - \`note\`: optional string of at most 500 characters.
- A type \`Error\` with a required string \`code\` and a required string \`message\`, and an example.
- \`POST /employees/{employeeId}/leave-requests\` takes a \`LeaveRequest\` body. It returns:
  - 201 with a \`Location\` header,
  - 400 with an \`Error\` body when the body breaks the type,
  - 404 when no employee has that id,
  - 409 with an \`Error\` body when the dates overlap or the allowance is used up.
`,
  starter: `#%RAML 1.0
title: Leave Requests API
mediaType: application/json

types:
  LeaveRequest:
    type: object
    properties:
      startDate: date-only

/employees:
  /{employeeId}:
    /leave-requests:
      post:
        body:
          type: LeaveRequest
        responses:
          201:
          400:
`,
  ramlChecks: [
    {
      label: 'startDate and endDate are required date-only values',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'LeaveRequest', prop: 'startDate', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'LeaveRequest', prop: 'endDate', want: { type: 'date-only', required: true } },
        ],
      },
    },
    { label: 'leaveType allows only annual, sick, parental and unpaid', rule: { type: 'prop', typeName: 'LeaveRequest', prop: 'leaveType', want: { required: true, enum: { exactly: ['annual', 'sick', 'parental', 'unpaid'] } } } },
    { label: 'note is an optional string of at most 500 characters', rule: { type: 'prop', typeName: 'LeaveRequest', prop: 'note', want: { type: 'string', required: false, maxLength: 500 } } },
    {
      label: 'Error has a required code and message, and an example',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
          { type: 'any', rules: [{ type: 'typeDecl', name: 'Error', has: 'example' }, { type: 'typeDecl', name: 'Error', has: 'examples' }] },
        ],
      },
    },
    { label: 'POST takes a LeaveRequest body', rule: { type: 'body', path: '/employees/{}/leave-requests', method: 'post', typeIs: 'LeaveRequest' } },
    { label: 'POST returns 201 with a Location header', rule: { type: 'response', path: '/employees/{}/leave-requests', method: 'post', status: '201', header: 'Location' } },
    { label: 'POST returns 409 with an Error body for a clash', rule: { type: 'response', path: '/employees/{}/leave-requests', method: 'post', status: '409', typeIs: 'Error' } },
    { label: 'POST returns 400 with an Error body for a bad body', rule: { type: 'response', path: '/employees/{}/leave-requests', method: 'post', status: '400', typeIs: 'Error' } },
    { label: 'POST returns 404 for an unknown employee', rule: { type: 'response', path: '/employees/{}/leave-requests', method: 'post', status: '404' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Leave Requests API
mediaType: application/json

types:
  LeaveRequest:
    type: object
    properties:
      startDate: date-only
      endDate: date-only
      leaveType:
        type: string
        enum: [ annual, sick, parental, unpaid ]
      note?:
        type: string
        maxLength: 500
    example:
      startDate: 2026-07-20
      endDate: 2026-07-31
      leaveType: annual
      note: Family holiday
  Error:
    type: object
    properties:
      code: string
      message: string
    example:
      code: LEAVE_OVERLAP
      message: These dates overlap leave request LR-88213 from 2026-07-27 to 2026-08-02.

/employees:
  /{employeeId}:
    /leave-requests:
      post:
        description: Ask for leave.
        body:
          type: LeaveRequest
        responses:
          201:
            description: The request was saved and sent to the manager.
            headers:
              Location:
                type: string
          400:
            description: The body does not fit the LeaveRequest type.
            body:
              type: Error
          404:
            description: No employee has this id.
            body:
              type: Error
          409:
            description: The dates overlap another request, or the allowance is used up.
            body:
              type: Error
`,
  keyPoints: [
    '400 means the request is malformed. 409 means it is well formed but clashes with the current data.',
    'A 409 body should say what clashed, so the caller can fix it.',
    'One Error type for every error keeps the client code simple.',
    'A code field such as LEAVE_OVERLAP lets the app branch on the reason without parsing the message.',
  ],
  solution: `
The type catches what can be checked from the request alone: dates in the right format, a known leave type and a note that is not huge. APIkit returns 400 for those.

Overlaps and allowance need the employee's existing data, so only the implementation can find them. That is a business rule, and 409 is the status for a request that clashes with what is already stored. A 400 there would tell the app the JSON was wrong, which sends the developer looking in the wrong place.

Every error response uses \`Error\`. The \`code\` lets the app show a different screen for \`LEAVE_OVERLAP\` and \`ALLOWANCE_EXCEEDED\`, and the \`message\` is readable text for a person.
`,
  followUps: [
    {
      q: 'Some teams use 422 for business rule failures. How does it compare to 409?',
      a: '422 Unprocessable Content says the body is well formed but its content fails a rule. 409 says the request clashes with the current state. Either is defensible, and the contract must pick one and use it everywhere.',
    },
    {
      q: 'Can the type check that endDate is after startDate?',
      a: 'No. RAML facets work on one value at a time. Comparing two fields is code in the implementation, which returns 400.',
    },
    {
      q: 'What should the 409 body include for an overlap?',
      a: 'A stable code, a readable message and the id of the request it overlaps. The app can then link to that request.',
    },
    {
      q: 'Is a 409 safe to retry?',
      a: 'Not unchanged. The clash stays until the caller changes the dates or the stored data changes, so a blind retry gets the same 409.',
    },
  ],
}
