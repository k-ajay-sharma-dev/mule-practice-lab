export default {
  id: 'ms-055',
  category: 'mulesoft',
  title: 'Reuse Across Layer Apps: APIkit for SOAP, a Shared Parent POM and a Common Error-Handling Plugin',
  level: 'ADVANCED',
  tags: ['api-led', 'apikit', 'soap', 'maven', 'parent-pom', 'error-handling', 'reuse'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'The legacy partner\'s WSDL has three operations: `GetOrder`, `CancelOrder` and `ListOrders`. What does APIkit for SOAP scaffold from it?',
      options: [
        'One flow with a Choice that branches on the SOAPAction header',
        'Three flows, one per operation, each with its own HTTP Listener',
        'A router flow, plus one flow per XSD type that the operations use',
        'A router flow, plus one flow for each of the three operations',
      ],
      answer: 3,
      explain: 'It produces a router flow plus one flow per WSDL operation. Same idea as APIkit for REST (a contract-driven router plus scaffolded flows), but with a WSDL as the contract. The router dispatches by operation, so no Choice is needed. There is one listener, in the router flow, and flows follow operations, not XSD types.',
    },
    {
      type: 'single',
      prompt: 'The REST Orders Process API returns a 404 JSON error. What should the SOAP Experience API return to the legacy partner?',
      options: [
        'The JSON error body unchanged, with status 404',
        'A SOAP Fault with a code and detail',
        'An empty SOAP response with HTTP 200',
        'A normal SOAP response with an `error` element',
      ],
      answer: 1,
      explain: 'SOAP clients expect the SOAP error model, so a normal response with an error element would look like success to them. Map the Process API\'s error responses into faults in the error handler.',
    },
    {
      type: 'single',
      prompt: 'Twenty-five Mule apps pin different versions in their own `pom.xml`, so a shared parent POM is created to centralise them. Which item stays in each app and not in the parent?',
      options: [
        'The app\'s `artifactId` and API spec dependency',
        'Mule runtime, `mule-maven-plugin` and MUnit versions',
        'Connector versions in `dependencyManagement`',
        'Repositories and Exchange `distributionManagement`',
      ],
      answer: 0,
      explain: 'Apps keep their own identity, the dependencies they actually use (versions inherited), their spec dependency and app-specific settings. The parent holds the Mule runtime, `mule-maven-plugin` and MUnit versions, connector and common-library versions in `dependencyManagement`, plugin configuration such as MUnit coverage thresholds, and repositories and Exchange `distributionManagement`.',
    },
    {
      type: 'order',
      needsScenario: true,
      prompt: 'Order the steps to adopt the common error-handling library in an app.',
      items: [
        'Package the shared project as a mule-plugin and publish it to Exchange',
        'Add the dependency with `<classifier>mule-plugin</classifier>` in the app',
        'Import the shared XML with `<import file="common-error-handler.xml"/>`',
        'Reference it with `<configuration defaultErrorHandler-ref="common-error-handler"/>`',
      ],
      explain: 'The app can still declare local handlers for app-specific errors and fall back to the shared one.',
    },
    {
      type: 'single',
      prompt: 'Why not share the error handler through a Mule **domain**?',
      options: [
        'Domains were removed from the Mule 4 runtime',
        'Domains are on-prem only and cannot share handlers',
        'Domains share handlers, but only on CloudHub 1.0',
        'Domain projects cannot be versioned in Maven',
      ],
      answer: 1,
      explain: 'Domains share connector configurations among apps on the same on-prem runtime only. They are not available on CloudHub and do not share error handlers or flows. A mule-plugin library works on every deployment target.',
    },
    {
      type: 'match',
      prompt: 'Match each change to the shared library to its version bump.',
      pairs: [
        ['Fix a bug in correlation-ID logging', 'Patch'],
        ['Add a mapping for a new error type', 'Minor'],
        ['Change the error JSON shape', 'Major'],
      ],
      explain: 'Changing the error shape changes the contract of every API using the library, so it is a major.',
    },
  ],
  description: `
Your API-led estate has 25 Mule apps. Observations:

- A legacy partner can only call **SOAP**, so a **Partner Orders SOAP Experience API** is required in front of the existing REST Orders Process API.
- Each project's \`pom.xml\` pins different versions of the Mule runtime, \`mule-maven-plugin\`, MUnit and connectors.
- Every app has its own copy of a global error handler; they return different error JSON shapes and some leak stack traces.
- Logging and correlation-ID handling is copy-pasted inconsistently.

**Questions**
1. How does APIkit for SOAP work, and how does it compare with APIkit for REST?
2. Design a **shared parent POM**: what goes in it, what stays in each app?
3. Design a **common error-handling library** that every layer app reuses. How is it packaged, published and imported?
4. How do you version and roll out changes to these shared assets without breaking 25 apps?
`,
  answerTemplate: `## APIkit for SOAP

## Shared parent POM

## Common error-handling library

## Versioning and rollout
`,
  keyPoints: [
    'APIkit for SOAP scaffolds from a WSDL: a router flow plus one flow per operation; the implementation maps SOAP to the REST Process API and builds SOAP Faults for errors.',
    'A parent POM centralises versions (runtime, mule-maven-plugin, MUnit, connectors), plugin configuration, repositories and Exchange distributionManagement; apps keep their own artifactId, dependencies and app-specific settings.',
    'Common Mule config (error handler, logging, correlation) can be packaged as a mule-plugin library, published to Exchange and pulled in as a Maven dependency with classifier mule-plugin.',
    'Apps import the shared XML with <import file="..."/> and reference the shared handler, e.g. as the default error handler.',
    'Shared assets follow semantic versioning; apps upgrade explicitly, with CI validating each app against the new version before rollout.',
  ],
  solution: `
**APIkit for SOAP**
- Input: a **WSDL** (from Exchange or local). Scaffolding generates an HTTP Listener + \`apikit-soap\` router flow, plus one flow per WSDL operation (named after the operation and the SOAP router config).
- The router validates the SOAP envelope against the WSDL/XSD and dispatches to the operation flow.
- Each operation flow transforms the SOAP body (XML) into the REST Process API's request with DataWeave and calls it with HTTP Request. It then maps the JSON response back to the SOAP response element.
- Errors must be returned as **SOAP Faults** (with a fault code and detail), not JSON. Map the Process API's error responses into faults in the error handler.
- Compared with REST: same idea (contract-driven router + scaffolded flows), different contract language and error model. Policies in API Manager can still be applied (e.g. client ID via headers, IP allowlist).

**Shared parent POM**
\`\`\`xml
<project>
  <groupId>ORG_ID</groupId>
  <artifactId>acme-mule-parent</artifactId>
  <version>2.3.0</version>
  <packaging>pom</packaging>
  <properties>
    <app.runtime>4.x.y</app.runtime>
    <mule.maven.plugin.version>x.y.z</mule.maven.plugin.version>
    <munit.version>x.y.z</munit.version>
  </properties>
  <!-- dependencyManagement: connector + common-library versions -->
  <!-- pluginManagement: mule-maven-plugin, munit-maven-plugin
       (coverage thresholds), deployment defaults -->
  <!-- repositories + distributionManagement: Exchange Maven repo -->
</project>
\`\`\`
Each app declares \`<parent>\` and keeps: its \`artifactId\`/version, the dependencies it actually uses (versions inherited), its API spec dependency, and app-specific deployment settings. The parent itself is published to Exchange (or an internal Maven repository) and versioned.

**Common error-handling library**
- Create a small Mule project containing \`common-error-handler.xml\` (a named global \`error-handler\` with On Error Propagate entries for \`APIKIT:*\`, \`HTTP:*\`, connectivity and \`ANY\`). It also contains a shared DataWeave module that builds the standard error body \`{ code, message, correlationId }\`, and logging/correlation-ID sub-flows.
- Package it as a **mule-plugin** and publish to Exchange with \`mvn deploy\`.
- In each app: add the dependency with \`<classifier>mule-plugin</classifier>\`, then
\`\`\`xml
<import file="common-error-handler.xml" doc:name="Import common error handler" />
<configuration defaultErrorHandler-ref="common-error-handler" />
\`\`\`
- Apps can still add local handlers for app-specific error types and fall back to the shared one. Stack traces never leave the service. The shared module logs details and returns only a safe message plus correlation ID.
- For the SOAP EAPI, keep a SOAP-fault variant of the handler in the same library.

**Versioning and rollout**
- Semantic versions for parent POM and library. Bug fixes → patch; new error mappings → minor; changing the error JSON shape → major (it changes the contract of every API).
- Apps upgrade by bumping a version; a pipeline (or a bot opening merge requests) updates apps, runs MUnit and deploys to Dev first.
- Keep a changelog in the Exchange asset documentation and deprecate old versions rather than deleting them.
`,
  followUps: [
    {
      q: 'Why not use a Mule domain to share the error handler?',
      a: 'Domains share connector configurations among apps on the same on-prem runtime only, and aren\'t available on CloudHub; they also don\'t share error handlers or flows. A mule-plugin library works on every deployment target.',
    },
    {
      q: 'Can a Process API reuse the same library as a System API?',
      a: 'Yes. Cross-cutting concerns (error shape, logging, correlation IDs) are deliberately identical across layers; layer-specific behaviour stays in each app.',
    },
    {
      q: 'What is the risk of putting too much in the parent POM?',
      a: 'Every app inherits it, so a forced upgrade of a connector or plugin hits all 25 apps at once; keep it to versions and standard plugin config, not dependencies apps may not need.',
    },
  ],
}
