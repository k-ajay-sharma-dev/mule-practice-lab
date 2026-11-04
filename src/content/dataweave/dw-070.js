export default {
  id: 'dw-070',
  category: 'dataweave',
  title: 'Extract a SOAP Response Body into JSON',
  level: 'INTERMEDIATE',
  tags: ['xml', 'json', 'namespaces', 'soap', 'fault-handling'],
  estMinutes: 25,
  description: `
A Mule experience API calls a legacy CRM web service (SOAP 1.1) and must return clean JSON to a mobile app. Different releases of the CRM generate **different namespace prefixes** (\`soapenv\`/\`cus\` in one, \`S\`/\`ns2\` in another), but the namespace URIs never change:
- SOAP envelope: \`http://schemas.xmlsoap.org/soap/envelope/\`
- CRM: \`http://example.com/crm/customer/v1\`

**Success response** → \`{ traceId, customer }\`
- \`traceId\` is the \`TraceId\` element in the SOAP **Header** (\`null\` when there is no header).
- \`customer\`: \`id\` and \`status\` (attributes of \`Customer\`), \`name\`, \`segment\`, \`creditLimit\` (number) and \`currency\` (attribute of \`CreditLimit\`), and \`addresses\` — always an array of \`{ type, street, city }\`.

**SOAP Fault** → \`{ traceId, fault: { code, message } }\` from \`faultcode\` and \`faultstring\` (these two child elements of \`Fault\` are **not** namespace-qualified in SOAP 1.1).
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/xml',
      content: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cus="http://example.com/crm/customer/v1">
  <soapenv:Header>
    <cus:TraceId>7f3c9a10-2b44-4c1e-9d1f-55e0c1a2b7aa</cus:TraceId>
  </soapenv:Header>
  <soapenv:Body>
    <cus:GetCustomerResponse>
      <cus:Customer id="C-100482" status="ACTIVE">
        <cus:Name>Hendriks Installatietechniek BV</cus:Name>
        <cus:Segment>SME</cus:Segment>
        <cus:CreditLimit currency="EUR">25000.00</cus:CreditLimit>
        <cus:Addresses>
          <cus:Address type="BILLING">
            <cus:Street>Stationsweg 12</cus:Street>
            <cus:City>Zwolle</cus:City>
          </cus:Address>
          <cus:Address type="SHIPPING">
            <cus:Street>Industrieweg 4</cus:Street>
            <cus:City>Kampen</cus:City>
          </cus:Address>
        </cus:Addresses>
      </cus:Customer>
    </cus:GetCustomerResponse>
  </soapenv:Body>
</soapenv:Envelope>`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "traceId": "7f3c9a10-2b44-4c1e-9d1f-55e0c1a2b7aa",
  "customer": {
    "id": "C-100482",
    "status": "ACTIVE",
    "name": "Hendriks Installatietechniek BV",
    "segment": "SME",
    "creditLimit": 25000.00,
    "currency": "EUR",
    "addresses": [
      { "type": "BILLING", "street": "Stationsweg 12", "city": "Zwolle" },
      { "type": "SHIPPING", "street": "Industrieweg 4", "city": "Kampen" }
    ]
  }
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Declare the namespaces with your own prefixes: `ns soap http://schemas.xmlsoap.org/soap/envelope/` and `ns cus http://example.com/crm/customer/v1`.',
    'Select with `prefix#name`: `payload.soap#Envelope.soap#Body`. DataWeave matches on the URI, so it does not matter which prefix the document uses.',
    'Check for a fault first: `body.soap#Fault != null`. `faultcode` and `faultstring` are selected without a namespace.',
    'Use `.*cus#Address default []` so that one address or none still gives an array.',
  ],
  solution: `%dw 2.0
output application/json
ns soap http://schemas.xmlsoap.org/soap/envelope/
ns cus http://example.com/crm/customer/v1
var env = payload.soap#Envelope
var body = env.soap#Body
var traceId = env.soap#Header.cus#TraceId
var fault = body.soap#Fault
---
if (fault != null)
  {
    traceId: traceId,
    fault: { code: fault.faultcode, message: fault.faultstring }
  }
else do {
  var c = body.cus#GetCustomerResponse.cus#Customer
  ---
  {
    traceId: traceId,
    customer: {
      id: c.@id,
      status: c.@status,
      name: c.cus#Name,
      segment: c.cus#Segment,
      creditLimit: c.cus#CreditLimit as Number,
      currency: c.cus#CreditLimit.@currency,
      addresses: (c.cus#Addresses.*cus#Address default []) map (a) -> {
        "type": a.@"type",
        street: a.cus#Street,
        city: a.cus#City
      }
    }
  }
}`,
  explanation: `
**Prefixes are aliases, URIs are identity.** \`soapenv:Envelope\` and \`S:Envelope\` are the same element when both prefixes are bound to the same URI. By declaring your own \`ns\` prefixes and selecting with \`soap#Envelope\`, the mapping keeps working when a new CRM release (or a different SOAP stack such as JAX-WS, which typically emits \`S\` and \`ns2\`) changes the prefixes. A mapping that compares prefixed names as strings breaks on such a release.

**Faults are data too.** In SOAP 1.1 a fault comes back in the Body (normally with HTTP 500). When the Web Service Consumer raises it as an error, the fault details are still in the error payload; checking for \`soap#Fault\` first gives the mobile app a clean, predictable error object. Note that \`faultcode\` and \`faultstring\` are unqualified, so they are selected without a prefix.

**Navigation through optional parts.** If there is no Header, \`env.soap#Header\` is \`null\` and selecting \`cus#TraceId\` on it also gives \`null\` — no error, so \`traceId\` is simply \`null\`.

**Repeating elements.** \`.*cus#Address\` with \`default []\` guarantees an array for zero, one or many addresses.
`,
  tests: [
    {
      name: 'Different prefixes, no header, one address',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><ns2:GetCustomerResponse xmlns:ns2="http://example.com/crm/customer/v1"><ns2:Customer id="C-200017" status="BLOCKED"><ns2:Name>Peters Bouw</ns2:Name><ns2:Segment>SMALL</ns2:Segment><ns2:CreditLimit currency="EUR">0</ns2:CreditLimit><ns2:Addresses><ns2:Address type="BILLING"><ns2:Street>Markt 1</ns2:Street><ns2:City>Deventer</ns2:City></ns2:Address></ns2:Addresses></ns2:Customer></ns2:GetCustomerResponse></S:Body></S:Envelope>',
        },
      ],
      expected:
        '{ "traceId": null, "customer": { "id": "C-200017", "status": "BLOCKED", "name": "Peters Bouw", "segment": "SMALL", "creditLimit": 0, "currency": "EUR", "addresses": [ { "type": "BILLING", "street": "Markt 1", "city": "Deventer" } ] } }',
    },
    {
      name: 'SOAP Fault',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:crm="http://example.com/crm/customer/v1"><soap:Header><crm:TraceId>a1b2c3d4</crm:TraceId></soap:Header><soap:Body><soap:Fault><faultcode>soap:Client</faultcode><faultstring>Customer C-999999 not found</faultstring></soap:Fault></soap:Body></soap:Envelope>',
        },
      ],
      expected: '{ "traceId": "a1b2c3d4", "fault": { "code": "soap:Client", "message": "Customer C-999999 not found" } }',
    },
  ],
  followUps: [
    {
      q: 'Why is `payload.Envelope.Body` (without namespaces) a risky shortcut?',
      a: 'A selector without a namespace matches on the local name only, so it would also match an element with the same name in another namespace. It usually works, but with namespaced vocabularies (SOAP, UBL, ISO 20022) explicit namespaces make the mapping precise and self-documenting.',
    },
    {
      q: 'Where does the SOAP 1.2 fault differ?',
      a: 'SOAP 1.2 uses the envelope namespace `http://www.w3.org/2003/05/soap-envelope` and a different fault structure (`Code/Value`, `Reason/Text`, namespace-qualified). A mapping that supports both needs both namespaces and both fault shapes.',
    },
  ],
}
