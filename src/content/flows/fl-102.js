import { design, flow, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-102',
  category: 'flows',
  title: 'New Hire API: Reshape the Request with Transform Message',
  level: 'BEGINNER',
  tags: ['dataweave', 'http-listener', 'json', 'hr'],
  estMinutes: 10,
  flowChecks: [
    { label: 'An HTTP Listener receives the POST on /employees', rule: { type: 'source', component: 'http-listener', where: { path: '/employees', allowedMethods: 'POST' } } },
    {
      label: 'Transform Message builds fullName from the first and last name',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'transform', where: { script: 'fullName' } },
          { type: 'exists', component: 'transform', where: { script: 'firstName' } },
          { type: 'exists', component: 'transform', where: { script: 'lastName' } },
        ],
      },
    },
    {
      label: 'Transform Message renames dept to department',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'transform', where: { script: 'department' } },
          { type: 'exists', component: 'transform', where: { script: 'dept' } },
        ],
      },
    },
    {
      label: 'The response keeps employeeId and startDate',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'transform', where: { script: 'employeeId' } },
          { type: 'exists', component: 'transform', where: { script: 'startDate' } },
        ],
      },
    },
    {
      label: 'The employee ID is logged when the request arrives, before the Transform Message',
      rule: { type: 'before', first: 'logger', firstWhere: { message: 'employeeId' }, then: 'transform' },
    },
    {
      label: 'The full name is logged after the Transform Message',
      rule: { type: 'before', first: 'transform', then: 'logger', thenWhere: { message: 'fullName' } },
    },
  ],
  referenceFlow: design(
    flow('create-employee', source('http-listener', { path: '/employees', allowedMethods: 'POST' }), [
      step('logger', { level: 'INFO', message: '#["New hire received: " ++ payload.employeeId]' }),
      step('transform', {
        script:
          '%dw 2.0\noutput application/json\n---\n{\n  employeeId: payload.employeeId,\n  fullName: payload.firstName ++ " " ++ payload.lastName,\n  department: payload.dept,\n  startDate: payload.startDate\n}',
      }),
      step('logger', { level: 'INFO', message: '#["New hire reshaped: " ++ payload.fullName]' }),
    ]),
  ),
  description: `
The HR portal sends new hires to an integration API. The payroll team wants the data in a different shape.

The portal sends \`POST /employees\` with this body:

\`\`\`json
{ "employeeId": "E1042", "firstName": "Asha", "lastName": "Rao", "dept": "FIN", "startDate": "2026-12-01" }
\`\`\`

The API must answer with this body:

\`\`\`json
{ "employeeId": "E1042", "fullName": "Asha Rao", "department": "FIN", "startDate": "2026-12-01" }
\`\`\`

**Transform Message** is the component that changes the shape of data. You write the new shape in **DataWeave**, the MuleSoft data language.

**Requirements**
- Join the first and last name into \`fullName\`.
- Rename \`dept\` to \`department\`.
- Log the employee ID when the request arrives, and the full name after the change.

**Design the flow.**
`,
  answerTemplate: `## Trigger

## The DataWeave script

## Logging before and after

## How the response reaches the caller
`,
  keyPoints: [
    'One Transform Message sits between the listener and the end of the flow.',
    'The script has a header with the output type, then ---, then the new shape.',
    'The ++ operator joins two strings. Renaming a field is writing a new key with the old value.',
    'After the Transform Message, the payload has the new shape, so the second Logger reads payload.fullName.',
    'The listener returns the final payload as the response body.',
  ],
  solution: `
1. **HTTP Listener**, path \`/employees\`, allowed method \`POST\`.
2. **Logger** with \`#["New hire received: " ++ payload.employeeId]\`.
3. **Transform Message** with this script:

\`\`\`
%dw 2.0
output application/json
---
{
  employeeId: payload.employeeId,
  fullName: payload.firstName ++ " " ++ payload.lastName,
  department: payload.dept,
  startDate: payload.startDate
}
\`\`\`

4. **Logger** with \`#["New hire reshaped: " ++ payload.fullName]\`.

The two Loggers read different fields because the payload changed between them. \`payload.firstName\` no longer exists after step 3.
`,
  followUps: [
    {
      q: 'What does output application/json do?',
      a: 'It sets the format of the result. Changing it to application/xml or application/csv changes the format, though each format has its own rules about the shape of the data.',
    },
    {
      q: 'Could the first Logger read payload.fullName?',
      a: 'No. That field does not exist until the Transform Message has run, so the expression would give null.',
    },
    {
      q: 'The portal also needs the original first name later in the flow. What do you do?',
      a: 'Store it with Set Variable before the Transform Message, or keep it as an extra field in the new shape.',
    },
  ],
}
