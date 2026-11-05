import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-076',
  category: 'flows',
  title: 'Cross-Cloud File Relay: Amazon S3 to Azure Blob Storage, File by File',
  level: 'ADVANCED',
  tags: ['s3', 'azure-blob', 'aws', 'azure', 'migration', 'scheduler', 'error-handling', 'storage'],
  estMinutes: 35,
  flowChecks: [
    { label: 'The relay runs on a Scheduler', rule: { type: 'source', component: 'scheduler' } },
    { label: 'Pending objects are listed in S3 and then processed in a loop', rule: { type: 'before', first: 's3-list', then: ['foreach', 'parallel-foreach'] } },
    { label: 'Each object is downloaded from S3 and then uploaded to Azure', rule: { type: 'before', first: 's3-get', then: 'azure-upload-blob' } },
    { label: 'The upload happens inside the per-file loop', rule: { type: 'inside', component: 'azure-upload-blob', within: ['foreach', 'parallel-foreach'] } },
    { label: 'The S3 object is deleted only after a successful upload', rule: { type: 'before', first: 'azure-upload-blob', then: 's3-delete' } },
    {
      label: 'A failing file is logged and skipped so the rest of the batch continues',
      rule: { type: 'handler', component: 'on-error-continue', within: ['foreach', 'parallel-foreach'] },
    },
    {
      label: 'If Azure Storage is unreachable the run stops instead of failing every file (On Error Propagate inside the loop)',
      rule: { type: 'handler', component: 'on-error-propagate', within: ['foreach', 'parallel-foreach'] },
    },
  ],
  referenceFlow: design(
    flow(
      's3-to-azure-scan-relay',
      source('scheduler', { strategy: 'fixed-frequency', frequency: 5, timeUnit: 'MINUTES' }),
      [
        step('s3-list', { bucket: 'acme-claims-scans-export', prefix: 'outbound/' }),
        // Skip "folder" placeholder keys, limit the slice per run.
        step('transform', {
          script:
            '%dw 2.0\nimport take from dw::core::Arrays\noutput application/java\n---\ntake(payload filter ((o) -> not (o.key endsWith "/") and o.size > 0) map ((o) -> { key: o.key, size: o.size }), 200)',
        }),
        scope('foreach', { collection: '#[payload]' }, [
          step('set-variable', { variableName: 'obj', value: '#[payload]' }),
          step('set-variable', { variableName: 'blobName', value: '#["from-aws/" ++ (vars.obj.key replace /^outbound\\// with "")]' }),
          scope(
            'try',
            {},
            [
              step('s3-get', { bucket: 'acme-claims-scans-export', key: '#[vars.obj.key]' }),
              // Same blob name on a rerun, so a crash between upload and delete leaves no second copy.
              step('azure-upload-blob', { container: 'claims-scans', fileName: '#[vars.blobName]', fileStream: '#[payload]', contentType: 'application/pdf' }),
              // The connector's user manual says Upload Blob returns false on failure: never delete from S3 on that result.
              step('validation', { check: 'is-true', expression: '#[payload]', message: 'Upload Blob returned false' }),
              step('s3-delete', { bucket: 'acme-claims-scans-export', key: '#[vars.obj.key]' }),
              step('logger', { level: 'INFO', message: '#["Relayed " ++ vars.obj.key ++ " (" ++ (vars.obj.size as String) ++ " bytes) to claims-scans/" ++ vars.blobName]' }),
            ],
            {
              errorHandlers: [
                // Platform down: stop the run, the next run starts again (nothing was deleted).
                // Partner connector: its manual lists no error types, so confirm this name in Studio.
                handler('on-error-propagate', { type: 'AZURE-STORAGE:CONNECTIVITY' }, [
                  step('logger', { level: 'ERROR', message: '#["Azure Storage unreachable, stopping run at " ++ vars.obj.key]' }),
                ]),
                handler('on-error-continue', { type: 'ANY' }, [
                  step('logger', { level: 'ERROR', message: '#["Relay of " ++ vars.obj.key ++ " failed, left in S3 for the next run: " ++ error.description]' }),
                ]),
              ],
            },
          ),
        ]),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Relay run aborted: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
An insurer is moving its claims platform from **AWS** to **Azure**. During the 6-month transition, the scanning service (still on AWS) writes scanned claim documents as PDFs (0.2–40 MB, ~8,000 per day) to the S3 bucket \`acme-claims-scans-export\` under \`outbound/\`. The new claims system on Azure reads them from the Blob Storage container \`claims-scans\`.

You are asked to build the relay in Mule.

**Requirements**
- A document must appear in Azure within ~10 minutes of landing in S3.
- **No document may be lost**: an object is removed from S3 only once it is safely in Azure.
- One corrupt or oversized document must not stop the others.
- If Azure Storage is down for an hour, the relay must not spend the hour failing every document one by one; it should simply catch up afterwards.
- Keep the Mule worker's memory flat even for 40 MB files.

**Design the flow.** How do you make the relay safe to rerun after a crash?
`,
  answerTemplate: `## Trigger and listing

## Per-file processing

## Delete only after upload

## Per-file vs platform errors

## Rerun safety and memory
`,
  keyPoints: [
    'Scheduler (5 min) → S3 List Objects for the prefix → a bounded slice (e.g. 200) per run, skipping folder placeholder keys.',
    'For Each object: Get Object → Upload Blob (deterministic blob name derived from the key) → Delete Object, in that order.',
    'Delete only after the upload succeeded, and check the result: the connector manual says Upload Blob returns false on failure. A crash between upload and delete leads to re-uploading the same blob name next run, so nothing is lost. Test that the upload replaces the blob, as the manual does not state it.',
    'Per-file Try: On Error Continue for ordinary failures (log, leave the object in S3); On Error Propagate for the connectivity error (AZURE-STORAGE:CONNECTIVITY here, confirm the name in Studio) to stop the run while the platform is down.',
    'Stream the content (repeatable file-store streams) instead of loading 40 MB into memory; keep For Each sequential or Parallel For Each with low concurrency.',
    'Use least-privilege credentials on both sides: an IAM policy limited to the bucket prefix and a container-scoped SAS token.',
  ],
  solution: `
1. **Scheduler** every 5 minutes (primary node only in a cluster; one replica is enough for ~8,000 files/day).
2. **S3 List Objects** bucket \`acme-claims-scans-export\`, prefix \`outbound/\`. **Transform**: drop keys ending in \`/\` and empty objects, take the first 200 — the rest waits for the next run.
3. **For Each** object:
   - Blob name = key without \`outbound/\`, under \`from-aws/\` — deterministic.
   - **Try**: **S3 Get Object** → **Upload Blob** (container \`claims-scans\`, content = the stream, content type \`application/pdf\`) → **Validation** that the upload returned true → **S3 Delete Object** → log.
   - **On Error Propagate** \`AZURE-STORAGE:CONNECTIVITY\` (the partner manual lists no error types, so confirm the name in Studio) → stops the loop and the run (nothing was deleted). Next run starts over.
   - **On Error Continue** (ANY) → log the key and reason, leave the object in S3, continue with the next one. A file that keeps failing is visible in the log on every run; after N failures move it to a \`quarantine/\` prefix (copy + delete) so it does not block the slice.
4. **Rerun safety:** the steps are meant to be idempotent. Re-uploading uses the same blob name, which needs a test because the manual does not state that an existing blob is replaced. Deleting an already deleted object is harmless.
5. **Memory:** Get Object returns a stream; keep the default repeatable file-store streaming so large files buffer to disk, not heap.

**Optional:** compare the uploaded blob size with the S3 object size before deleting, for extra confidence during the migration.
`,
  followUps: [
    {
      q: 'Would Parallel For Each make this faster? What changes?',
      a: 'Yes, with maxConcurrency of 4–8 the network transfers overlap. But Parallel For Each collects all route errors and raises MULE:COMPOSITE_ROUTING at the end, so the "stop when Azure is down" behaviour no longer stops early; keep the per-file Try inside each route and check the platform before the loop.',
    },
    {
      q: 'Why not trigger the relay from S3 event notifications instead of polling?',
      a: 'S3 can send ObjectCreated events to SQS; a Mule SQS consumer then relays each object within seconds. That lowers latency and listing cost; the scheduled list remains useful as a safety net for missed events.',
    },
    {
      q: 'How do you prove nothing was lost at the end of the transition?',
      a: 'Log each relayed key with size. Keep a daily reconciliation (S3 inventory or the relay log vs List Blobs In Container). Enable S3 versioning so a deleted object can still be recovered during the transition.',
    },
  ],
}
