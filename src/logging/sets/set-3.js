// Logging Lab exercises, set 3. See ../exercises.js for the format.
import { corr, errorFacts, labelled, noPayload, noPersonal, noSecrets, noVague, says } from '../rules.js'

// rules several exercises here share
const duration = { must: /duration|elapsed|took|ms\s*"?\s*[=:]/i, say: 'Add how long it took, such as durationMs=$(vars.durationMs).' }
const next = (example) => ({ must: /next|moved|retry|again|kept/i, say: `Say what happens next, such as ${example}.` })
const has = (re, say) => ({ must: re, say })

export const SET_3 = [
  // ---------- lg-061 Greenfield Grocers: store sales files ----------
  {
    id: 'log-3001',
    kind: 'level',
    situation:
      'At Greenfield Grocers a File Listener watches /data/inbound/sales. It has picked up the daily sales file of store 214, and the flow starts to read it.',
    answer: ['INFO'],
    explain:
      'A file arriving is a normal event you want to see in production. One INFO line per file is a small volume, and it proves the file came in.',
  },
  {
    id: 'log-3002',
    kind: 'choice',
    situation: 'The Greenfield sales flow has moved the file of store 214 to the archive folder. Which message is best?',
    options: [
      'File moved',
      'Sales file archived fileName=store-214-2026-11-12.csv archiveFolder=/data/archive/sales correlationId=5d21c9',
      'Archived: storeId,date,sku,qty,amount 214,2026-11-12,GG-1001,3,4.50 214,2026-11-12,GG-1002,1,2.10',
      'Moving file to archive now!!!',
    ],
    answer: 1,
    explain:
      'It says what happened, which file and where it went. When a store asks about its file, support can find it in the archive. The third option dumps the file content.',
  },
  {
    id: 'log-3003',
    kind: 'multi',
    situation: 'Right after the File Listener in the Greenfield sales flow. The sales files are about 40 MB each. Which are problems with this logger?',
    code: '<logger level="INFO" message="#[payload]" />',
    options: [
      'The whole file content goes into the log, many megabytes for every file',
      'There is no file name, so nobody can tell which store sent the file',
      'There is no correlation ID',
      'The File Listener only gives the file name, so payload is empty at this point',
      'Mule cuts every INFO line to 100 characters, so the size does not matter',
    ],
    answers: [0, 1, 2],
    explain:
      'The listener gives the file content as the payload, and Mule does not cut log lines. Log the name and the size from attributes instead: "Sales file picked up fileName=$(attributes.fileName) sizeBytes=$(attributes.size) correlationId=$(correlationId)".',
  },
  {
    id: 'log-3004',
    kind: 'write',
    situation:
      'Write the first logger of the Greenfield sales flow, right after the File Listener. Nothing has parsed the file yet, so the payload is still the raw content. The file name and size are in the attributes of the listener.',
    available: ['attributes.fileName', 'attributes.size', 'attributes.path', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/picked up|received|arrived|found|new/i, 'Sales file picked up'),
      has(/attributes\.fileName/, 'Add the file name: fileName=$(attributes.fileName).'),
      has(/attributes\.size/, 'Add the file size: sizeBytes=$(attributes.size).'),
      labelled('fileName'),
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Sales file picked up fileName=$(attributes.fileName) sizeBytes=$(attributes.size) correlationId=$(correlationId)"]' },
    explain:
      'The file name ties the line to the store and the day. The size shows at a glance if a file is empty or far bigger than usual. Neither needs the content.',
  },
  {
    id: 'log-3005',
    kind: 'write',
    situation:
      'The move to /data/archive/sales failed with FILE:FILE_ALREADY_EXISTS, because a file with the same name is already there. The sales were loaded. An On Error Continue moves the file to /data/error/sales instead. vars.fileName holds the file name.',
    available: ['vars.fileName', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/archive|already exists|not moved|move/i, 'Sales file not archived: name already exists'),
      has(/vars\.fileName/, 'Add the file name: fileName=$(vars.fileName).'),
      errorFacts,
      next('next=moved to /data/error/sales'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Sales file not archived: name already exists fileName=$(vars.fileName) errorType=$(error.errorType) description=$(error.description) next=moved to /data/error/sales correlationId=$(correlationId)"]',
    },
    explain:
      'The sales were loaded, so the work did not fail. But a file with the same name came twice, which someone should look at. WARN, with where the file is now.',
  },

  // ---------- lg-062 Brackenfield Tools: stock export scheduler ----------
  {
    id: 'log-3006',
    kind: 'level',
    situation:
      'At Brackenfield Tools a Scheduler runs the stock export every 10 minutes. This run finds no stock changes since the last one, so it writes no file.',
    answer: ['DEBUG'],
    explain:
      'An empty run is normal and happens many times a day. At INFO it would be 144 lines a day that say nothing. Keep it at DEBUG, and log the runs that export something at INFO.',
  },
  {
    id: 'log-3007',
    kind: 'choice',
    situation: 'A Brackenfield stock export run has written its file to /exports/stock. Which message is best?',
    options: [
      'Export run complete',
      'Wrote file',
      'Stock export written fileName=stock-20261112-1410.csv rows=842 durationMs=1930 correlationId=a41f07',
      'Stock export written rows=842 content=[{"sku":"TW-220","qty":14},{"sku":"TW-221","qty":3}]',
    ],
    answer: 2,
    explain:
      'It names the file, gives the row count and the time. The warehouse can check the file against the row count. The last option puts the export itself in the log.',
  },
  {
    id: 'log-3008',
    kind: 'multi',
    situation: 'The first logger of the Brackenfield stock export, which a Scheduler starts every 10 minutes. Which are problems?',
    code: `<logger level="INFO" message='#["Scheduler fired"]' />`,
    options: [
      'It is written 144 times a day at INFO, even when nothing is exported',
      'It does not name the job, so with several schedulers in the app nobody knows which one ran',
      'There is no correlation ID, so the run cannot be tied to its other lines',
      'A flow started by a Scheduler has no correlation ID, so there is nothing to add',
      'A Scheduler flow may only log at DEBUG',
    ],
    answers: [0, 1, 2],
    explain:
      'Mule gives every event a correlation ID, also the ones a Scheduler starts, and any level can be used. Log the start at DEBUG with the job name, and one INFO line when a file is written.',
  },
  {
    id: 'log-3009',
    kind: 'write',
    situation:
      'Write the last logger of a Brackenfield stock export run that wrote a file. vars.fileName, vars.rowCount and vars.durationMs are set.',
    available: ['vars.fileName', 'vars.rowCount', 'vars.durationMs', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/written|wrote|exported|created|finished/i, 'Stock export written'),
      has(/vars\.rowCount/, 'Add how many rows were written: rows=$(vars.rowCount).'),
      labelled('fileName'),
      duration,
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Stock export written fileName=$(vars.fileName) rows=$(vars.rowCount) durationMs=$(vars.durationMs) correlationId=$(correlationId)"]',
    },
    explain:
      'The file name and the row count let the warehouse team match the line to the file they got. The duration shows if exports get slower over the weeks.',
  },
  {
    id: 'log-3010',
    kind: 'write',
    situation:
      'The File Write to /exports/stock fails with FILE:ACCESS_DENIED: the app is not allowed to write to that folder. No file is exported, and every next run will fail the same way until someone fixes the rights. vars.fileName is set.',
    available: ['vars.fileName', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|not written|denied|could not/i, 'Stock export failed: write denied'),
      errorFacts,
      labelled('fileName'),
      has(/\/exports\/stock|folder|directory|path/i, 'Name the folder, such as folder=/exports/stock.'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["Stock export failed: write denied folder=/exports/stock fileName=$(vars.fileName) errorType=$(error.errorType) description=$(error.description) correlationId=$(correlationId)"]',
    },
    explain:
      'A retry will not help: the rights must be fixed by a person. That is ERROR. The folder name tells the platform team where to look.',
  },

  // ---------- lg-063 Northbridge College: enrolment batch ----------
  {
    id: 'log-3011',
    kind: 'level',
    situation:
      'The Northbridge College enrolment batch job reaches On Complete. payload.totalRecords is 3,400 and payload.successfulRecords is 3,400.',
    answer: ['INFO'],
    explain:
      'The job finished and every record worked. That is the normal end of a run, so INFO, with the counts so the registry office can see the load is whole.',
  },
  {
    id: 'log-3012',
    kind: 'choice',
    situation:
      'In the validateEnrolment batch step, an enrolment record has no course code, so the step raises an error and the record fails. Which message is best?',
    options: [
      'Enrolment record failed studentId=S-20417 reason=courseCode missing batchStep=validateEnrolment correlationId=c0a7e1',
      'Bad record from the college, they never fill it in!!!',
      'Enrolment record failed: {"studentId":"S-20417","name":"Mia Okafor","email":"mia.okafor@example.org","courseCode":null}',
      'Validation error occurred',
    ],
    answer: 0,
    explain:
      'The student ID and the reason are enough for the registry office to fix the record. The third option puts a name and an email in the log, and the second blames people.',
  },
  {
    id: 'log-3013',
    kind: 'multi',
    situation: 'A logger in a batch step of the Northbridge enrolment job, which loads 3,400 records each run. Which are problems?',
    code: `<logger level="INFO" message='#["Enrolment processed for $(payload.studentName) email=$(payload.email)"]' />`,
    options: [
      'One INFO line per record writes 3,400 lines each run',
      'The student name and email are personal data',
      'Inside a batch step, payload is the whole file, so payload.studentName is empty',
      'There is no correlation ID and no record ID such as studentId',
      'A Logger cannot be placed inside a batch step',
    ],
    answers: [0, 1, 3],
    explain:
      'Inside a batch step the payload is one record, so the fields are there, and a Logger works fine. Keep the per-record line at DEBUG with the student ID, and log the totals once in On Complete.',
  },
  {
    id: 'log-3014',
    kind: 'write',
    situation:
      'Write the logger right before the Northbridge enrolment Batch Job. The CSV has been read, so payload is an array of enrolments. vars.fileName holds the file name.',
    available: ['vars.fileName', 'sizeOf(payload)', 'payload', 'payload[0].studentEmail', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/start|load|begin|received/i, 'Enrolment load starting'),
      has(/sizeOf\(\s*payload\s*\)/, 'Add how many records go into the job: records=$(sizeOf(payload)).'),
      labelled('records', 'records=$(sizeOf(payload))'),
      labelled('fileName'),
      corr,
      noPayload,
      noPersonal,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Enrolment load starting fileName=$(vars.fileName) records=$(sizeOf(payload)) correlationId=$(correlationId)"]' },
    explain:
      'The record count at the start can be matched with the total in On Complete. If they differ, records were lost in the load phase. The count does not need the records themselves.',
  },
  {
    id: 'log-3015',
    kind: 'write',
    situation:
      'Write the logger in On Complete of the Northbridge enrolment job. Tonight 8 of 3,400 records failed, and a later flow sends them to the registry office.',
    available: [
      'payload.batchJobInstanceId',
      'payload.totalRecords',
      'payload.successfulRecords',
      'payload.failedRecords',
      'payload',
      'correlationId',
    ],
    level: ['INFO', 'WARN'],
    checks: [
      says(/finish|complete|ended/i, 'Enrolment load finished'),
      has(/payload\.totalRecords/, 'Add the total: total=$(payload.totalRecords).'),
      has(/payload\.successfulRecords/, 'Add the successful count: successful=$(payload.successfulRecords).'),
      has(/payload\.failedRecords/, 'Add the failed count: failed=$(payload.failedRecords).'),
      labelled('failed'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Enrolment load finished jobId=$(payload.batchJobInstanceId) total=$(payload.totalRecords) successful=$(payload.successfulRecords) failed=$(payload.failedRecords) correlationId=$(correlationId)"]',
    },
    explain:
      'In On Complete the payload is the BatchJobResult, so the counts are fields of it. INFO is fine, or WARN when you want failed runs to stand out. Never write the whole result.',
  },

  // ---------- lg-064 Kestrel Office Supplies: invoice files over FTP ----------
  {
    id: 'log-3016',
    kind: 'level',
    situation:
      'Kestrel Office Supplies writes invoice files to a partner FTP server. The FTP Write fails with FTP:FILE_ALREADY_EXISTS, because an earlier run already sent this invoice. The flow counts it as delivered and goes on.',
    answer: ['WARN'],
    explain:
      'Nothing is lost, so it is not ERROR. But the same invoice was sent twice, which is not expected. WARN lets the team count these and find the cause.',
  },
  {
    id: 'log-3017',
    kind: 'choice',
    situation: 'The Kestrel invoice flow has written an invoice file to the partner FTP folder /in/invoices. Which message is best?',
    options: [
      'Invoice file sent to FTP',
      'Invoice file sent invoiceId=INV-88213 fileName=INV-88213.csv folder=/in/invoices correlationId=93be0d',
      'Invoice file sent login=kestrel_out password=changeme host=ftp.lumen-books.example',
      'Sending...',
    ],
    answer: 1,
    explain:
      'When the partner says an invoice never came, this line shows which file went where. The third option writes the FTP login and password to the log.',
  },
  {
    id: 'log-3018',
    kind: 'multi',
    situation: 'A colleague adds this line before the FTP Write in the Kestrel invoice flow, to debug a login problem. Which are problems?',
    code: `<logger level="DEBUG" message="#['FTP login user=' ++ p('ftp.user') ++ ' password=' ++ p('secure::ftp.password')]" />`,
    options: [
      'It writes the FTP password to the log',
      'DEBUG is off in production, so the password is safe',
      'Mule masks secure properties when a Logger writes them',
      'There is no correlation ID and no invoice ID',
    ],
    answers: [0, 3],
    explain:
      'p() returns the decrypted value, and Mule does not mask it in a Logger. DEBUG is often turned on in production to find a fault, so a password at DEBUG still leaks. Log the user and host only.',
  },
  {
    id: 'log-3019',
    kind: 'write',
    situation:
      'Write the logger after the FTP Write of the Kestrel invoice flow has worked. vars.invoiceId and vars.fileName are set. The folder is /in/invoices.',
    available: ['vars.invoiceId', 'vars.fileName', "p('ftp.host')", "p('secure::ftp.password')", 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/sent|written|uploaded|delivered/i, 'Invoice file sent to partner FTP'),
      labelled('invoiceId'),
      labelled('fileName'),
      corr,
      noPayload,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Invoice file sent to partner FTP invoiceId=$(vars.invoiceId) fileName=$(vars.fileName) folder=/in/invoices correlationId=$(correlationId)"]',
    },
    explain:
      'The invoice ID ties the file to the order, and the file name finds it on the partner server. The password has no place in any line.',
  },
  {
    id: 'log-3020',
    kind: 'write',
    situation:
      'The partner FTP server refuses the connection and the FTP Write fails with FTP:CONNECTIVITY. The flow keeps the invoice on its retry list, and the scheduler tries again in 30 minutes. vars.invoiceId is set.',
    available: ['vars.invoiceId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/fail|not sent|refused|could not|unreachable|connect/i, 'Invoice file not sent: FTP connection refused'),
      errorFacts,
      labelled('invoiceId'),
      next('next=retry in 30 min'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Invoice file not sent: FTP connection refused invoiceId=$(vars.invoiceId) errorType=$(error.errorType) description=$(error.description) next=retry in 30 min correlationId=$(correlationId)"]',
    },
    explain:
      'The app handles it with a retry, so WARN. If the retries keep failing, the last one should log ERROR. The next= part tells the reader nobody has to act yet.',
  },

  // ---------- lg-065 Bluewater Insurance: batch steps and accept policies ----------
  {
    id: 'log-3021',
    kind: 'level',
    situation:
      'Bluewater Insurance runs a nightly renewal batch job. Its last step, reportFailures, has acceptPolicy="ONLY_FAILURES" and logs one line per failed record. About 20 of 50,000 records fail each night.',
    answer: ['WARN'],
    explain:
      'Only failed records reach this step, so the volume stays small. Each line is a renewal that did not go through and needs a look, but the job handled it. WARN.',
  },
  {
    id: 'log-3022',
    kind: 'choice',
    situation: 'The Bluewater renewal batch job starts for tonight\'s file of 50,000 policies. Which message is best?',
    options: [
      'Batch job started',
      'Renewal batch started jobName=policyRenewals fileName=renewals-20261112.csv records=50000 correlationId=e2d904',
      'Renewal batch started records=[{"policyId":"BW-55120","holder":"Ravi Menon"},{"policyId":"BW-55121","holder":"Ana Ruiz"}]',
      'Starting renewals, fingers crossed',
    ],
    answer: 1,
    explain:
      'It names the job and the file and gives the record count, which On Complete can be checked against. The third option logs the records with the holders\' names.',
  },
  {
    id: 'log-3023',
    kind: 'multi',
    situation:
      'The Bluewater job has three batch steps: validateRenewal, priceRenewal and reportFailures. Only reportFailures sets acceptPolicy="ONLY_FAILURES". Which statements are true?',
    options: [
      'reportFailures gets only the records that failed in an earlier step',
      'A record that failed in validateRenewal does not reach priceRenewal, because the default policy is NO_FAILURES',
      'reportFailures gets every record, so its logger must check for failures itself',
      'A logger in reportFailures runs once for each failed record',
      'acceptPolicy="ALL" would keep failed records out of a step',
    ],
    answers: [0, 1, 3],
    explain:
      'NO_FAILURES is the default, so failed records skip the normal steps. ONLY_FAILURES takes only them, and ALL takes both. A logger in a step runs once per record it gets.',
  },
  {
    id: 'log-3024',
    kind: 'write',
    situation:
      'Write the logger in the Bluewater reportFailures step. vars.failedStep holds the name of the step that failed, taken from Batch::getStepExceptions(). The record has policyId and holderName.',
    available: ['payload.policyId', 'vars.failedStep', 'payload.holderName', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/fail|reject|not renewed/i, 'Renewal record failed'),
      labelled('policyId'),
      has(/vars\.failedStep/, 'Add the step that failed: failedStep=$(vars.failedStep).'),
      { not: /holderName/i, say: 'Leave out the holder name. The policy ID is enough.' },
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'WARN', message: '#["Renewal record failed policyId=$(payload.policyId) failedStep=$(vars.failedStep) correlationId=$(correlationId)"]' },
    explain:
      'The policy ID finds the record, and the failed step tells the team which rule to look at. The holder name is personal data and adds nothing the ID does not give.',
  },
  {
    id: 'log-3025',
    kind: 'write',
    situation:
      'In the Bluewater priceRenewal step, each record gets a new premium in vars.premium. You want a line per record that stays off in production, for when pricing looks wrong.',
    available: ['payload.policyId', 'vars.premium', 'payload', 'payload.holderName', 'correlationId'],
    level: ['DEBUG'],
    checks: [
      says(/priced|premium|calculated/i, 'Renewal priced'),
      labelled('policyId'),
      has(/vars\.premium/, 'Add the new premium: premium=$(vars.premium).'),
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'DEBUG', message: '#["Renewal priced policyId=$(payload.policyId) premium=$(vars.premium) correlationId=$(correlationId)"]' },
    explain:
      'One line per record is 50,000 lines a night, so DEBUG. When a premium looks wrong, turn on DEBUG for this category and the line shows the price each policy got.',
  },

  // ---------- lg-066 Orchard Medical Supplies: Batch Aggregator ----------
  {
    id: 'log-3026',
    kind: 'level',
    situation:
      'Orchard Medical Supplies sends its catalog in chunks: a Batch Aggregator with size 500 writes each chunk to SFTP. One chunk takes 41 seconds, where chunks usually take about 1 second. The job still ends on time.',
    answer: ['WARN'],
    explain:
      'Nothing failed, but the slow chunk is not normal. A WARN with the chunk and the duration warns you before the job starts to miss its window.',
  },
  {
    id: 'log-3027',
    kind: 'choice',
    situation: 'The Orchard Batch Aggregator has written a chunk of 500 catalog records to SFTP. Which message is best?',
    options: [
      'Chunk: [{"sku":"OM-1102","name":"Nitrile gloves M","price":8.4},{"sku":"OM-1103","name":"Nitrile gloves L","price":8.4}]',
      'Aggregator fired',
      'Wrote 500',
      'Catalog chunk written part=part-0042.csv records=500 durationMs=812 correlationId=17ab3e',
    ],
    answer: 3,
    explain:
      'It names the part file, gives the count and the time. The first option dumps the records of the chunk, which for a large catalog means the whole catalog ends up in the log.',
  },
  {
    id: 'log-3028',
    kind: 'multi',
    situation: 'A logger in the Orchard Batch Aggregator, size 500. The job has 120,000 records. Which are problems?',
    code: `<logger level="INFO" message="#['Chunk ' ++ write(payload, 'application/json')]" />`,
    options: [
      'Each line holds all 500 records, so one run writes the whole catalog to the log',
      'There is no correlation ID and no part name',
      'write() cannot be used inside a Batch Aggregator',
      'The logger runs once per record, not once per chunk',
    ],
    answers: [0, 1],
    explain:
      'In a Batch Aggregator the payload is the array of records in the chunk, and the logger runs once per chunk. write() works there, which is why the whole chunk lands in the log. Log sizeOf(payload) instead.',
  },
  {
    id: 'log-3029',
    kind: 'write',
    situation:
      'Write the logger in the Orchard Batch Aggregator after the SFTP Write of a chunk. payload is the array of records in the chunk. vars.partName holds the part file name.',
    available: ['sizeOf(payload)', 'vars.partName', 'payload', 'payload[0].sku', 'correlationId'],
    level: ['INFO', 'DEBUG'],
    checks: [
      says(/written|wrote|sent|uploaded/i, 'Catalog chunk written'),
      has(/sizeOf\(\s*payload\s*\)/, 'Add how many records are in the chunk: records=$(sizeOf(payload)).'),
      labelled('records', 'records=$(sizeOf(payload))'),
      has(/vars\.partName/, 'Add the part file name: part=$(vars.partName).'),
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Catalog chunk written part=$(vars.partName) records=$(sizeOf(payload)) correlationId=$(correlationId)"]' },
    explain:
      '120,000 records in chunks of 500 is 240 lines a run, a fair volume at INFO. DEBUG is fine too. The count is cheap, because the chunk is already in memory.',
  },
  {
    id: 'log-3030',
    kind: 'write',
    situation:
      'In the Orchard Batch Aggregator the SFTP Write sits in a Try. Its On Error Propagate logs and rethrows, so the 500 records of the chunk are marked failed and nobody resends them on their own. Write that logger. vars.partName is set.',
    available: ['vars.partName', 'sizeOf(payload)', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|not written|could not/i, 'Catalog chunk not written'),
      errorFacts,
      has(/vars\.partName/, 'Add the part file name: part=$(vars.partName).'),
      has(/sizeOf\(\s*payload\s*\)/, 'Add how many records failed: records=$(sizeOf(payload)).'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Catalog chunk not written part=$(vars.partName) records=$(sizeOf(payload)) errorType=$(error.errorType) description=$(error.description) next=records marked failed correlationId=$(correlationId)"]',
    },
    explain:
      '500 products did not reach the warehouse and must be sent again by a person. That is ERROR. The record count shows how big the gap is.',
  },

  // ---------- lg-067 Lakeside Energy: watermarks in Object Store ----------
  {
    id: 'log-3031',
    kind: 'level',
    situation:
      'Lakeside Energy reads meter files from SFTP newer than a watermark kept in Object Store. On the first run after a new deploy, os:retrieve finds no watermark, so the flow uses its default of 24 hours ago.',
    answer: ['INFO', 'WARN'],
    explain:
      'It is expected after a first deploy, so INFO fits. WARN is fair too, because a missing watermark at any other time means the store was cleared and files may be read twice.',
  },
  {
    id: 'log-3032',
    kind: 'choice',
    situation: 'A Lakeside run has read its files and stored a new watermark in Object Store. Which message is best?',
    options: [
      'Readings watermark updated key=readings-watermark from=2026-11-12T14:00:00Z to=2026-11-12T14:15:00Z files=3 correlationId=0c55aa',
      'Watermark saved',
      'Object Store updated: {"key":"readings-watermark","value":"2026-11-12T14:15:00Z","entryTtl":null,"partition":"default"}',
      'Watermark updated!!! all good',
    ],
    answer: 0,
    explain:
      'With the old and the new value in the log, you can tell later why a file was read twice or skipped. The key tells you which entry to look at.',
  },
  {
    id: 'log-3033',
    kind: 'multi',
    situation: 'After the os:store that saves the new watermark in the Lakeside flow. Which are problems?',
    code: `<logger level="INFO" message='#["Watermark updated"]' />`,
    options: [
      'Object Store values cannot be read in a Logger',
      'It does not name the Object Store key',
      'There is no correlation ID',
      'A watermark line should be ERROR, so it is always seen',
      'It does not show the old and the new value, so a skipped or repeated file cannot be traced',
    ],
    answers: [1, 2, 4],
    explain:
      'A watermark change is a normal event, so INFO is right. What is missing are the facts: the key, the values before and after, and the correlation ID.',
  },
  {
    id: 'log-3034',
    kind: 'write',
    situation:
      'Loading one Lakeside meter file failed, so the flow does not move the watermark. The same files will be read again on the next run. vars.oldWatermark and vars.fileName are set.',
    available: ['vars.oldWatermark', 'vars.fileName', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/not updated|kept|unchanged|not moved/i, 'Readings watermark kept'),
      has(/vars\.oldWatermark/, 'Add the watermark that stays: watermark=$(vars.oldWatermark).'),
      errorFacts,
      next('next=files read again next run'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Readings watermark kept watermark=$(vars.oldWatermark) fileName=$(vars.fileName) errorType=$(error.errorType) description=$(error.description) next=files read again next run correlationId=$(correlationId)"]',
    },
    explain:
      'Keeping the watermark is how the flow handles the failure, so WARN. If the same file fails run after run, these lines show it, and someone can step in.',
  },
  {
    id: 'log-3035',
    kind: 'write',
    situation:
      'A Lakeside run has listed the SFTP folder and found files newer than the watermark. vars.newFiles is the list of their names and vars.watermark the time it compared with.',
    available: ['vars.watermark', 'vars.newFiles', 'sizeOf(vars.newFiles)', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/found|picked up|new|listed/i, 'New reading files found'),
      has(/sizeOf\(\s*vars\.newFiles\s*\)/, 'Add how many files: files=$(sizeOf(vars.newFiles)).'),
      has(/vars\.watermark/, 'Add the watermark the run used: since=$(vars.watermark).'),
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'INFO', message: '#["New reading files found files=$(sizeOf(vars.newFiles)) since=$(vars.watermark) correlationId=$(correlationId)"]' },
    explain:
      'The count and the watermark show what the run decided to read. If a file was missed, compare its time with the since= value of the runs around it.',
  },

  // ---------- lg-068 Ashgrove Logistics: CSV rows that do not parse ----------
  {
    id: 'log-3036',
    kind: 'level',
    situation:
      'In an Ashgrove Logistics delivery CSV, one row has a blank notes column. Notes are optional, so the mapping uses an empty default and loads the row.',
    answer: ['DEBUG', 'TRACE'],
    explain:
      'This is how the mapping is meant to work, and nobody has to act. A line for it is detail for troubleshooting at most, so DEBUG. TRACE is defensible as well: it is one line per row of per-field detail, and teams that keep DEBUG readable push that depth down to TRACE.',
  },
  {
    id: 'log-3037',
    kind: 'choice',
    situation: 'Row 412 of an Ashgrove delivery file has a date the flow cannot read. The row goes to a rejects file, and the other rows load. Which message is best?',
    options: [
      'Row rejected: "D-11820;Lena Fischer;12 Birch Road;12/31/2026"',
      'Bad data',
      'Delivery row rejected fileName=deliveries-1112.csv row=412 column=deliveryDate reason=not a valid date correlationId=8e3f10',
      'Row 412 rejected because the depot staff cannot type dates',
    ],
    answer: 2,
    explain:
      'File, row, column and reason are all support needs to fix the row. The first option copies the row, with a name and a home street in it. The last one blames people.',
  },
  {
    id: 'log-3038',
    kind: 'multi',
    situation: 'Which of these belong in the WARN line for one rejected row of an Ashgrove delivery file?',
    options: [
      'The full text of the row, with the customer name and delivery street',
      'The file name',
      'The whole file, so support can open it from the log',
      'The row number',
      'The column that failed and the reason',
    ],
    answers: [1, 3, 4],
    explain:
      'File, row number, column and reason lead a person to the exact spot in the rejects file. The row text and the file belong in that file, not in the log.',
  },
  {
    id: 'log-3039',
    kind: 'write',
    situation:
      'The Ashgrove flow has split a delivery file into good and bad rows. vars.goodRows are loaded and vars.badRows go to /error/deliveries. Write one summary line. vars.fileName is set.',
    available: ['vars.fileName', 'sizeOf(vars.goodRows)', 'sizeOf(vars.badRows)', 'vars.badRows', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/reject|skipp|could not|bad rows|invalid/i, 'Delivery rows rejected'),
      has(/sizeOf\(\s*vars\.badRows\s*\)/, 'Add how many rows were rejected: rejected=$(sizeOf(vars.badRows)).'),
      has(/sizeOf\(\s*vars\.goodRows\s*\)/, 'Add how many rows loaded: loaded=$(sizeOf(vars.goodRows)).'),
      { not: /\$\(\s*vars\.badRows\s*\)/, say: 'Do not log the rejected rows themselves. They hold customer data. Log the count.' },
      labelled('fileName'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Delivery rows rejected fileName=$(vars.fileName) rejected=$(sizeOf(vars.badRows)) loaded=$(sizeOf(vars.goodRows)) next=rejects in /error/deliveries correlationId=$(correlationId)"]',
    },
    explain:
      'The load went on, but some deliveries are missing until someone fixes the rows. WARN with both counts shows how big the gap is and where the rows wait.',
  },
  {
    id: 'log-3040',
    kind: 'write',
    situation:
      'An Ashgrove partner sent the delivery file with a different separator, so the whole file fails to parse with MULE:EXPRESSION. Nothing is loaded and the depots plan their day from this file. The On Error moves it to /error/deliveries. vars.fileName is set.',
    available: ['vars.fileName', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/reject|fail|could not|not loaded/i, 'Delivery file rejected: cannot parse'),
      errorFacts,
      labelled('fileName'),
      next('next=moved to /error/deliveries'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["Delivery file rejected: cannot parse fileName=$(vars.fileName) errorType=$(error.errorType) description=$(error.description) next=moved to /error/deliveries correlationId=$(correlationId)"]',
    },
    explain:
      'No delivery was loaded and the depots wait for it. Someone must get a good file from the partner, so ERROR, with the file name and where it is now.',
  },

  // ---------- lg-069 Maple Transit: cron and overlapping runs ----------
  {
    id: 'log-3041',
    kind: 'level',
    situation:
      'Maple Transit loads fare files with a cron Scheduler at 02:00. The flow takes a lock in Object Store first. Tonight the lock is still held by last night\'s run, so this run is skipped.',
    answer: ['WARN'],
    explain:
      'The lock did its job, so nothing broke. But a run that lasts a whole day is not normal, and tonight\'s files wait. WARN, so someone looks at the run that is still going.',
  },
  {
    id: 'log-3042',
    kind: 'choice',
    situation: 'The 02:00 Maple Transit run found the lock still held and skipped. Which message is best?',
    options: [
      'Skipping',
      'LOCKED!!! again',
      'Fare load skipped, lock={"owner":"worker-2","acquired":"2026-11-12T02:00:04Z","ttl":86400000,"value":"..."}',
      'Fare load skipped: previous run still active lockKey=fare-load-lock lockedSince=2026-11-12T02:00:04Z correlationId=4b9d21',
    ],
    answer: 3,
    explain:
      'It says the run was skipped and why, and how long the lock has been held. That points straight at the run that never ended.',
  },
  {
    id: 'log-3043',
    kind: 'multi',
    situation: 'Which of these belong in the INFO line when the Maple Transit 02:00 fare load starts?',
    options: [
      'The cron expression, copied into every line of the run',
      'The job name',
      'The date of the fare files the run loads',
      'The SFTP user and password',
      'The correlation ID',
    ],
    answers: [1, 2, 4],
    explain:
      'The job name and the business date say which load this is, and the correlation ID ties its lines together. The cron expression is in the config, not in each line, and passwords never go in a log.',
  },
  {
    id: 'log-3044',
    kind: 'write',
    situation:
      'Write the first logger of the Maple Transit fare load, after the lock is taken. vars.businessDate holds the date of the fares being loaded.',
    available: ['vars.businessDate', "p('fare.cron')", 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/start|began|begin|triggered/i, 'Fare load started'),
      labelled('businessDate', 'businessDate=$(vars.businessDate)'),
      { must: /job\s*"?\s*[=:]\s*"?\s*[A-Za-z][\w.-]{3,}/i, say: 'Label the job name, such as job=fareLoad, so one load can be searched for.' },
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Fare load started job=fareLoad businessDate=$(vars.businessDate) correlationId=$(correlationId)"]' },
    explain:
      'Once a day, a start line at INFO is cheap. With the business date in it, a rerun for an old day can be told apart from the normal 02:00 run.',
  },
  {
    id: 'log-3045',
    kind: 'write',
    situation:
      'The Maple Transit fare load must end by 05:00, when the first trains run. Tonight it ended at 05:40, but all files loaded. vars.businessDate, vars.fileCount and vars.durationMs are set.',
    available: ['vars.businessDate', 'vars.fileCount', 'vars.durationMs', 'payload', 'correlationId'],
    level: ['WARN'],
    checks: [
      says(/late|after|slow|overran/i, 'Fare load finished late'),
      duration,
      labelled('businessDate'),
      has(/05:00|deadline|due|limit/i, 'Add the deadline it missed, such as deadline=05:00.'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["Fare load finished late businessDate=$(vars.businessDate) files=$(vars.fileCount) durationMs=$(vars.durationMs) deadline=05:00 correlationId=$(correlationId)"]',
    },
    explain:
      'The work was done, so it is not ERROR. But it missed its deadline, and a few more minutes each night will collide with the next run. WARN with the duration and the deadline.',
  },

  // ---------- lg-070 Larkfield Media: large files and streaming ----------
  {
    id: 'log-3046',
    kind: 'level',
    situation:
      'Larkfield Media loads 2 GB ad impression files. While you build the mapping in dev, you want to see the first 3 records of a file.',
    answer: ['DEBUG'],
    explain:
      'This is detail for building, and it holds real data. DEBUG keeps it out of production logs. Log a few records, never the whole stream.',
  },
  {
    id: 'log-3047',
    kind: 'level',
    situation:
      'A Larkfield impression file arrives with a size of 0 bytes. The flow skips it and moves it to /error/impressions. The partner usually sends the file again within the hour.',
    answer: ['WARN'],
    explain:
      'The flow handled it and the partner usually fixes it. But if the new file never comes, a day of data is missing, so the line must stand out. WARN.',
  },
  {
    id: 'log-3048',
    kind: 'choice',
    situation:
      'The SFTP Listener has picked up a 2 GB gzipped Larkfield impression file. The flow streams it and decompresses it later. Which line can be written at pickup without reading the file?',
    options: [
      'Impressions file picked up fileName=imp-20261112.csv.gz rows=14203311 correlationId=6f0e12',
      'Impressions file picked up fileName=imp-20261112.csv.gz sizeBytes=2147483648 correlationId=6f0e12',
      'File: imp-20261112.csv.gz',
      'Impressions file picked up firstLines=ts,campaignId,deviceId,ip 2026-11-12T00:00:01Z,C-881,dv-5521,203.0.113.7',
    ],
    answer: 1,
    explain:
      'attributes.size comes with the file, so it costs nothing. A row count needs the whole 2 GB decompressed and parsed first, because the file arrives gzipped. The last option logs data, including an IP address.',
  },
  {
    id: 'log-3049',
    kind: 'multi',
    situation:
      'A 2 GB Larkfield file is read from SFTP, passed through a gunzip step and parsed as CSV. This logger sits right after the parse. The read uses a non-repeatable stream. Which statements are true?',
    code: `<logger level="INFO" message='#["File read rows=$(sizeOf(payload)) correlationId=$(correlationId)"]' />`,
    options: [
      'sizeOf(payload) must read the whole 2 GB stream to count the rows',
      'The stream can be read only once, so the next processor finds it used up',
      'sizeOf(payload) costs nothing, because Mule keeps a row count for every file',
      'The line has no correlation ID',
      'attributes.size gives the size in bytes without reading the stream',
    ],
    answers: [0, 1, 4],
    explain:
      'A count is fine for an array already in memory, but on a stream it reads everything, decompressing and parsing the lot. With a non-repeatable stream the data is then gone for the rest of the flow. Log attributes.size at pickup, and the row count after the flow has parsed the rows it needs anyway.',
  },
  {
    id: 'log-3050',
    kind: 'write',
    situation:
      'Write the first logger after the SFTP Listener of the Larkfield flow. The 2 GB file is streamed, so the logger must not read it.',
    available: ['attributes.fileName', 'attributes.size', 'sizeOf(payload)', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/picked up|received|arrived|new|found/i, 'Impressions file picked up'),
      has(/attributes\.size/, 'Add the size from attributes.size. It costs nothing to read.'),
      { not: /sizeOf\(\s*payload/, say: 'Do not use sizeOf(payload) on a 2 GB stream. It reads the whole file. Use attributes.size.' },
      labelled('fileName'),
      corr,
      noPayload,
      noVague,
    ],
    model: { level: 'INFO', message: '#["Impressions file picked up fileName=$(attributes.fileName) sizeBytes=$(attributes.size) correlationId=$(correlationId)"]' },
    explain:
      'The file name and the size come from the attributes, not from the stream. The flow can then read the file once, in its mapping.',
  },

  // ---------- lg-071 Willowdene Pharmacy: nightly reconciliation ----------
  {
    id: 'log-3051',
    kind: 'level',
    situation:
      'Willowdene Pharmacy loads stock moves each night. The file trailer says 18,240 records, the flow read 18,240 and loaded 18,240.',
    answer: ['INFO'],
    explain:
      'The counts agree, which is the normal end of the load. One INFO line with the three counts proves the night\'s data is whole.',
  },
  {
    id: 'log-3052',
    kind: 'level',
    situation:
      'The Willowdene trailer says 18,240 records, but the file holds 18,236. The flow stops before it loads anything, and tomorrow\'s stock orders depend on this load.',
    answer: ['ERROR'],
    explain:
      'Nothing was loaded and the stock orders will be wrong unless someone gets a full file. That needs a person, so ERROR.',
  },
  {
    id: 'log-3053',
    kind: 'choice',
    situation: 'The Willowdene counts do not match and the load stops. Which message is best?',
    options: [
      'Counts differ',
      'MISMATCH!!! someone check the file',
      'Stock moves not loaded: count mismatch fileName=moves-20261112.dat expected=18240 found=18236 next=load stopped correlationId=7a2c91',
      'Stock moves not loaded, rows=[{"sku":"CP-4410","qty":-2,"store":"S-12"},{"sku":"CP-4411","qty":5,"store":"S-12"}]',
    ],
    answer: 2,
    explain:
      'Both counts, the file and what happened next are all in one line. Whoever gets paged knows at once how many rows are missing and that nothing was loaded.',
  },
  {
    id: 'log-3054',
    kind: 'multi',
    situation: 'Which of these belong in the reconciliation line at the end of the Willowdene nightly load?',
    options: [
      'The record count the trailer promised',
      'The patient ID for each moved item',
      'The number of rows read from the file',
      'The number of rows loaded and the number rejected',
      'The quantity of all 18,240 rows, as a list',
    ],
    answers: [0, 2, 3],
    explain:
      'Expected, read, loaded and rejected show where any row went missing. Patient IDs and row lists are data, not a reconciliation, and they make the line huge.',
  },
  {
    id: 'log-3055',
    kind: 'write',
    situation:
      'Write the reconciliation logger at the end of a Willowdene load where loaded plus rejected equals the trailer count. vars.expectedCount, vars.readCount, vars.loadedCount and vars.rejectedCount are set.',
    available: ['vars.expectedCount', 'vars.readCount', 'vars.loadedCount', 'vars.rejectedCount', 'payload', 'correlationId'],
    level: ['INFO'],
    checks: [
      says(/reconcil|match|balanced|counts/i, 'Stock moves reconciled'),
      has(/vars\.expectedCount/, 'Add the trailer count: expected=$(vars.expectedCount).'),
      has(/vars\.readCount/, 'Add how many rows were read: read=$(vars.readCount).'),
      has(/vars\.loadedCount/, 'Add how many loaded: loaded=$(vars.loadedCount).'),
      has(/vars\.rejectedCount/, 'Add how many were rejected: rejected=$(vars.rejectedCount).'),
      labelled('expected', 'expected=$(vars.expectedCount)'),
      labelled('read', 'read=$(vars.readCount)'),
      labelled('loaded', 'loaded=$(vars.loadedCount)'),
      labelled('rejected', 'rejected=$(vars.rejectedCount)'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Stock moves reconciled expected=$(vars.expectedCount) read=$(vars.readCount) loaded=$(vars.loadedCount) rejected=$(vars.rejectedCount) correlationId=$(correlationId)"]',
    },
    explain:
      'Every row is accounted for, so INFO. The four counts let an auditor check the night in one line, and a search on rejected= finds the nights that need a look.',
  },

  // ---------- lg-072 Summit Payroll: max failed records ----------
  {
    id: 'log-3056',
    kind: 'level',
    situation:
      'The Summit Payroll batch job has maxFailedRecords="50". The 51st record fails, so the job stops. 7,800 of 12,000 employees have not been processed.',
    answer: ['ERROR'],
    explain:
      'Most of the payroll was not calculated, and pay day does not wait. Someone must fix the data and run it again. ERROR.',
  },
  {
    id: 'log-3057',
    kind: 'choice',
    situation: 'A Summit Payroll record fails in the calculatePay step because the tax code is missing. Which message is best?',
    options: [
      'Payroll record failed: Daniel Ortiz, salary 4250.00, bank account NL00 BANK 0000 0000 00',
      'Record failed',
      'Payroll record failed employeeId=E-30417',
      'Payroll record failed employeeId=E-30417 batchStep=calculatePay reason=taxCode missing correlationId=a90c3d',
    ],
    answer: 3,
    explain:
      'The employee ID, the step and the reason let payroll fix the record. The first option logs a name, a salary and a bank account. The third has no reason and no correlation ID.',
  },
  {
    id: 'log-3058',
    kind: 'choice',
    situation:
      'In On Complete of the Summit Payroll job, payload.failedOnLoadingPhase is true: the file could not be split into records, so none were loaded. payload.loadingPhaseException holds the reason. Which message is best?',
    options: [
      'Payroll batch failed in the load phase: records not split fileName=pay-2026-11.csv loaded=0 next=no pay calculated correlationId=a90c3d',
      'Payroll batch finished total=0 successful=0 failed=0',
      'Batch error occurred',
      'Payroll input broken, the HR team sent a bad file again',
    ],
    answer: 0,
    explain:
      'Splitting the file into records is the Load and Dispatch phase, so a failure there shows as payload.failedOnLoadingPhase with payload.loadingPhaseException. The second option looks like a quiet night with nothing to do, but no one was paid. Say that the load phase failed and that nothing was loaded.',
  },
  {
    id: 'log-3059',
    kind: 'multi',
    situation: 'The logger in On Complete of the Summit Payroll job. Which are problems?',
    code: `<logger level="INFO" message='#["Payroll run ended $(write(payload))"]' />`,
    options: [
      'In On Complete, payload is the last record, so this line holds personal data',
      'write(payload) dumps the whole BatchJobResult, with step results and any exception text',
      'It says the run ended, but not whether it was stopped by max failed records',
      'INFO is wrong, because On Complete lines must be DEBUG',
      'There is no correlation ID',
    ],
    answers: [1, 2, 4],
    explain:
      'In On Complete the payload is the BatchJobResult, not a record. Pick its fields: payload.totalRecords, payload.processedRecords and payload.failedRecords, so a stopped run reads differently from a full one.',
  },
  {
    id: 'log-3060',
    kind: 'write',
    situation:
      'In On Complete of the Summit Payroll job, a Choice sends runs where payload.processedRecords is less than payload.totalRecords to this logger. maxFailedRecords is 50. Write it.',
    available: [
      'payload.batchJobInstanceId',
      'payload.totalRecords',
      'payload.processedRecords',
      'payload.failedRecords',
      'payload',
      'correlationId',
    ],
    level: ['ERROR'],
    checks: [
      says(/stopped|aborted|halted|not finished|incomplete/i, 'Payroll batch stopped'),
      has(/payload\.batchJobInstanceId/, 'Add the job instance ID: jobId=$(payload.batchJobInstanceId).'),
      has(/payload\.totalRecords/, 'Add the total: total=$(payload.totalRecords).'),
      has(/payload\.processedRecords/, 'Add how many were processed: processed=$(payload.processedRecords).'),
      has(/payload\.failedRecords/, 'Add the failed count: failed=$(payload.failedRecords).'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["Payroll batch stopped: too many failed records jobId=$(payload.batchJobInstanceId) total=$(payload.totalRecords) processed=$(payload.processedRecords) failed=$(payload.failedRecords) maxFailed=50 next=fix data and rerun correlationId=$(correlationId)"]',
    },
    explain:
      'Processed below total is how On Complete shows that the job was stopped. The counts tell payroll how many employees still wait, and the job ID finds the failed records.',
  },

  // ---------- lg-073 Marchmont Auto Parts: EDI orders over SFTP ----------
  {
    id: 'log-3061',
    kind: 'level',
    situation:
      'Marchmont Auto Parts polls the SFTP server of each dealer for X12 850 order files every 5 minutes. One poll fails with SFTP:CONNECTIVITY. The next poll tries again.',
    answer: ['WARN'],
    explain:
      'One failed poll that the next poll retries is handled, so WARN. If the dealer stays unreachable for an hour, a separate ERROR should tell someone.',
  },
  {
    id: 'log-3062',
    kind: 'choice',
    situation: 'A Marchmont dealer\'s X12 850 file has been read and parsed. It holds 12 purchase orders. Which message is best?',
    options: [
      'EDI file read',
      'X12 850 received dealerId=DL-0442 interchangeControl=000004127 orders=12 fileName=dl0442-850-1112.edi correlationId=31c8e5',
      'ISA*00*          *00*          *ZZ*DL0442         *ZZ*MARCHMONT      *261112*1410*U*00401*000004127*0*P*>~',
      'Orders from dealer, see SFTP',
    ],
    answer: 1,
    explain:
      'The interchange control number is how both sides talk about one EDI file. With the dealer, the order count and the file name, a dealer question can be answered from one line.',
  },
  {
    id: 'log-3063',
    kind: 'choice',
    situation: 'A Marchmont 850 fails validation because a required N1 segment is missing. The flow sends a 997 that rejects it. Which message is best?',
    options: [
      'Bad EDI',
      'EDI rejected: segment errors',
      'X12 850 dump: ST*850*0001~BEG*00*SA*PO-77812**20261112~REF*DP*044~',
      'X12 850 rejected dealerId=DL-0442 interchangeControl=000004128 reason=N1 segment missing next=997 reject sent correlationId=31c8e5',
    ],
    answer: 3,
    explain:
      'It says which file was rejected, why, and that the dealer has been told by the 997. The second option gives the reason but no IDs, so nobody can tell which file it was.',
  },
  {
    id: 'log-3064',
    kind: 'multi',
    situation: 'A Marchmont EDI file cannot be parsed at all, and the flow moves it to /error/edi. Which belong in that ERROR line?',
    options: [
      'The file name and the dealer ID',
      'The interchange control number, if the ISA segment could be read',
      'The error type and description',
      'The raw ISA segment, with its sender ID and authorization fields',
      'The folder the file was moved to',
    ],
    answers: [0, 1, 2, 4],
    explain:
      'These facts find the file and tell the dealer which interchange to send again. The ISA segment can carry authorization and security values, so it stays out of the log.',
  },
  {
    id: 'log-3065',
    kind: 'write',
    situation:
      'Write the ERROR logger for the Marchmont EDI file that cannot be parsed. Its orders are not created until the dealer sends a good file. vars.fileName and vars.dealerId are set.',
    available: ['vars.fileName', 'vars.dealerId', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/reject|fail|could not|not read|invalid/i, 'EDI file rejected'),
      errorFacts,
      labelled('fileName'),
      labelled('dealerId'),
      next('next=moved to /error/edi'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["EDI file rejected fileName=$(vars.fileName) dealerId=$(vars.dealerId) errorType=$(error.errorType) description=$(error.description) next=moved to /error/edi correlationId=$(correlationId)"]',
    },
    explain:
      'Orders from a dealer are lost until someone calls them, so ERROR. The dealer ID says who to call, and the folder says where the bad file is.',
  },

  // ---------- lg-074 Harbourview Building Society: fixed-width statement files ----------
  {
    id: 'log-3066',
    kind: 'level',
    situation:
      'Harbourview Building Society loads a fixed-width statement file each night. One record has the unknown transaction code ZZ. The flow maps it to OTHER and loads it, and finance reviews such codes each month.',
    answer: ['WARN'],
    explain:
      'The flow handled it, but the data is not what the mapping expects. WARN lets finance count these lines and add the new code.',
  },
  {
    id: 'log-3067',
    kind: 'choice',
    situation: 'The Harbourview fixed-width statement file has been parsed. Which message is best?',
    options: [
      'Parse OK',
      'Parsed: 00123456782026111200000012500CR J SMITH',
      'Statement file parsed fileName=stmt-20261112.txt records=61203 trailerCount=61203 correlationId=d4a7b2',
      'Statement file parsed accountNumbers=[00123456,00123457,00123458]',
    ],
    answer: 2,
    explain:
      'The record count next to the trailer count shows the file is whole. The raw line and the list of account numbers put customer data in the log.',
  },
  {
    id: 'log-3068',
    kind: 'multi',
    situation:
      'In the Harbourview flow, vars.rawRecord holds the full fixed-width line: account number, holder name, amount and code. Which are problems with this logger?',
    code: `<logger level="WARN" message='#["Unknown code in record: $(vars.rawRecord)"]' />`,
    options: [
      'The raw record holds the account number and the holder name',
      'There is no correlation ID, record number or file name',
      'WARN is wrong. An unknown code that is mapped and loaded must be ERROR',
      'Fixed-width records cannot be logged, because they have no field names',
    ],
    answers: [0, 1],
    explain:
      'WARN fits a code the flow handled. The problem is what the line holds: log the record number, the file name and the code, not the record itself.',
  },
  {
    id: 'log-3069',
    kind: 'multi',
    situation:
      'The Harbourview flow reads the statement file in one go, with streaming off. The parse fails at line 30,412, because that record is 3 characters short. Which statements are true?',
    options: [
      'The parse of the whole file fails, so no record loads unless the flow handles it',
      'The line number from the error is useful in the log line',
      'Log the short record in full, so support can see what is wrong with it',
      'This is DEBUG, because nobody needs to act',
      'Log the file name and the line number, not the record',
    ],
    answers: [0, 1, 4],
    explain:
      'With streaming off the whole file is parsed before anything moves on, so one short record means no statement reaches the members. That is work for a person. Read the same file with deferred or streamed reading and the picture changes: the records before line 30,412 can already have gone downstream, so the log must also say how far the load got. The line number finds the record in the file without copying account data to the log.',
  },
  {
    id: 'log-3070',
    kind: 'write',
    situation:
      'Write the ERROR logger for the Harbourview statement file that fails to parse. The file stays in /error/statements. vars.fileName and vars.lineNumber are set, and vars.rawRecord holds the bad record.',
    available: ['vars.fileName', 'vars.lineNumber', 'vars.rawRecord', 'error.errorType', 'error.description', 'payload', 'correlationId'],
    level: ['ERROR'],
    checks: [
      says(/fail|could not|rejected|not loaded|parse/i, 'Statement file not loaded: parse failed'),
      has(/error\.errorType/, 'Add the error type: errorType=$(error.errorType).'),
      labelled('fileName'),
      has(/vars\.lineNumber/, 'Add the line that failed: line=$(vars.lineNumber).'),
      { not: /rawRecord/, say: 'Leave out the raw record. It holds the account number and name.' },
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message: '#["Statement file not loaded: parse failed fileName=$(vars.fileName) line=$(vars.lineNumber) errorType=$(error.errorType) next=file kept in /error/statements correlationId=$(correlationId)"]',
    },
    explain:
      'No statement was loaded, so a person must act: ERROR. The line number is enough to find the record. The record itself would put an account number and a name in the log.',
  },

  // ---------- lg-075 Coral Bay Hotels: reading the BatchJobResult ----------
  {
    id: 'log-3071',
    kind: 'level',
    situation:
      'Coral Bay Hotels runs a nightly room rate batch job. On days with no rate changes the rate system sends a file with no rate rows. Tonight is such a night, and the flow logs one line to say there was nothing to load.',
    answer: ['INFO'],
    explain:
      'A night with nothing to load is a known, normal outcome, and the job runs once a day. One INFO line shows the job ran and had nothing to do. Put that line where the flow sees the empty input, before the job. Whether an empty input reaches On Complete at all, and with which counts, has changed between runtime versions, so do not rest the line on those counts.',
  },
  {
    id: 'log-3072',
    kind: 'choice',
    situation: 'The Coral Bay rate job ends with 12 failed records out of 9,200. Which On Complete message is best?',
    options: [
      'Job complete :)',
      'Rate load finished jobId=5e10-7c total=9200 successful=9188 failed=12 elapsedMs=418220 correlationId=f61d08',
      'Rate load finished elapsedTime=418220',
      'Rate load finished batchStepResults={"loadRates":{"processed":9200,"failed":12,"exceptions":{"MULE:EXPRESSION":"..."}}}',
    ],
    answer: 1,
    explain:
      'It gives the job ID, all the counts and the time with its unit. The third option has no unit and no counts, and the last dumps payload.batchStepResults, which is the field that holds the per-step results.',
  },
  {
    id: 'log-3073',
    kind: 'multi',
    situation: 'Which of these are fields of the BatchJobResult that On Complete gets as its payload?',
    options: [
      'payload.loadedRecords',
      'payload.records',
      'payload.elapsedTimeInMillis',
      'payload.failedOnInputPhase',
      'payload.lastRecord',
    ],
    answers: [0, 2, 3],
    explain:
      'The BatchJobResult holds counts and phase results, such as totalRecords, loadedRecords, successfulRecords, failedRecords, elapsedTimeInMillis and failedOnInputPhase. It does not hold the records.',
  },
  {
    id: 'log-3074',
    kind: 'multi',
    situation: 'The Coral Bay On Complete logger is below. Which changes would make it more useful?',
    code: `<logger level="INFO" message='#["Rate load finished total=$(payload.totalRecords) failed=$(payload.failedRecords) correlationId=$(correlationId)"]' />`,
    options: [
      'Add the job instance ID from payload.batchJobInstanceId',
      'Add how long the job took from payload.elapsedTimeInMillis',
      'Add payload.batchStepResults, written in full',
      'Add the names of the hotel staff who entered the failed rates',
      'Add the successful count from payload.successfulRecords',
    ],
    answers: [0, 1, 4],
    explain:
      'The job ID finds the failed records, the time shows a slow night, and the successful count closes the sum. Step results in full are long, and staff names are personal data.',
  },
  {
    id: 'log-3075',
    kind: 'write',
    situation:
      'Write the On Complete logger of the Coral Bay rate job for a night where every record worked. Give the job instance ID, the counts and how long it took.',
    available: [
      'payload.batchJobInstanceId',
      'payload.totalRecords',
      'payload.successfulRecords',
      'payload.failedRecords',
      'payload.elapsedTimeInMillis',
      'payload',
      'correlationId',
    ],
    level: ['INFO'],
    checks: [
      says(/finish|complete|ended/i, 'Rate load finished'),
      has(/payload\.batchJobInstanceId/, 'Add the job instance ID: jobId=$(payload.batchJobInstanceId).'),
      has(/payload\.totalRecords/, 'Add the total: total=$(payload.totalRecords).'),
      has(/payload\.successfulRecords/, 'Add the successful count: successful=$(payload.successfulRecords).'),
      has(/payload\.failedRecords/, 'Add the failed count: failed=$(payload.failedRecords).'),
      has(/payload\.elapsedTimeInMillis/, 'Add how long it took: elapsedMs=$(payload.elapsedTimeInMillis).'),
      labelled('jobId', 'jobId=$(payload.batchJobInstanceId)'),
      corr,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["Rate load finished jobId=$(payload.batchJobInstanceId) total=$(payload.totalRecords) successful=$(payload.successfulRecords) failed=$(payload.failedRecords) elapsedMs=$(payload.elapsedTimeInMillis) correlationId=$(correlationId)"]',
    },
    explain:
      'A full, clean run is the normal end, so INFO. With elapsedMs on every night, a search shows when the job started to slow down.',
  },
]
