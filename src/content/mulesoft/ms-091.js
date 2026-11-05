export default {
  id: 'ms-091',
  category: 'mulesoft',
  title: 'Workday Connector: Web Services, Authentication and Integration System Users',
  level: 'INTERMEDIATE',
  tags: ['workday', 'soap', 'hcm', 'authentication', 'integration-system-user', 'security'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'How does a Mule flow call the Workday operation `Get_Workers`?',
      options: [
        'With the Human Resources operation of the connector, setting its Operation field to `Get_Workers` and sending the SOAP request XML as Content',
        'With a dedicated `workday:get-workers` element that takes a worker ID attribute',
        'With an HTTP Request to the Workday REST API, because the connector has no worker operations',
        'With the On Modified Objects source, which is the only way to read workers',
      ],
      answer: 0,
      explain: 'The connector has one operation per Workday web service, such as `workday:human-resources`. The Operation parameter picks the operation of that service, and Content defaults to `#[payload]`.',
    },
    {
      type: 'match',
      detail: true,
      needsScenario: true,
      prompt: 'Match each need to the connector operation that invokes the right web service.',
      pairs: [
        ['Read employee and organization data', 'Human Resources'],
        ['Create a position, as in the connector example', 'Recruiting'],
        ['Add a fund with Put_Fund, as in the connector example', 'Financial Management'],
        ['Import time and work schedule information', 'Time Tracking'],
      ],
      explain: 'Work out which service owns the operation first. The Operation field is then populated from the metadata of that service.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Which connection types does the Workday Connector configuration offer?',
      options: [
        'Basic Authentication, OAuth Code Authentication and x.509 Authentication',
        'Basic Authentication and API key only',
        'OAuth Client Credentials and JWT only',
        'Kerberos and SAML',
      ],
      answer: 0,
      explain: 'All three need a tenant name. x.509 also needs a user name, key store path and alias, and OAuth Code needs a consumer key and secret plus a listener configuration.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'With OAuth Code Authentication, the State field looks optional. What should you do?',
      options: [
        'Set it: Workday requires the parameter, and omitting it causes an authorization error',
        'Leave it empty, because the connector generates one',
        'Leave it empty, because only x.509 uses it',
        'Put the tenant name in the Scopes field instead',
      ],
      answer: 0,
      explain: 'The reference notes that although the State parameter is optional in the connector, Workday requires it.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'The Host name field is left empty on a connection to a production tenant. Why is that a risk?',
      options: [
        'It defaults to `impl-cc.workday.com`, so you must enter the Workday cloud server of your own tenant',
        'The connector finds the host from the tenant name automatically',
        'An empty host makes the connector use a local mock service',
        'Host name only applies to x.509 connections',
      ],
      answer: 0,
      explain: 'The default is a fixed host. The docs describe the field as the host name of one of Workday\'s cloud servers, so set it per environment through a property.',
    },
    {
      type: 'multi',
      prompt: 'A Mule integration connects to Workday with an integration system user (ISU), a dedicated non-human account. Which three practices fit an ISU?',
      options: [
        'One ISU per integration, so that access and audit stay separate',
        'A security group that has only the domain permissions needed',
        'No UI sessions allowed for the account',
        'One ISU shared by all integrations, so there is one password to change',
        'The account of an HR administrator, because it already has access',
      ],
      answer: [0, 1, 2],
      explain: 'An ISU is a non-human account with least-privilege access through a security group and domain security policies. After changing domain permissions, activate pending security policy changes. A shared account has the combined permissions of every integration, and audit cannot separate their activity. A person\'s account changes with that person\'s job and may leave with them. The connector docs only say the service account must have the required permissions.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'What does Watermark Enabled do on the On Modified Objects source?',
      options: [
        'If true, Mule processes an item just once, even if it receives the item multiple times; the default is false',
        'It is on by default and cannot be turned off',
        'It sets the Updated From date of the Workday request',
        'It makes the source run only on the primary node',
      ],
      answer: 0,
      explain: 'With the default of false, an item received more than once is processed more than once.',
    },
  ],
  description: `
A healthcare group with **22,000 workers** moves HR to **Workday**. Mule must connect Workday to the identity platform, the payroll provider and the finance data warehouse.

**Requirements**
- Read worker data and react to joiners, movers and leavers.
- Create positions from a workforce planning tool.
- Separate access per integration, because audit requires it.
- Three tenants: implementation, sandbox and production.

The team has not used Workday before and asks how the connector is organised, how to authenticate, and what the Workday administrators must set up.

**Questions**
1. How is the connector organised around Workday web services? What does a call look like?
2. Which authentication options exist, and which do you choose?
3. What is an integration system user, and how do you set one up?
4. How do you configure the connector for several tenants?
5. Which errors and limits do you plan for?
`,
  answerTemplate: `## Connector structure

## Authentication

## Integration system user

## Tenants and environments

## Errors and limits
`,
  keyPoints: [
    'One connector operation per Workday web service (Human Resources, Staffing, Recruiting, Payroll and more). The Operation field selects the SOAP operation, and Content carries the request XML in the urn:com.workday/bsvc namespace.',
    'Output is binary XML with SOAP attributes. The On Modified Objects source supports WORKERS, POSITIONS, JOB_PROFILES, JOB_REQUISITIONS and EVERGREEN_REQUISITIONS.',
    'Connections: Basic Authentication, OAuth Code Authentication (State is required by Workday) and x.509.',
    'Tenant name is required; the docs say it usually has the suffix pt1, such as acme_pt1. Host name defaults to impl-cc.workday.com.',
    'An ISU is a dedicated non-human account in an integration system security group, with only the domain permissions it needs; security policy changes must be activated.',
    'The service account must have the required permissions on the service it calls.',
    'Errors: WORKDAY:BAD_REQUEST, CONNECTIVITY, PROCESSING_ERROR, RETRY_EXHAUSTED and VALIDATION_ERROR. Response Timeout defaults to 60 seconds.',
  ],
  solution: `
**1. Connector structure.** Each Workday web service is one connector operation: \`workday:human-resources\`, \`workday:staffing\`, \`workday:recruiting\`, \`workday:payroll\`, \`workday:financial-management\` and so on. The \`operation\` attribute picks the SOAP operation, and its list is filled from the loaded metadata.
\`\`\`xml
<workday:financial-management config-ref="My_Workday_Connection" operation="Put_Fund"/>
\`\`\`
The payload is the request XML in the namespace \`urn:com.workday/bsvc\`, usually built in a Transform Message. References use typed IDs, such as \`<ns0:ID ns0:type="Organization_Reference_ID">\`. The response comes back as binary XML with SOAP attributes.

**2. Authentication.**
- **Basic:** tenant name, user name and password. It is simple and common for system integrations with an ISU.
- **x.509:** tenant, user name, key store path and alias. It avoids a shared password, but the certificate must be managed. Note the defaults \`RSA_SHA1\` for the signature and \`SHA256\` for the digest, and check them against your security policy.
- **OAuth Code:** delegated user authentication, with a consumer key and secret and a listener for the callback. Workday requires State.

For server-to-server integrations with no user present, choose Basic or x.509 with an ISU. Keep secrets in secure properties.

**3. Integration system user.** This is general Workday administration, and the connector docs only say that the service account needs the required permissions.
- Create an **integration system user** for each integration, and do not allow UI sessions.
- Create an **integration system security group** and add the ISU to it.
- Grant the group only the **domain security policy** permissions it needs (Get, Put, View or Modify).
- Run **Activate Pending Security Policy Changes**.

**4. Tenants and environments.** Use one property file per environment with the tenant name, host name and credentials. Do not rely on the default host \`impl-cc.workday.com\`. Set **Time Zone** deliberately (default \`UTC\`, format \`UTC+01:00\`). Use **Test Connection** before the first run.

**5. Errors and limits.** Handle \`WORKDAY:VALIDATION_ERROR\` and \`WORKDAY:BAD_REQUEST\` as data or request problems that a retry will not fix, and use a reconnection strategy for \`WORKDAY:CONNECTIVITY\`. Response Timeout defaults to 60 seconds, so review it for large reads. Page large reads such as \`Get_Workers\` with \`Response_Filter\` (\`Page\` and \`Count\`) instead of requesting everything at once.
`,
  followUps: [
    {
      q: 'Why not use one shared ISU for all integrations?',
      a: 'A shared account has the combined permissions of every integration. A password change then affects all of them, and audit cannot separate their activity. One ISU per integration keeps least privilege and a clear audit trail.',
    },
    {
      q: 'When would you use Workday Report-as-a-Service (RaaS) instead of the web services?',
      a: 'When a custom report already joins the fields you need, an HTTP call to the report can be simpler than a large Get_Workers mapping. The report owner then becomes a dependency, so the report needs change control.',
    },
    {
      q: 'What does the Workday Connector\'s Unauthorize operation do?',
      a: 'It deletes the access token information for a given resource owner ID, so that the user cannot run operations until they authorize again. It belongs to the OAuth Code connection.',
    },
  ],
}
