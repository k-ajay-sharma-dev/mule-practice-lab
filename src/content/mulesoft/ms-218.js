export default {
  id: 'ms-218',
  category: 'mulesoft',
  title: 'Web Service Consumer: Calling a SOAP Service from Mule 4',
  level: 'INTERMEDIATE',
  tags: ['soap', 'web-service-consumer', 'wsdl', 'xml', 'error-handling', 'connectors', 'utilities'],
  estMinutes: 20,
  quiz: [
    {
      type: 'multi',
      prompt: 'Which values do you set in the connection of a Web Service Consumer configuration? Choose all that apply.',
      options: ['The WSDL location', 'The service', 'The port', 'The SLA tier of the client'],
      answer: [0, 1, 2],
      explain: 'The connection points at a WSDL and picks a service and a port from it. The address can be read from the WSDL or set per environment. SLA tiers belong to API Manager, not to the connector.',
    },
    {
      type: 'single',
      prompt: 'The water company\'s SOAP service has an operation `GetMeterReading`. How does the Consume operation know what to send?',
      options: [
        'It builds the XML body itself from the variables in the flow',
        'You name the operation and build the body element in DataWeave',
        'It sends the JSON payload, and the service turns it into XML',
        'You name the operation, and it sends the WSDL example as the body',
      ],
      answer: 1,
      explain: 'Consume needs the operation name and a body that fits the WSDL. A Transform with `output application/xml` and the right namespace builds that element. DataSense can show the expected structure.',
    },
    {
      type: 'single',
      prompt: 'After Consume succeeds, where is the content of the SOAP response body?',
      options: [
        'Directly in `payload`, with the SOAP envelope removed',
        'In `attributes.body`, with the SOAP headers beside it',
        'In `vars.soapResponse`, which Consume sets for you',
        'In `payload.body`, next to the headers and attachments',
      ],
      answer: 3,
      explain: 'The Consume result has three parts: `payload.body`, `payload.headers` and `payload.attachments`. Read the response element from `payload.body`.',
    },
    {
      type: 'single',
      prompt: 'The service answers with a SOAP fault for an unknown meter. Which error does the flow see?',
      options: ['`HTTP:INTERNAL_SERVER_ERROR`', '`WSC:SOAP_FAULT`', '`MULE:EXPRESSION`', '`WSC:CONNECTIVITY`'],
      answer: 1,
      explain: 'A SOAP fault raises `WSC:SOAP_FAULT`. Handle it on its own, because a business fault such as an unknown meter needs a different answer than a network problem.',
    },
    {
      type: 'single',
      prompt: 'The service needs a WS-Security username token on every call. Where is it set?',
      options: [
        'In the Web Service Consumer configuration, as web service security',
        'In an HTTP header named Authorization on each Consume',
        'In the DataWeave body, as a field of the request element',
        'In API Manager, as a policy on the SOAP service',
      ],
      answer: 0,
      explain: 'The connector configuration has web service security settings, such as a username token and a timestamp. It adds them to the SOAP header of each call, so the flows stay clean.',
    },
    {
      type: 'order',
      prompt: 'Put the steps of a typical call in order.',
      items: [
        'Build the request element in DataWeave as XML',
        'Run Consume with the operation name',
        'Read the response element from payload.body',
        'Map it to the JSON the caller expects',
      ],
      explain: 'Build the body, call the operation, take the body from the result, and turn it into the shape your API returns.',
    },
  ],
  description: `
Riverwell Water reads customer meters through an old SOAP service. A new mobile app needs the latest reading as JSON. You are building a Mule 4 System API in front of the SOAP service with the **Web Service Consumer** connector.

The SOAP team gives you a WSDL, a test address and a production address, and a service account that must be sent as a WS-Security username token. An unknown meter number returns a SOAP fault.

**Questions**
1. How do you configure the connector, and how do you keep the address different per environment?
2. How do you build the request and read the response?
3. How do you handle SOAP faults and other errors?
4. What would you test before go-live?
`,
  answerTemplate: `## Configuration

## Request and response

## Errors

## Testing
`,
  keyPoints: [
    'The configuration points at a WSDL and picks a service and a port. The address can be overridden with a property per environment.',
    'Keep a copy of the WSDL in the project so the app does not depend on fetching it at start.',
    'Consume names the operation. The body is an XML element built in DataWeave with the namespace from the WSDL.',
    'The result has body, headers and attachments. Read the response from payload.body.',
    'WS-Security, such as a username token, is set once in the configuration.',
    'A SOAP fault raises WSC:SOAP_FAULT. Map business faults to a 4xx and connection problems to a 5xx.',
  ],
  solution: `
**1. Configuration.** Create a Web Service Consumer configuration with the WSDL location, the service and the port. Put a copy of the WSDL in \`src/main/resources\` so start-up does not depend on the SOAP server. Set the address from a property, such as \`\${meter.soap.address}\`, so test and production differ only in their property files. Add web service security with a username token. The password comes from a secure property, never from the file.

**2. Request and response.**
\`\`\`
%dw 2.0
output application/xml
ns m http://example.com/meters
---
{ m#GetMeterReading: { m#meterId: attributes.uriParams.meterId } }
\`\`\`
Consume runs \`GetMeterReading\`. The result holds \`body\`, \`headers\` and \`attachments\`. A second Transform reads \`payload.body\` and maps it to the JSON for the app.

**3. Errors.**
| Error | Answer to the app |
|---|---|
| \`WSC:SOAP_FAULT\` for an unknown meter | 404 with a clear message |
| \`WSC:SOAP_FAULT\` for other faults | 502, and log the fault details |
| Connection problems and timeouts | 503 or 504, safe to retry |

Read the fault code before you decide, because one error type covers every fault the service sends.

**4. Testing.** Use MUnit to mock Consume with a normal response and with a fault, so both paths run without the real service. Then test against the SOAP test address: a known meter, an unknown meter, a wrong password and a slow answer.
`,
  followUps: [
    {
      q: 'Why not call the SOAP service with the HTTP Request connector and a hand-built envelope?',
      a: 'It works, but you then write the envelope, the security header and the fault handling yourself. The Web Service Consumer reads the WSDL, adds WS-Security and raises typed errors, which is less code to get wrong.',
    },
    {
      q: 'The SOAP team changes the WSDL. What do you do?',
      a: 'Replace the copy in the project, refresh the metadata, and run the MUnit tests. A new optional element is usually harmless. A renamed element or namespace breaks the request or the mapping.',
    },
    {
      q: 'Should the app see SOAP field names?',
      a: 'No. The System API turns the SOAP response into a clean JSON contract. If the SOAP service is replaced later, only the System API changes.',
    },
  ],
}
