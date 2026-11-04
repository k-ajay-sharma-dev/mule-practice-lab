import { design, flow, handler, scope, source, step, subFlow } from '../../flow/dsl.js'

const getWorkersRequest = (page) =>
  `%dw 2.0\noutput application/xml\nns wd urn:com.workday/bsvc\n---\n{\n  wd#Get_Workers_Request @(wd#version: "v44.0"): {\n    wd#Request_Criteria: {\n      wd#Transaction_Log_Criteria_Data: {\n        wd#Transaction_Date_Range_Data: {\n          wd#Updated_From: vars.syncFrom,\n          wd#Updated_Through: vars.syncTo\n        }\n      }\n    },\n    wd#Response_Filter: { wd#Page: ${page}, wd#Count: 200 },\n    wd#Response_Group: { wd#Include_Personal_Information: true, wd#Include_Employment_Information: true }\n  }\n}`

export default {
  id: 'fl-092',
  category: 'flows',
  title: 'Sync Changed Workday Workers to the Identity Platform with Paged Get_Workers Calls',
  level: 'ADVANCED',
  tags: ['workday', 'get-workers', 'watermark', 'object-store', 'pagination', 'identity', 'hr'],
  estMinutes: 40,
  flowChecks: [
    { label: 'The sync is started by a Scheduler or the Workday On Modified Objects source', rule: { type: 'source', component: ['scheduler', 'wd-modified-objects'] } },
    { label: 'Workers are read with the Workday Human Resources operation Get_Workers', rule: { type: 'exists', component: 'wd-human-resources', where: { operation: 'Get_Workers' } } },
    { label: 'The last sync time is read before calling Workday', rule: { type: 'before', first: 'os-retrieve', then: 'wd-human-resources' } },
    { label: 'Further pages are read in a loop', rule: { type: 'inside', component: 'wd-human-resources', within: 'foreach' } },
    { label: 'Worker data is pushed to the identity platform', rule: { type: 'exists', component: 'http-request', where: { method: 'PUT' } } },
    { label: 'The sync time is stored only after the workers are processed', rule: { type: 'before', first: 'flow-ref', then: 'os-store' } },
    { label: 'Every Flow Reference points to an existing flow', rule: { type: 'refs' } },
    { label: 'Workday request problems are handled (WORKDAY:VALIDATION_ERROR)', rule: { type: 'handler', component: ['on-error-propagate', 'on-error-continue'], errorType: 'WORKDAY:VALIDATION_ERROR' } },
  ],
  referenceFlow: design(
    flow(
      'worker-sync',
      source('scheduler', { strategy: 'fixed-frequency', frequency: 15, timeUnit: 'MINUTES' }),
      [
        step('os-retrieve', { key: 'worker-sync-from', defaultValue: "#['2026-01-01T00:00:00Z']", objectStore: 'workerSyncStore' }),
        step('set-variable', { variableName: 'syncFrom', value: '#[payload]' }),
        // Fixed before the first call, so all pages use the same range.
        step('set-variable', { variableName: 'syncTo', value: '#[now() >> "UTC"]' }),
        step('transform', { script: getWorkersRequest(1) }),
        step('wd-human-resources', { operation: 'Get_Workers' }),
        // The output type is Binary and the docs do not state its MIME type. read() fails on a payload that is already parsed.
        step('set-variable', { variableName: 'response', value: "#[if (payload is Binary) read(payload, 'application/xml') else payload]" }),
        step('set-variable', { variableName: 'totalPages', value: '#[vars.response..*Total_Pages[0] as Number default 0]' }),
        step('flow-ref', { name: 'process-worker-page' }),
        scope('foreach', { collection: '#[if (vars.totalPages > 1) (2 to vars.totalPages) else []]' }, [
          step('set-variable', { variableName: 'page', value: '#[payload]' }),
          step('transform', { script: getWorkersRequest('vars.page') }),
          step('wd-human-resources', { operation: 'Get_Workers' }),
          step('set-variable', { variableName: 'response', value: "#[if (payload is Binary) read(payload, 'application/xml') else payload]" }),
          step('flow-ref', { name: 'process-worker-page' }),
        ]),
        step('os-store', { key: 'worker-sync-from', value: '#[vars.syncTo]', objectStore: 'workerSyncStore' }),
        step('logger', { level: 'INFO', message: '#["Worker sync complete up to " ++ (vars.syncTo as String)]' }),
      ],
      [
        handler('on-error-propagate', { type: 'WORKDAY:VALIDATION_ERROR, WORKDAY:BAD_REQUEST' }, [
          step('logger', { level: 'ERROR', message: '#["Get_Workers rejected: " ++ error.description]' }),
          step('email-send', { toAddresses: 'hris-support@example.com', subject: 'Worker sync request rejected', content: '#[error.description]' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [step('logger', { level: 'ERROR', message: '#["Worker sync failed, next run retries the same range: " ++ error.description]' })]),
      ],
    ),
    subFlow('process-worker-page', [
      step('transform', {
        script:
          '%dw 2.0\noutput application/java\nns wd urn:com.workday/bsvc\n---\n(vars.response..*wd#Worker default []) map (w) -> {\n  workerId: w.wd#Worker_Data.wd#Worker_ID,\n  userName: w.wd#Worker_Data.wd#User_ID,\n  active: w..wd#Active[0] == "1"\n}',
      }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'workerId', value: '#[payload.workerId]' }),
        step('transform', { script: '%dw 2.0\noutput application/json\n---\npayload' }),
        step('http-request', { method: 'PUT', path: '#["/identities/" ++ vars.workerId]' }),
      ]),
    ]),
  ),
  description: `
A healthcare group with **22,000 workers** uses **Workday** as its HR system. The identity platform must reflect joiners, movers and leavers within **30 minutes**, because access rights depend on it. It offers an idempotent \`PUT /identities/{workerId}\`.

**Requirements**
- Every 15 minutes, read the workers that changed since the last successful run. Normally that is 20 to 100 workers, but a reorganisation can change thousands at once.
- Use the connector's **Human Resources** operation with \`Get_Workers\`, and read the results **page by page**.
- Store the sync position only when all workers in the run are processed. A failed run must be repeated by the next one.
- A rejected Workday request (a mapping or security problem) must alert the HRIS support mailbox, because a retry will not help.
- The integration uses its own **integration system user**.

**Design the flows.** Explain why you chose a Scheduler or the On Modified Objects source.
`,
  answerTemplate: `## Trigger and sync window

## Reading workers

## Paging

## Pushing to the identity platform

## Errors and the sync position
`,
  keyPoints: [
    'workday:human-resources with operation Get_Workers; the request XML is built in a Transform Message in the namespace urn:com.workday/bsvc.',
    'Transaction_Log_Criteria_Data with an updated-from and updated-through range selects changed workers. Response_Filter with Page and Count controls paging.',
    'The upper bound of the range is fixed before the first call, so all pages use the same range and nothing falls between two runs.',
    'The output type is Binary, and the docs do not state its MIME type, so call read() only if the payload is not already parsed. Worker data uses the wd namespace.',
    'The position is stored after processing, so a failed run repeats. That is safe because the PUT is idempotent.',
    'WORKDAY:VALIDATION_ERROR and WORKDAY:BAD_REQUEST go to a person; connectivity problems are retried by the next run.',
    'On Modified Objects with Watermark Enabled is the alternative: less code, but the docs say less about what it delivers.',
  ],
  solution: `
**Trigger.** A **Scheduler** every 15 minutes with a stored position gives explicit control: the range is visible, repeatable and can be reset for a resync. **On Modified Objects** (\`WORKERS\`, Watermark Enabled set to \`true\`) is a valid alternative and the checks accept it. It takes less code, but its payload shape is not documented, so inspect it first.

**Sync window.**
- **Object Store Retrieve** gets \`syncFrom\`, with a default for the first run.
- **Set Variable** \`syncTo\` is the current UTC time, fixed before the first call.

**Reading workers.** A **Transform Message** builds \`Get_Workers_Request\` with \`Transaction_Log_Criteria_Data\`, \`Response_Filter\` (\`Page\` and \`Count\`) and a \`Response_Group\` that limits the data returned. Then the **Human Resources** operation runs with \`Get_Workers\`.

**Paging.** Read page 1, take \`Total_Pages\` from \`Response_Results\`, then use **For Each** over pages 2 to n. DataWeave's \`2 to 1\` counts downwards, so the expression guards with \`if (vars.totalPages > 1)\`. Page size \`200\` is a starting point. Test it with your tenant against the default 60-second Response Timeout.

**Pushing.** A sub-flow maps the page and sends **PUT** per worker. The operation is idempotent, so a repeated run is harmless.

**Errors.**
- \`WORKDAY:VALIDATION_ERROR\` and \`WORKDAY:BAD_REQUEST\`: log and email HRIS support.
- Anything else: log and propagate. Because the position is stored last, the next run repeats the same range.

**Security.** Use a dedicated ISU in a security group with Get access on the domains for worker data, and only those. The fields returned depend on those permissions, so check that \`User_ID\` and status are visible to the ISU.

Check the request element names and the \`version\` against the Workday API documentation for your tenant.
`,
  followUps: [
    {
      q: 'Why keep the same syncTo for all pages?',
      a: 'If each page used the current time, the result set could change between pages and rows could be skipped or repeated. A fixed range gives one consistent set, and the next run starts exactly there.',
    },
    {
      q: 'Future-dated hires appear today but start next month. What happens?',
      a: 'A change to the worker can be logged long before its effective date. Decide with HR whether to pre-create the identity disabled, or use effective-dated criteria so that it activates on the start date.',
    },
    {
      q: 'How do you run a full resync?',
      a: 'Reset the stored position through a protected admin flow. 22,000 workers at 200 per page is 110 pages, so run it outside working hours and tell the identity team.',
    },
    {
      q: 'Which Workday setting would make all fields disappear without an error?',
      a: 'Missing domain permissions on the security group: data the ISU may not see can simply be left out, so an empty field is not proof that the worker has no data. Check permissions when a field is unexpectedly missing.',
    },
  ],
}
