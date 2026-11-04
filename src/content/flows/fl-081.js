import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-081',
  category: 'flows',
  title: 'Nightly Integration Exception Digest: CSV Attachment, HTML Body, Silence When Nothing to Report',
  level: 'BEGINNER',
  tags: ['email', 'smtp', 'attachments', 'csv', 'scheduler', 'oracle'],
  estMinutes: 20,
  flowChecks: [
    { label: 'The digest runs on a nightly cron schedule', rule: { type: 'source', component: 'scheduler', where: { strategy: 'cron' } } },
    { label: 'Exception rows are read before deciding whether to send', rule: { type: 'before', first: 'db-select', then: 'choice' } },
    { label: 'The email is sent only on the branch that has rows (inside a Choice)', rule: { type: 'inside', component: 'email-send', within: 'choice' } },
    { label: 'A CSV attachment is built with DataWeave', rule: { type: 'exists', component: 'transform', where: { script: 'application/csv' } } },
    { label: 'The email body is sent as HTML', rule: { type: 'exists', component: 'email-send', where: { contentType: 'text/html' } } },
    { label: 'The attachment is set explicitly on Email Send', rule: { type: 'exists', component: 'email-send', where: { attachments: { set: true } } } },
    { label: 'Rows are marked as reported only after the email was sent', rule: { type: 'before', first: 'email-send', then: 'db-update' } },
    { label: 'A failed send is handled (EMAIL:SEND)', rule: { type: 'handler', component: ['on-error-propagate', 'on-error-continue'], errorType: 'EMAIL:SEND' } },
  ],
  referenceFlow: design(
    flow(
      'nightly-exception-digest',
      source('scheduler', { strategy: 'cron', expression: '0 0 2 * * ?' }),
      [
        // One cut-off for both the SELECT and the UPDATE, so rows arriving during the run wait for tomorrow.
        step('set-variable', { variableName: 'cutoff', value: '#[now()]' }),
        step('db-select', {
          database: 'Oracle',
          sql: 'SELECT EXCEPTION_ID, SOURCE_SYSTEM, ERROR_CODE, MESSAGE, CREATED_AT\nFROM INTEGRATION_EXCEPTIONS\nWHERE REPORTED_AT IS NULL AND CREATED_AT < :cutoff\nORDER BY SOURCE_SYSTEM, CREATED_AT',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(payload)]' }, [step('logger', { level: 'INFO', message: 'No exceptions to report, digest not sent' })]),
          ],
          {
            otherwise: [
              step('transform', {
                target: 'variable',
                variableName: 'exceptionsCsv',
                script: '%dw 2.0\noutput application/csv quoteValues=true\n---\npayload',
              }),
              step('transform', {
                target: 'variable',
                variableName: 'htmlBody',
                script:
                  '%dw 2.0\noutput text/plain\nfun esc(s) = (((s default "") as String replace "&" with "&amp;") replace "<" with "&lt;") replace ">" with "&gt;"\nvar bySystem = payload groupBy $.SOURCE_SYSTEM\n---\n"<html><body><p>" ++ sizeOf(payload) ++ " integration exceptions. Full list attached.</p><table border=\\"1\\"><tr><th>System</th><th>Count</th></tr>"\n  ++ ((bySystem pluck ((rows, system) -> "<tr><td>" ++ esc(system) ++ "</td><td>" ++ sizeOf(rows) ++ "</td></tr>")) joinBy "")\n  ++ "</table></body></html>"',
              }),
              step('email-send', {
                toAddresses: 'integration-support@company.example',
                subject: 'Integration exceptions digest',
                content: '#[vars.htmlBody]',
                contentType: 'text/html',
                attachments: '#[{ "exceptions.csv": vars.exceptionsCsv }]',
              }),
              step('db-update', {
                database: 'Oracle',
                sql: 'UPDATE INTEGRATION_EXCEPTIONS SET REPORTED_AT = SYSTIMESTAMP\nWHERE REPORTED_AT IS NULL AND CREATED_AT < :cutoff',
              }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'EMAIL:SEND, EMAIL:CONNECTIVITY, EMAIL:RETRY_EXHAUSTED' }, [
          step('logger', { level: 'ERROR', message: '#["Digest not sent, rows stay unreported: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
All integrations at an insurance company write failures to the Oracle table \`INTEGRATION_EXCEPTIONS\` (\`EXCEPTION_ID\`, \`SOURCE_SYSTEM\`, \`ERROR_CODE\`, \`MESSAGE\`, \`CREATED_AT\`, \`REPORTED_AT\`). Normal nights produce between **0 and 400 rows**.

The support team wants one email at **02:00** each night, sent to \`integration-support@company.example\`.

**Requirements**
- The **body** is a short HTML summary with the number of exceptions per source system.
- The full list is attached as **exceptions.csv**.
- If there is **nothing to report, no email is sent**. The team has asked not to receive empty digests.
- An exception must never be missed. If the email cannot be sent tonight, the same rows must appear in the next digest.
- An exception must not be reported twice after a successful send.

**Design the flow.**
`,
  answerTemplate: `## Schedule and query

## Nothing to report

## Building the CSV and the HTML

## Sending the email

## Marking rows as reported
`,
  keyPoints: [
    'A cron Scheduler runs the flow at 02:00. A fixed frequency would drift with deployments.',
    'A Choice with isEmpty(payload) stops the flow before any email is built, so no empty digest is sent.',
    'Two Transforms write to variables, so the database rows stay in the payload for both. The CSV uses output application/csv and the HTML is built as text.',
    'Outbound attachments must be set explicitly on Email Send: a map of file name to content.',
    'The body content type is text/html, otherwise the mail client shows the tags as text.',
    'REPORTED_AT is updated after the send. A failed send leaves the rows unreported, so tomorrow\'s digest includes them.',
    'The same cut-off value is used in the SELECT and the UPDATE, so a row inserted during the run is not marked as reported without being sent.',
  ],
  solution: `
1. **Scheduler**, cron \`0 0 2 * * ?\`. Set the time zone if the server does not run in local time.
2. **Set Variable** \`cutoff\`, then **Select** the rows where \`REPORTED_AT IS NULL AND CREATED_AT < :cutoff\`.
3. **Choice**: \`isEmpty(payload)\` logs one INFO line and the flow ends. No email is sent.
4. **Transform** to \`vars.exceptionsCsv\` with \`output application/csv quoteValues=true\`. Error messages often contain commas and line breaks, so quoting every value keeps the file readable in a spreadsheet.
5. **Transform** to \`vars.htmlBody\`: a count and a small table grouped by source system. Values are escaped so a \`<\` in a value does not break the layout. Keep the detail in the attachment.
6. **Email Send** over SMTPS: \`toAddresses\`, a subject, the body with content type \`text/html\`, and \`attachments\` set to \`#[{ "exceptions.csv": vars.exceptionsCsv }]\`. Each key is the file name shown in the mail client and each value is the content. Attachments are never added automatically.
7. **Update** \`REPORTED_AT\` with the same cut-off, after the send.

**Failure:** \`EMAIL:SEND\`, \`EMAIL:CONNECTIVITY\` or \`EMAIL:RETRY_EXHAUSTED\` is logged at ERROR level. The update never runs, so the rows stay unreported and the next run picks them up. The SMTP timeouts default to 5 seconds, which can be raised if the mail relay is slow.

**The small remaining risk:** if the email is sent and the update then fails, the next digest repeats those rows. That is the safer direction, because a repeated row is an annoyance and a missing row is a blind spot.
`,
  followUps: [
    {
      q: 'Why is the update after the send and not before it?',
      a: 'If the rows were marked first and the send failed, they would never be reported. Sending first means the worst case is a repeated row in the next digest.',
    },
    {
      q: 'What if the team wants a confirmation that the job ran on quiet nights?',
      a: 'Keep the email quiet and use the INFO log line or a heartbeat metric for monitoring. Otherwise people learn to ignore the mail, which was the reason for suppressing empty digests.',
    },
    {
      q: 'A night produces 200,000 rows after an outage. What changes?',
      a: 'The attachment may exceed the mail server limit. Cap the rows in the email, write the full CSV to a file share or blob, and put the location in the body. Mark only the rows you actually reported.',
    },
  ],
}
