export default {
  id: 'rm-106',
  category: 'api-design',
  title: 'Employee Import API: CSV Upload, an Import Job and Paged Row Errors',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'file-upload', 'multipart', 'async', 'long-running', 'cursor-pagination', 'hr'],
  estMinutes: 45,
  description: `
A payroll provider onboards new clients by importing their employees from a CSV file. A large client sends 60,000 rows in a 15 MB file. Checking every row against tax and bank rules and loading the good ones takes up to 20 minutes. A file with problems can have thousands of bad rows.

The contract combines three patterns:
- **Upload with multipart/form-data.** The CSV file goes up as a binary part, with the payroll group and effective date as form fields beside it. A \`dryRun\` field lets a client check a file without loading anything.
- **A long-running job.** The upload answers **202** with a \`Location\` header. The client polls the import job, which answers 200 with a \`Retry-After\` header while it runs.
- **Paged row errors.** Errors are a sub-resource of the import, read with **cursor paging**, because one response with 8,000 errors is too big for a browser table. Errors are only final when the job has finished, so reading them earlier answers **409**.

**Requirements**
- Keep the title \`Employee Import API\` and JSON as the default media type.
- A type \`ImportFile\` of type \`file\`, limited to \`text/csv\`, with a \`maxLength\` of 20971520 bytes (20 MB).
- A type \`ImportUpload\` with a required \`file\` of type \`ImportFile\`, a required string \`payrollGroup\`, a required \`effectiveDate\` of type \`date-only\`, and an optional boolean \`dryRun\` with a default of \`false\`.
- A type \`ImportJob\` with a required string \`importId\`, a required \`status\` that is exactly one of \`QUEUED\`, \`VALIDATING\`, \`LOADING\`, \`COMPLETED\`, \`COMPLETED_WITH_ERRORS\`, \`FAILED\`, and optional integers \`rowsLoaded\` and \`rowsRejected\`.
- A type \`RowError\` with a required integer \`rowNumber\` of at least 2 (row 1 is the header), and required strings \`field\`, \`code\` and \`message\`.
- A type \`RowErrorPage\` with a required \`items\` of \`RowError[]\` and a required \`nextCursor\` that is a string or null.
- A type \`Error\` with required strings \`code\` and \`message\`.
- \`POST /employee-imports\` takes an \`ImportUpload\` as \`multipart/form-data\`. It returns 202 with an \`ImportJob\` and a \`Location\` header, 400 with an \`Error\`, 413 for a file over 20 MB, and 415 for a file that is not CSV.
- \`GET /employee-imports/{importId}\` returns 200 with an \`ImportJob\` and a \`Retry-After\` header, or 404.
- \`GET /employee-imports/{importId}/errors\` takes an optional string \`cursor\` and an optional integer \`limit\` from 1 to 500 with a default of 100. It returns 200 with a \`RowErrorPage\`, 409 with an \`Error\` while the job is still running, or 404.
`,
  starter: `#%RAML 1.0
title: Employee Import API
mediaType: application/json

types:

/employee-imports:
  post:
  /{importId}:
    get:
    /errors:
      get:
`,
  ramlChecks: [
    { label: 'ImportFile is a file limited to text/csv', rule: { type: 'typeDecl', name: 'ImportFile', want: { type: 'file', fileTypes: { exactly: ['text/csv'] } } } },
    { label: 'ImportFile has a maxLength of 20 MB (20971520 bytes)', rule: { type: 'typeDecl', name: 'ImportFile', want: { maxLength: 20971520 } } },
    {
      label: 'ImportUpload has a required ImportFile, payrollGroup and date-only effectiveDate',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ImportUpload', prop: 'file', want: { type: 'ImportFile', required: true } },
          { type: 'prop', typeName: 'ImportUpload', prop: 'payrollGroup', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'ImportUpload', prop: 'effectiveDate', want: { type: 'date-only', required: true } },
        ],
      },
    },
    { label: 'dryRun is an optional boolean, default false', rule: { type: 'prop', typeName: 'ImportUpload', prop: 'dryRun', want: { type: 'boolean', required: false, default: false } } },
    {
      label: 'ImportJob.status has exactly the six job states, and the row counts are optional integers',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ImportJob', prop: 'status', want: { required: true, enum: { exactly: ['QUEUED', 'VALIDATING', 'LOADING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'] } } },
          { type: 'prop', typeName: 'ImportJob', prop: 'rowsLoaded', want: { type: 'integer', required: false } },
          { type: 'prop', typeName: 'ImportJob', prop: 'rowsRejected', want: { type: 'integer', required: false } },
        ],
      },
    },
    {
      label: 'RowError has a rowNumber of at least 2, and required field, code and message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'RowError', prop: 'rowNumber', want: { type: 'integer', required: true, minimum: 2 } },
          { type: 'prop', typeName: 'RowError', prop: 'field', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'RowError', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'RowError', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'RowErrorPage has items and a nextCursor that is always present and may be null',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'RowErrorPage', prop: 'items', want: { type: 'RowError[]', required: true } },
          {
            type: 'any',
            rules: [
              { type: 'prop', typeName: 'RowErrorPage', prop: 'nextCursor', want: { type: 'string | nil', required: true } },
              { type: 'prop', typeName: 'RowErrorPage', prop: 'nextCursor', want: { type: 'nil | string', required: true } },
              { type: 'prop', typeName: 'RowErrorPage', prop: 'nextCursor', want: { type: 'string?', required: true } },
            ],
          },
        ],
      },
    },
    { label: 'POST takes an ImportUpload as multipart/form-data', rule: { type: 'body', path: '/employee-imports', method: 'post', media: 'multipart/form-data', typeIs: 'ImportUpload' } },
    { label: 'POST returns 202 with an ImportJob and a Location header', rule: { type: 'response', path: '/employee-imports', method: 'post', status: '202', typeIs: 'ImportJob', header: 'Location' } },
    {
      label: 'POST returns 400 with an Error, 413 and 415',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'response', path: '/employee-imports', method: 'post', status: '400', typeIs: 'Error' },
          { type: 'response', path: '/employee-imports', method: 'post', status: '413' },
          { type: 'response', path: '/employee-imports', method: 'post', status: '415' },
        ],
      },
    },
    {
      label: 'The import job returns 200 with an ImportJob and a Retry-After header, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/employee-imports/{}', method: 'get', status: '200', typeIs: 'ImportJob', header: 'Retry-After' },
          { type: 'response', path: '/employee-imports/{}', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'The errors resource takes an optional cursor and a limit from 1 to 500, default 100',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/employee-imports/{}/errors', method: 'get', in: 'query', name: 'cursor', want: { type: 'string', required: false } },
          { type: 'param', path: '/employee-imports/{}/errors', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 500, default: 100 } },
        ],
      },
    },
    {
      label: 'The errors resource returns a RowErrorPage, 409 with an Error while running, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/employee-imports/{}/errors', method: 'get', status: '200', typeIs: 'RowErrorPage' },
          { type: 'response', path: '/employee-imports/{}/errors', method: 'get', status: '409', typeIs: 'Error' },
          { type: 'response', path: '/employee-imports/{}/errors', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Employee Import API
mediaType: application/json

types:
  ImportFile:
    type: file
    fileTypes: [ text/csv ]
    maxLength: 20971520
  ImportUpload:
    type: object
    properties:
      file: ImportFile
      payrollGroup: string
      effectiveDate: date-only
      dryRun?:
        type: boolean
        default: false
  ImportJob:
    type: object
    properties:
      importId: string
      status:
        type: string
        enum: [ QUEUED, VALIDATING, LOADING, COMPLETED, COMPLETED_WITH_ERRORS, FAILED ]
      rowsLoaded?: integer
      rowsRejected?: integer
  RowError:
    type: object
    properties:
      rowNumber:
        type: integer
        minimum: 2
      field: string
      code: string
      message: string
  RowErrorPage:
    type: object
    properties:
      items: RowError[]
      nextCursor: string | nil
    example:
      items:
        - rowNumber: 4127
          field: taxCode
          code: INVALID_TAX_CODE
          message: Tax code 1257Q is not a valid code.
      nextCursor: null
  Error:
    type: object
    properties:
      code: string
      message: string

/employee-imports:
  post:
    body:
      multipart/form-data:
        type: ImportUpload
    responses:
      202:
        headers:
          Location:
            type: string
            description: The URL of the import job.
        body:
          type: ImportJob
      400:
        body:
          type: Error
      413:
        description: The file is larger than 20 MB.
      415:
        description: The file is not a CSV file.
  /{importId}:
    get:
      responses:
        200:
          headers:
            Retry-After:
              type: integer
              description: Seconds to wait before polling again.
          body:
            type: ImportJob
        404:
          description: No import has this id.
    /errors:
      get:
        queryParameters:
          cursor?: string
          limit?:
            type: integer
            minimum: 1
            maximum: 500
            default: 100
        responses:
          200:
            body:
              type: RowErrorPage
          409:
            description: The import has not finished, so the error list is not final.
            body:
              type: Error
          404:
            description: No import has this id.
`,
  keyPoints: [
    'The file and its form fields travel together in one multipart request.',
    'A large import is a job: 202 with Location, then poll with Retry-After.',
    'COMPLETED_WITH_ERRORS is its own state, because partial success is the normal case for imports.',
    'Row errors are a paged sub-resource, so thousands of errors never land in one response.',
    '409 on the error list means the job is still running and the list is not final yet.',
  ],
  solution: `
The upload, the job and the error list are three resources with three jobs. The upload hands the work over, the job reports progress, and the error list holds the detail.

\`ImportFile\` keeps the file rules in one named type, and \`ImportUpload\` places it beside the form fields. \`dryRun\` defaults to \`false\`, so a client that never sends it gets a real load, and a careful client can check a file first.

\`COMPLETED_WITH_ERRORS\` tells the client at a glance that it should read the error list. \`FAILED\` means the file as a whole could not be read, such as a wrong column layout, and \`rowsLoaded\` stays 0.

\`rowNumber\` has a minimum of 2 because row 1 is the header. The number points the client's HR team at the exact line in their own spreadsheet.

In Mule, the POST flow streams the file to storage, saves the job and publishes a message to Anypoint MQ. A worker reads the CSV with streaming DataWeave, validates in batches, and writes row errors to a table that the errors flow pages through with a keyset query.
`,
  followUps: [
    {
      q: 'Why not return the row errors inside the ImportJob?',
      a: 'The job is polled often, and 8,000 errors in every poll would waste bandwidth. A separate paged resource keeps polls small and lets the client read errors only once.',
    },
    {
      q: 'How would you let a client fix bad rows without uploading the whole file again?',
      a: 'Offer a second upload linked to the first import that holds only the corrected rows. The server matches them by employee number and reruns the checks for those rows only.',
    },
    {
      q: 'What Mule feature fits the row processing?',
      a: 'A Batch Job fits well: it reads records in blocks, processes steps in parallel, and keeps failed records apart. Its on complete phase can set the final job status and counts.',
    },
    {
      q: 'Why should the file go to storage before the 202 is sent?',
      a: 'If the worker restarts, the file must still exist for a retry. Holding it only in memory would lose the upload and leave a job that can never finish.',
    },
  ],
}
