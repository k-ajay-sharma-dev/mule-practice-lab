export default {
  id: 'ms-187',
  category: 'mulesoft',
  title: 'What APIkit Does With an API Spec',
  level: 'BEGINNER',
  tags: ['apikit', 'scaffolding', 'api-design', 'raml', 'oas'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A bank has written logic in the scaffolded flows for `GET /accounts` and `POST /accounts`. The spec gains `GET /accounts/{id}/balance`, and the developer runs the APIkit flow generation again. What happens to the project?',
      options: [
        'All flows are generated again, so the logic in the old flows is lost',
        'A flow is added for the new path, and the existing flows keep their logic',
        'Nothing changes, as scaffolding runs once when the project is created',
        'The router learns the new path, but its flow must be written by hand',
      ],
      answer: 1,
      explain: 'APIkit generation adds flows for the resources and methods that have none and leaves existing flows as they are, so it is safe to run again after the spec changes. The router does read the new spec, but a request still needs a flow with the expected name, and the generation creates it.',
    },
    {
      type: 'single',
      prompt: 'The spec says `POST /accounts` takes `application/json`. A client posts a valid JSON body but sends the header `Content-Type: text/plain`. In a scaffolded APIkit project, what does the client get?',
      options: [
        'A 201, as the body is valid JSON whatever the header says',
        'A 400, as the body does not match the type declared in the spec',
        'A 415, as the router rejects a media type the spec does not declare',
        'A 406, as the server cannot return the type that the client asked for',
      ],
      answer: 2,
      explain: 'The router checks the `Content-Type` against the media types in the spec before any flow runs. An undeclared type raises `APIKIT:UNSUPPORTED_MEDIA_TYPE`, which the scaffolded error handler turns into a 415. A 406 is about the `Accept` header, and a 400 is for a body or parameter that breaks the spec under a declared type.',
    },
    {
      type: 'single',
      prompt: 'An API spec marks the query parameter `accountType` as required on `GET /accounts`. A client calls that path without `accountType`. In a scaffolded APIkit project, what happens?',
      options: [
        'The flow for the path runs, with `accountType` set to an empty value',
        'The router adds a default `accountType` taken from the example data',
        'The flow for the path runs, and the database reports a missing value',
        'The router raises a bad request error, and the caller gets a 400 reply',
      ],
      answer: 3,
      explain: 'The router validates the request before the flow runs. It raises `APIKIT:BAD_REQUEST`, and the scaffolded error handler turns that into a 400 response. You did not have to write that check.',
    },
    {
      type: 'single',
      prompt: 'An API spec lists `/accounts` but has no `/loans` path. A client calls `GET /loans` on an app that uses the APIkit router. What does the client get?',
      options: [
        'A 200 reply with an empty body, since nothing failed in the app',
        'A 404 reply, because the path is not in the specification',
        'A 405 reply, because the method is not allowed on that path',
        'A new `/loans` flow, which the router generates at that moment',
      ],
      answer: 1,
      explain: 'The router only knows the paths in the spec. An unknown path raises `APIKIT:NOT_FOUND`, and the scaffolded error handler returns a 404. Flows are created by scaffolding, never by a request.',
    },
    {
      type: 'single',
      prompt: 'A developer has scaffolded a Mule project from a bank API spec, and the flow for `GET /accounts/{id}` now exists. What does the developer still have to add?',
      options: [
        'The HTTP Listener, since scaffolding only creates the error handler',
        'The API specification, since scaffolding leaves it out of the project',
        'The real work, such as the database call and the data transformation',
        'A Choice router in the flow, to check which path the client has called',
      ],
      answer: 2,
      explain: 'The generated flow is a placeholder. APIkit knows what the API looks like from the spec, but the spec does not say where the data comes from. That part is the developer\'s job.',
    },
    {
      type: 'single',
      prompt: 'APIkit scaffolds a flow with the long name `get:\\accounts:bank-api-config`. A developer wants to rename it to `getAccounts` to make it tidy. Why is that a bad idea?',
      options: [
        'The error handler of the app picks its error flow by that name',
        'The APIkit router finds the flow for a request by that name',
        'API Manager reads the flow name when it applies its policies',
        'Exchange shows that name as the operation name of the API',
      ],
      answer: 1,
      explain: 'The name follows a convention made of the method, the path and the APIkit config. If it no longer matches, the router cannot find the flow. Keep the name, and put readable logic in a sub-flow that it calls.',
    },
  ],
  description: `
A bank has written an API specification for a small **Accounts API**. A specification (or spec) is a file that describes the API's paths, data and responses.

It has these calls:

- \`GET /accounts\` lists accounts, and needs an \`accountType\` query parameter.
- \`GET /accounts/{id}\` returns one account.
- \`POST /accounts\` opens a new account.

A junior developer asks: "Do I now write a flow, a listener and all the checks by hand?" A colleague says: "No. Give the spec to **APIkit**." APIkit is a MuleSoft tool that turns a spec into a starter Mule project and uses the spec while the app runs.

**Questions**
1. What does APIkit generate from the spec?
2. What does the APIkit router do when a request arrives?
3. What is left for the developer to do?
`,
  answerTemplate: `## What APIkit generates

## What the router does

## What the developer still does
`,
  keyPoints: [
    'APIkit scaffolding turns a spec into a starter project.',
    'The main flow holds an HTTP Listener and the APIkit router.',
    'There is one generated flow for each path and method in the spec.',
    'The router checks a request against the spec and sends it to the matching flow.',
    'A scaffolded error handler turns APIkit errors into responses such as 400 and 404.',
    'The developer still writes the business logic inside the generated flows.',
  ],
  solution: `
**1. What is generated.** Scaffolding creates:
- a main flow with an HTTP Listener and the \`apikit:router\`
- a flow for each path and method, here three of them
- an error handler that maps APIkit errors to HTTP responses
- a console flow, which shows a page for trying the API

**2. The router.** For each request, the router compares it with the spec. If it fits, the router sends it to the matching flow. If it does not, the router raises an error before your flow runs:
- A missing required \`accountType\` gives \`APIKIT:BAD_REQUEST\`, returned as a 400.
- An unknown path gives \`APIKIT:NOT_FOUND\`, returned as a 404.

**3. What is left.** The generated flows are placeholders. The developer adds the real work, such as the database call and the Transform Message that builds the response. The developer keeps the generated flow names, because the router finds flows by name.
`,
  followUps: [
    {
      q: 'Does APIkit work with OAS as well as RAML?',
      a: 'Yes. APIkit for REST can scaffold from a RAML or an OAS spec. A common route is to publish the spec to Exchange or Design Center and import it from there, which works for both formats.',
    },
    {
      q: 'Why is checking requests in the router better than checking in each flow?',
      a: 'The rules are already in the spec, so writing them again in each flow repeats work and lets the two drift apart. The router applies the spec the same way for every call.',
    },
    {
      q: 'Does APIkit set up API Manager too?',
      a: 'No. API instances and policies are set up in API Manager. APIkit only deals with the Mule project.',
    },
  ],
}
