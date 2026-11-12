import { design, flow, handler, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-075',
  category: 'flows',
  title: 'Partner XML Orders: XSD Validation and an Existing XSLT for the Legacy ERP',
  level: 'INTERMEDIATE',
  tags: ['xml', 'xsd', 'xslt', 'xpath', 'http', 'validation', 'legacy-erp'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Partners post orders to an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    { label: 'The order is validated against the partner XSD', rule: { type: 'exists', component: 'xml-validate', where: { schemas: '.xsd' } } },
    {
      label: 'Validation happens before the order is transformed to the legacy format',
      rule: { type: 'before', first: 'xml-validate', then: ['xml-xslt', 'transform'], every: true },
    },
    { label: 'Only validated orders are sent to the ERP', rule: { type: 'before', first: 'xml-validate', then: 'http-request' } },
    {
      label: 'The order is converted to the ERP format (XSLT or DataWeave) before it is posted to the gateway',
      rule: { type: 'before', first: ['xml-xslt', 'transform'], then: 'http-request' },
    },
    {
      label: 'The order number is read from the partner XML before the conversion replaces the payload',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'xml-xpath', firstWhere: { xpath: 'OrderNumber' }, then: ['xml-xslt', 'http-request'] },
          { type: 'before', first: 'set-variable', firstWhere: { value: 'Header.OrderNumber' }, then: ['xml-xslt', 'http-request'] },
        ],
      },
    },
    {
      label: 'An order that breaks the XSD (XML-MODULE:SCHEMA_NOT_HONOURED) is answered with 400',
      rule: handlerStatus('SCHEMA_NOT_HONOURED', '400'),
    },
    {
      label: 'XML-MODULE:INVALID_INPUT_XML, which Validate Schema can also raise, is answered with 400 too',
      rule: handlerStatus('INVALID_INPUT_XML', '400'),
    },
    {
      label: 'The acknowledgement built after the ERP call carries the partner order number',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'http-request', then: 'transform', thenWhere: { script: 'OrderNumber' }, outside: true },
          { type: 'before', first: 'http-request', then: 'set-payload', thenWhere: { value: 'OrderNumber' }, outside: true },
        ],
      },
    },
  ],
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'partner-xml-orders',
      why: 'The scenario does not say what a partner gets when the ERP is down. Mule already answers with an error status, so a 503 with RETRY_LATER is a nicety.',
    },
  ],
  referenceFlow: design(
    flow(
      'partner-xml-orders',
      source('http-listener', { path: '/b2b/v1/orders', allowedMethods: 'POST' }),
      [
        // XML module: Expand Entities stays NEVER (default) → no XXE.
        step('xml-validate', { schemas: 'schemas/partner-order-v3.xsd', schemaLanguage: 'W3C' }),
        step('xml-xpath', { xpath: '/Order/Header/OrderNumber', target: 'orderNumbers' }),
        step('set-variable', { variableName: 'orderNumber', value: '#[vars.orderNumbers[0]]' }),
        // The ERP team owns and tests this stylesheet; reuse it rather than rewriting it in DataWeave.
        step('xml-xslt', {
          xslt: '<!-- content of src/main/resources/xslt/partner-to-erp-order.xsl (XSLT 2.0, owned by the ERP team) -->\n<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">\n  ...\n</xsl:stylesheet>',
          outputMimeType: 'application/xml',
        }),
        step('http-request', { method: 'POST', path: '/erp/order-gateway/import', responseTimeout: 20000 }),
        step('logger', { level: 'INFO', message: '#["Order " ++ vars.orderNumber ++ " forwarded to ERP"]' }),
        step('set-variable', { variableName: 'httpStatus', value: '#[202]' }),
        step('transform', {
          script: '%dw 2.0\noutput application/xml\n---\nOrderAck: {\n  OrderNumber: vars.orderNumber,\n  Status: "ACCEPTED",\n  CorrelationId: correlationId\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'XML-MODULE:SCHEMA_NOT_HONOURED, XML-MODULE:INVALID_INPUT_XML' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[400]' }),
          step('logger', { level: 'WARN', message: '#["Rejected partner order: " ++ error.description]' }),
          step('transform', {
            script:
              '%dw 2.0\noutput application/xml\n---\nOrderAck: {\n  Status: "REJECTED",\n  Reason: error.description,\n  CorrelationId: correlationId\n}',
          }),
        ]),
        handler('on-error-propagate', { type: 'HTTP:CONNECTIVITY, HTTP:TIMEOUT, HTTP:SERVICE_UNAVAILABLE' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[503]' }),
          step('transform', {
            script: '%dw 2.0\noutput application/xml\n---\nOrderAck: { Status: "RETRY_LATER", CorrelationId: correlationId }',
          }),
        ]),
      ],
    ),
  ),
  description: `
A distributor receives purchase orders from **60 retail partners** over a B2B API (\`POST /b2b/v1/orders\`, \`application/xml\`, ~3,000 orders/day). The order format is defined by a published XSD, \`partner-order-v3.xsd\`, which partners also use to test.

The legacy **ERP order gateway** only accepts its own XML format. The ERP team already maintains a tested **XSLT 2.0 stylesheet**, \`partner-to-erp-order.xsl\`, which they currently run in an old ESB being decommissioned.

**Requirements**
- Orders that do not conform to the XSD, or are not well-formed XML, must be **rejected with 400** and a reason the partner can understand.
- Valid orders are converted to the ERP format and posted to the gateway.
- Respond with an XML acknowledgement containing the partner's order number. In the partner XML it is the element \`/Order/Header/OrderNumber\`, and the acknowledgement carries it as \`OrderNumber\` too.
- The security team asked how the API is protected against **XML External Entity (XXE)** attacks.

**Design the flow.** Would you keep the XSLT or rewrite it in DataWeave?
`,
  answerTemplate: `## Receiving the order

## XSD validation

## XSLT or DataWeave

## Calling the ERP

## Acknowledgement and error mapping

## XXE protection
`,
  keyPoints: [
    'XML module Validate Schema with the existing XSD (W3C) before any transformation; it raises XML-MODULE:SCHEMA_NOT_HONOURED with the violations in the description.',
    'Validate Schema also lists XML-MODULE:INVALID_INPUT_XML. The docs do not define it, but the name points to input that cannot be parsed, so test with malformed XML. Both are mapped to 400 with an XML rejection body (On Error Propagate + httpStatus).',
    'Reusing the ERP team\'s tested XSLT via XSLT Transform is pragmatic during migration; DataWeave is MuleSoft\'s recommended choice for new mappings and is easier to test in the project.',
    'XPath Extract (or DataWeave) pulls the order number for the log and the acknowledgement.',
    'Expand Entities defaults to NEVER in the XML module, which blocks XXE; DataWeave\'s XML reader does not resolve external entities by default either.',
    'ERP unavailable → 503 so the partner retries; the partner\'s order number is the key the ERP uses to reject duplicates.',
  ],
  solution: `
1. **HTTP Listener** \`POST /b2b/v1/orders\`.
2. **Validate Schema** (XML module) with \`schemas/partner-order-v3.xsd\`, schema language W3C. Fails with \`XML-MODULE:SCHEMA_NOT_HONOURED\` (XSD violations). \`XML-MODULE:INVALID_INPUT_XML\` is also listed for this operation; the docs do not say which error malformed XML gives, so handle both and confirm with a test.
3. **XPath Extract** \`/Order/Header/OrderNumber\` into a variable (the operation returns a list of strings; take the first). DataWeave \`payload.Order.Header.OrderNumber\` works just as well.
4. **XSLT Transform** with the ERP team's \`partner-to-erp-order.xsl\` (output \`application/xml\`).
5. **HTTP Request** \`POST\` to the ERP order gateway with a response timeout.
6. Respond **202** with \`<OrderAck>\` (order number, status, correlation ID).

**Errors:** XSD/XML errors → **400** with \`<OrderAck><Status>REJECTED</Status><Reason>…\`. ERP connectivity/timeout/503 → **503** "retry later". Anything else → 500.

**XSLT vs DataWeave:** keep the XSLT for the migration (it is tested and owned by the ERP team), then rewrite in DataWeave when the mapping next changes. DataWeave is faster to change, unit-testable with MUnit and needs no extra module.

**XXE:** the XML module's Expand Entities setting defaults to **NEVER**, so external entities and DTD expansion are not resolved; do not change it. Also limit the request size on the listener.
`,
  followUps: [
    {
      q: 'Partners want all XSD violations, not only the first. How?',
      a: 'The Validate Schema error carries the list of problems found (line, column, description) in the error message; build the 400 body from that list instead of only error.description.',
    },
    {
      q: 'How do you support partner-order-v2 and v3 at the same time?',
      a: 'Detect the version from the namespace or a version header (XPath or DataWeave), route with a Choice to the matching Validate Schema and stylesheet, and keep the ERP call shared.',
    },
    {
      q: 'Why validate in Mule if the ERP gateway also validates?',
      a: 'The partner gets an immediate, specific 400 instead of a generic ERP error, invalid orders never consume ERP capacity, and the XSD is the contract published to partners.',
    },
  ],
}
