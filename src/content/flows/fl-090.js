import { design, flow, handler, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-090',
  category: 'flows',
  title: 'Receive SAP MATMAS IDocs with the Document Listener and Publish Material Events',
  level: 'INTERMEDIATE',
  tags: ['sap', 'idoc', 'matmas', 'anypoint-mq', 'idempotency', 'manufacturing'],
  estMinutes: 30,
  flowChecks: [
    { label: 'IDocs arrive through the SAP Document Listener', rule: { type: 'source', component: 'sap-document-listener', where: { programID: { set: true } } } },
    { label: 'The listener only accepts MATMAS IDocs', rule: { type: 'source', component: 'sap-document-listener', where: { idocTypeFilterRegex: 'MATMAS' } } },
    { label: 'A repeated IDoc is detected before anything is published', rule: { type: 'before', first: 'idempotent', then: 'mq-publish' } },
    {
      label: 'Duplicates are keyed on the IDoc number (DOCNUM), not on the material',
      rule: { type: 'exists', component: 'idempotent', where: { idExpression: 'docnum' } },
    },
    { label: 'The IDoc is mapped to the event format before publishing', rule: { type: 'before', first: 'transform', then: 'mq-publish' } },
    { label: 'Material events go to Anypoint MQ', rule: { type: 'exists', component: 'mq-publish', where: { destination: { set: true } } } },
    { label: 'A duplicate is logged and ignored (MULE:DUPLICATE_MESSAGE)', rule: { type: 'handler', component: 'on-error-continue', errorType: 'MULE:DUPLICATE_MESSAGE' } },
    {
      label: 'No catch-all On Error Continue hides real failures',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'on-error-propagate' },
          { type: 'absent', component: 'on-error-continue', where: { type: 'ANY' } },
        ],
      },
    },
    {
      label: 'The duplicate handler comes before any catch-all handler, so it is reached',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'on-error-continue', where: { type: 'DUPLICATE_MESSAGE' } },
          {
            type: 'any',
            rules: [
              {
                type: 'before',
                first: 'on-error-continue',
                firstWhere: { type: 'DUPLICATE_MESSAGE' },
                then: 'on-error-propagate',
                thenWhere: { type: 'ANY' },
                every: true,
              },
              { type: 'absent', component: 'on-error-propagate', where: { type: 'ANY' } },
            ],
          },
        ],
      },
    },
    {
      label: 'Other failures are logged with the IDoc number and propagated',
      rule: { type: 'inside', component: 'logger', within: 'on-error-propagate', where: { message: 'docnum' } },
    },
  ],
  referenceFlow: design(
    flow(
      'sap-matmas-inbound',
      source('sap-document-listener', {
        gatewayHost: '${sap.gateway.host}',
        gatewayService: '${sap.gateway.service}',
        programID: 'MULE_MATMAS_PID',
        idocTypeFilterRegex: 'MATMAS05',
      }),
      [
        // The source output type is Binary and the docs do not state its MIME type. read() fails on a payload that is already parsed.
        step('set-variable', { variableName: 'idoc', value: "#[if (payload is Binary) read(payload, 'application/xml') else payload]" }),
        step('set-variable', { variableName: 'docnum', value: '#[vars.idoc.MATMAS05.IDOC.EDI_DC40.DOCNUM]' }),
        step('idempotent', { idExpression: '#[vars.docnum]', objectStore: 'idocStore' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\nvar mat = vars.idoc.MATMAS05.IDOC.E1MARAM\n---\n{\n  idocNumber: vars.docnum,\n  material: mat.MATNR,\n  baseUnit: mat.MEINS,\n  deleted: mat.LVORM == "X",\n  descriptions: (mat.*E1MAKTM default []) map (d) -> { language: d.SPRAS_ISO, text: d.MAKTX }\n}',
        }),
        step('mq-publish', { destination: 'material-events' }),
        step('logger', { level: 'INFO', message: '#["IDoc " ++ vars.docnum ++ " published"]' }),
      ],
      [
        handler('on-error-continue', { type: 'MULE:DUPLICATE_MESSAGE' }, [step('logger', { level: 'WARN', message: '#["Duplicate IDoc ignored: " ++ vars.docnum]' })]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["IDoc " ++ (vars.docnum default "unknown") ++ " failed: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A manufacturer keeps its material master in **SAP S/4HANA**. Each change must reach the web shop, the warehouse system and the product search index. SAP sends about **25,000 MATMAS05 IDocs per day**, with peaks of 3,000 per hour after mass changes.

**Requirements**
- SAP pushes the IDocs to Mule. The SAP team has registered a program ID and given you the gateway host and service.
- Only \`MATMAS05\` is accepted by this app. Other IDoc types use other interfaces.
- Three consumers must get the data, and they must not depend on the speed of each other or of SAP.
- The event contains the IDoc number, material, base unit, deletion flag and descriptions per language.
- The same IDoc can be sent again by the SAP team for reprocessing. Without a real change it must not produce a second event.
- Failures must be easy to trace to an **IDoc number**. The IDoc number is the \`DOCNUM\` field of the IDoc control record.

**Design the flow.** Also list what you must agree with the SAP team.
`,
  answerTemplate: `## Receiving the IDoc

## Duplicates

## Mapping and publishing

## Error handling

## Agreements with the SAP team
`,
  keyPoints: [
    'The Document Listener makes the app an RFC server at the SAP gateway: it needs the gateway host, gateway service and program ID from the SAP team.',
    'Idoc Type Filter Regex limits the listener to the IDoc types this app handles.',
    'The source output type is Binary, and the docs do not state its MIME type. Call read() only if the payload is not already parsed as XML, because read() fails on a parsed payload.',
    'EDI_DC40 holds the control record; DOCNUM identifies the IDoc and makes a good idempotency key and trace field.',
    'Repeating segments such as E1MAKTM need the multi-value selector.',
    'A queue or exchange decouples the consumers from SAP.',
    'The docs do not describe how the listener acknowledges an IDoc or what SAP does when the flow fails, so agree and test that behaviour with the SAP team.',
  ],
  solution: `
1. **SAP Document Listener** with the gateway host, gateway service and program ID, and Idoc Type Filter Regex \`MATMAS05\`.
2. **Set Variable** \`idoc\`: the payload as XML, calling \`read()\` only if it is still binary. **Set Variable** \`docnum\` from \`EDI_DC40/DOCNUM\`.
3. **Idempotent Message Validator** on the IDoc number, with a persistent object store. A repeated IDoc raises \`MULE:DUPLICATE_MESSAGE\`.
4. **Transform Message** to the JSON event. Use \`.*E1MAKTM\` because the descriptions repeat, and treat \`LVORM = "X"\` as the deletion flag.
5. **Anypoint MQ Publish** to \`material-events\`. Use an exchange with one queue per consumer so each one has its own pace.
6. **Logger** with the IDoc number.

**Errors.**
- \`MULE:DUPLICATE_MESSAGE\`: On Error Continue with a warning. It is expected and not a failure.
- Anything else: log the IDoc number and propagate, so that the failure is visible.

**Agree with the SAP team.** Gateway host, service and program ID; the partner profile and port; how a failed IDoc appears in SAP and how it is reprocessed (a reprocessed IDoc may keep or change its number, so test the idempotency key); and whether a new IDoc number is used when the material really changes.
`,
  followUps: [
    {
      q: 'Why not key the idempotency on the material number?',
      a: 'A material changes many times, so every later change would be dropped as a duplicate. DOCNUM identifies one IDoc, not one material.',
    },
    {
      q: 'Peaks reach 3,000 per hour. What can you tune on the listener?',
      a: 'Connection Count (default 1) sets the number of connections to the gateway. Test it with the SAP team, and keep the flow short by handing off to the queue.',
    },
    {
      q: 'The app runs on two replicas. What should you check?',
      a: 'The source has a Primary Node Only parameter for clusters. Decide with the SAP team how program ID registrations should behave with several instances, and test it. The object store must be shared so that both instances see the same keys.',
    },
    {
      q: 'What changes if Mule must send IDocs into SAP instead?',
      a: 'Use Send IDoc with the IDoc name. Add a queue name and version for qRFC if the order matters.',
    },
  ],
}
