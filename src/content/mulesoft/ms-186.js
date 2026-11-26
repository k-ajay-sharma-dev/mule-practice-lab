export default {
  id: 'ms-186',
  category: 'mulesoft',
  title: 'What an API Specification Is For: RAML and OAS as a Shared Contract',
  level: 'BEGINNER',
  tags: ['api-design', 'raml', 'oas', 'design-center', 'contracts'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'An HR company has written a Leave Request API spec with example responses. The mobile team wants to call the API this week, and the Mule team has built nothing yet. What lets the mobile team start?',
      options: [
        'The mocking service, which replies with the examples written in the spec',
        'An API instance in API Manager, which answers when no app is behind it',
        'Publishing the spec to Exchange, which starts it on CloudHub with samples',
        'A proxy in API Manager pointed at the spec, which serves its examples',
      ],
      answer: 0,
      explain: 'The mocking service reads the spec and replies with its examples, so the mobile team can build against the contract before any implementation exists. An API instance and a proxy both need a real implementation behind them, and publishing to Exchange does not start anything.',
    },
    {
      type: 'single',
      prompt: 'A RAML 1.0 type for a leave request lists the properties `employeeId`, `startDate` and `note`, with no `required` facet on any of them. An APIkit app validates requests against it. A client sends a request with no `note`. What happens?',
      options: [
        'It passes, as a RAML property is optional unless it says `required: true`',
        'It fails with a 400, as a RAML property is required unless marked optional',
        'It passes, as APIkit checks the type of each field but not that it exists',
        'It fails with a 500, as the flow cannot read a field that is not there',
      ],
      answer: 1,
      explain: 'In RAML 1.0 a property is required by default, and `note?:` or `required: false` makes it optional. OAS works the other way: a property is optional unless it is listed under `required`, which is why the first option is a common slip. APIkit checks that required fields exist as well as their types, and a bad request gets a 400.',
    },
    {
      type: 'multi',
      prompt: 'An HR team is writing an API specification for `GET /employees/{id}`. Which two details belong in the specification?',
      options: [
        'The `id` path parameter and its type',
        'The fields returned in a successful response',
        'The SQL query that reads the employee table',
        'The name of the Mule flow that runs the query',
      ],
      answer: [0, 1],
      explain: 'A spec describes what a caller can send and what comes back. How the work is done, such as the SQL and the flows, is implementation detail. Callers should not depend on it.',
    },
    {
      type: 'single',
      prompt: 'A shipping company built a Mule API first. Two weeks later the website developers found that the delivery date was in a format they could not use. How would writing the specification first have helped?',
      options: [
        'APIkit would have rejected any response whose date did not match the spec',
        'The mocking service would have turned the date into the format the website needs',
        'The website team could have read and questioned the date field before the build',
        'API Manager would have refused to deploy an API with the wrong date format',
      ],
      answer: 2,
      explain: 'With a spec first, the people who will call the API can read it and comment early. Changing a line in a spec costs far less than changing finished code. APIkit checks incoming requests, not the replies a flow builds. The mocking service returns the examples as written, and API Manager does not check field formats.',
    },
    {
      type: 'single',
      prompt: 'A RAML file has the resource `/parcels/{id}:` with a `get:` method under it, and a `200:` response under that. What does this part of the file describe?',
      options: [
        'A database table called parcels with a column called id',
        'A rule that lets a client make 200 calls to read parcels',
        'A Mule flow that is running now and reading parcel data',
        'A request that reads one parcel, and what a good reply is',
      ],
      answer: 3,
      explain: 'A resource is a path, `get` is the HTTP method, and `200` is the status code for success. Together they describe a call that an API offers. No flow or table is created by writing this.',
    },
    {
      type: 'single',
      prompt: 'A retailer uses Anypoint Platform, and a partner asks for the API specification in OAS rather than RAML. Can the retailer write it in OAS and still use tools such as API Designer and APIkit?',
      options: [
        'No, because the spec must be converted to RAML before Exchange takes it',
        'Yes, because those Anypoint tools work with both RAML and OAS',
        'No, because API Designer opens OAS files in read-only mode',
        'Yes, but APIkit builds flows from RAML specs and not from OAS ones',
      ],
      answer: 1,
      explain: 'Anypoint tools such as API Designer, Exchange and APIkit accept both formats. The choice usually comes down to what the people and tools around the API already use.',
    },
  ],
  description: `
An HR software company is adding a **Leave Request API**. Staff will use it from a mobile app to ask for time off.

The mobile developers and the Mule developers want to start on the same day. The mobile developers ask: "What will the API look like?" The Mule developers have not written anything yet.

A senior developer says: "Write the **API specification** first." An API specification (or spec) is a file that describes an API: its paths, the data it takes and the responses it gives. Common languages for it are **RAML** and **OAS**.

**Questions**
1. What is an API specification for?
2. What goes in a spec, and what stays out?
3. What are RAML and OAS, and how would you use one here?
`,
  answerTemplate: `## What a specification is for

## What goes in and what stays out

## RAML and OAS in this project
`,
  keyPoints: [
    'An API specification is a written contract between the people who build an API and the people who call it.',
    'It describes paths, methods, parameters, data types and responses.',
    'It leaves out how the work is done, such as SQL and flow names.',
    'RAML and OAS are two languages for writing a spec. Anypoint tools work with both.',
    'Writing the spec first lets callers review it early, when changes are cheap.',
  ],
  solution: `
**1. Purpose.** The spec is the contract. The mobile and Mule developers agree on it once, then build their sides in parallel. Nobody has to guess a field name.

**2. What goes in.**
- In: paths such as \`/leave-requests\`, methods such as \`POST\`, parameters, data types, example data and responses.
- Out: SQL, flow names, server passwords and anything else about how the API is built inside.

**3. RAML and OAS.** Both are languages for writing the spec in a structured text file. The team picks one and writes it, for example in API Designer. A small part of a RAML file looks like this:
\`\`\`yaml
/leave-requests:
  post:
    responses:
      201:
        body:
          application/json:
            type: LeaveRequest
\`\`\`
This says a client can \`POST\` to \`/leave-requests\` and get JSON back. The spec can then be shared with the mobile developers and used to start the Mule project.
`,
  followUps: [
    {
      q: 'Does a spec do anything at runtime on its own?',
      a: 'A spec file is a description, so nothing runs because it exists. Tools use it, though. For example, APIkit can build a project from it, and the mocking service can answer calls with its example data.',
    },
    {
      q: 'Who should review a spec?',
      a: 'The people who will call the API, as well as the people who will build it. Their early comments are the main reason to write it first.',
    },
    {
      q: 'What does design-first mean?',
      a: 'It means agreeing the spec before writing the implementation. The opposite is building the code first and describing it afterwards.',
    },
  ],
}
