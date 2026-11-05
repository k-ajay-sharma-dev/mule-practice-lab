export default {
  id: 'ms-112',
  category: 'mulesoft',
  title: 'API Designer in Depth: Mocking Service Headers, Public Mock URLs, Dependencies and RAML or OAS Copies',
  level: 'INTERMEDIATE',
  tags: ['design-center', 'api-designer', 'api-management', 'mocking-service', 'raml', 'oas', 'exchange', 'api-design'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'A POST method defines responses 201, 400, 409 and 500. A consumer calls the mock with no special headers. Which response comes back?',
      options: [
        '201, because by default the mocking service chooses the lowest status code defined for the method',
        'A random one of the four',
        'The first one written in the spec',
        '200, which the mock always adds',
      ],
      answer: 0,
      explain: 'By default the mock returns the minimum status code defined for the method. This is why an unchanged mock only ever shows the happy path.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each header to what it does in the mocking service.',
      pairs: [
        ['MS2-Status-Code', 'Filters the status codes that the mock can choose from'],
        ['MS2-Error-Rate', 'Sets the probability of an error status, as a decimal between 0 and 1'],
        ['MS2-Delay', 'Sets how long the mock takes to answer, up to 10000 ms'],
        ['MS2-Example', 'Chooses one of several named examples for a status code'],
        ['MS2-Randomize', 'Generates a payload from the type when no example is defined'],
      ],
      explain: 'These are behavioral headers. They let a consumer test its error handling and timeouts before the implementation exists.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'A consumer wants 201 when there is no error and 401 for about 30% of calls. Which headers do this?',
      options: [
        '`MS2-Error-Rate: 0.3` and `MS2-Status-Code: 201,401`',
        '`MS2-Error-Rate: 30` and `MS2-Status-Code: 401`',
        '`MS2-Error-Level: 0.3`',
        '`MS2-Status-Code-Selection: 30%`',
      ],
      answer: 0,
      explain: 'The rate is a decimal between 0 and 1. With MS2-Error-Rate, MS2-Status-Code must name both a non-error code and an error code, separated by a comma.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A partner must try the mock without an Anypoint login. What should you do?',
      options: [
        'Turn on Make Public in the Mocking Service Configuration, and optionally set an expiration date',
        'Send the partner the internal URL, which needs no authorization',
        'Give the partner an Anypoint account with the Design Center Developer permission',
        'Deploy the spec to CloudHub 2.0',
      ],
      answer: 0,
      explain: 'The internal URL needs authorization headers. A public URL needs none. If you disable the public URL it becomes invalid, and enabling it again gives a different URL.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Which statements about dependencies in an API project are correct?',
      options: [
        'You can add RAML fragments, OAS components, JSON schemas and rulesets as dependencies',
        'Dependencies are referenced from Exchange, so you cannot edit them directly in the project',
        'A project can have up to 100 dependencies',
        'An exported project contains the referenced dependencies in its ZIP file',
        'Editing a dependency in another editor is the recommended way to update it',
      ],
      answer: [0, 1, 2, 3],
      explain: 'If you edit referenced dependencies in another editor and import the project again, the import fails. In the Files pane they appear under exchange_modules, by group ID, asset ID and version.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A team has an OAS 3.0 spec, and another team needs a RAML 1.0 copy for its tools. What is a documented way to provide it?',
      options: [
        'In API Designer, use Duplicate on the file, select RAML, set the RAML file as the root file and publish',
        'Rename the file extension to .raml',
        'API Designer cannot produce RAML from OAS',
        'Set the Exchange asset type to RAML after publishing',
      ],
      answer: 0,
      explain: 'Duplicate As RAML is the documented path. Asset type cannot change after an asset is created, so changing it later is not an option.',
    },
  ],
  description: `
A bank's **Loan Status API** spec is being designed in API Designer. The mobile team starts next week, three weeks before the implementation exists. The mobile team's lead asks these questions:

- "Our client must handle 401, 404, 429 and 503. The mock only ever returns 200. How do we test the other paths?"
- "We need to test our 3-second timeout."
- "An external agency builds our screens and has no Anypoint login."
- "The spec has three example loans. How do we choose one?"

Meanwhile the API team has two problems of its own:
- A developer exported the project, edited a shared \`error-types\` fragment in VS Code, and now cannot import it again.
- Another team wants a RAML copy of the spec, which is OAS 3.0.

**Questions**
1. Where does the mock's response come from, and what is the default choice?
2. Show how to test each case on the mobile lead's list.
3. What is the difference between the internal and the public mock URL?
4. How do dependencies work, and why did the import fail?
5. How do you share an OAS 3.0 spec as RAML?
`,
  answerTemplate: `## Source of mock responses

## Testing each case

## Internal and public URLs

## Dependencies

## Sharing as RAML
`,
  keyPoints: [
    'The mocking service returns the status codes and example payloads defined in the spec. It can run in API Designer before publishing, and in Exchange after publishing.',
    'By default it returns the lowest status code defined for the method.',
    'Behavioral headers change this: MS2-Status-Code, MS2-Error-Rate, MS2-Error-Level, MS2-Status-Code-Selection, MS2-Delay, MS2-Example, MS2-Randomize.',
    'MS2-Status-Code with MS2-Error-Rate needs both a non-error and an error code, such as 201,401.',
    'MS2-Delay has a maximum of 10000 ms; a range wholly above that returns an error.',
    'The internal URL needs authorization headers. A public URL does not, can have an expiration date, and changes if it is disabled and enabled again.',
    'Dependencies are references to Exchange assets, up to 100 per project, shown under exchange_modules. They cannot be edited in the project.',
    'Duplicate As RAML gives a RAML copy of an OAS 3.0 spec. Exchange also generates RAML for OAS assets and OAS 2.0 for RAML assets.',
  ],
  solution: `
**1. Source of responses.** The mock returns the HTTP status codes and example payloads defined in the spec. By default it picks the lowest status code for the method, so a mock with 200 and 404 returns 200.

**2. Testing each case.** Each error must be defined in the spec, because \`MS2-Status-Code\` filters the codes defined for the method.
| Need | Header |
|---|---|
| Return 404 | \`MS2-Status-Code: 404\` |
| Mix of success and errors | \`MS2-Error-Rate: 0.3\` with \`MS2-Status-Code: 200,503\` |
| The first 5XX defined, at the given rate | \`MS2-Error-Level: SERVER_ONLY\` with \`MS2-Error-Rate\` |
| Random status | \`MS2-Status-Code-Selection: RANDOM\` |
| Timeout test | \`MS2-Delay: 4000\`; the maximum is 10000 ms |
| One named example | \`MS2-Example: approved\` |
| No example in the spec | \`MS2-Randomize: true\`; values respect the type's constraints |

\`MS2-Error-Level\` accepts \`REQUEST_ONLY\` (4XX), \`SERVER_ONLY\` (5XX) and \`ALL\` (the default), and the values are case-sensitive. A value for \`MS2-Example\` that is not a defined example returns an error.

The delay can be longer than requested because of network latency, so treat it as a rough test. The page's text on small MS2-Delay values is not fully consistent, so check the real delay with one call.

**3. Internal and public URLs.** The internal URL needs authorization headers in the request. To share without a login, open **Mocking Service Configuration** and turn on **Make Public**. You can set an expiration date. If you turn it off, that URL stops working, and turning it on again creates a different URL, so the agency would need the new one. In Exchange, the API console shows two URLs: the public one also used in Design Center, and one that requires authentication.

**4. Dependencies.** A project can depend on RAML fragments, OAS components, JSON schemas and rulesets from Exchange. They appear in \`exchange_modules\`, in folders that match the asset's GAV. You cannot edit them directly in the project. The import failed because the docs warn that you must not edit referenced dependencies in another editor: the import of the project then fails.

To change \`error-types\`, open the fragment's own project, publish a new version, and update the version in each dependent project. Limits: 100 dependencies per project, and at most 1,000 files and 300 MB for dependencies. Studio does not support OAS 3.0 fragments.

**5. Sharing as RAML.** Import or open the OAS 3.0 spec, use **Duplicate** on the file and select **RAML**, set the RAML file as the root file, and publish. For the OAS 2 case, the docs suggest downloading the spec and converting it with a separate tool. Also, Exchange automatically generates RAML versions of OAS assets and OAS 2.0 versions of RAML assets published since January 2019.
`,
  followUps: [
    {
      q: 'What does MS2-Strict-Model-Validation do?',
      a: 'Set to true, the mock validates the spec first and fails with any error found. Set to false, you can use the mock even when the spec has errors. It helps with specs written before the stricter parser of January 2019.',
    },
    {
      q: 'Text editor or visual editor?',
      a: 'The visual editor suits cases where you do not need RAML fragments, and it can scaffold a spec to finish in the text editor. The text editor has a context-aware shelf, fragments, and ruleset validation.',
    },
    {
      q: 'Is Flow Designer still part of Design Center?',
      a: 'No. The Design Center page says Flow Designer is end of life, and its documentation has moved to an archive. Design Center today means API Designer.',
    },
    {
      q: 'Can you use callbacks from OAS 3.0 in an API instance?',
      a: 'The API instance page notes that the OAS callback feature is not supported. Handle callbacks outside the Mule runtime domain, or use a spec without them.',
    },
  ],
}
