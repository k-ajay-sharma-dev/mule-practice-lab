// Logging Lab exercises, set 13. See ../exercises.js for the format.
// Theme: Azure File Share and SFTP in a retail file hub. Polls, partial files, control files, moves and locks,
// plan files coming back from a planning platform, SFTP connections, host keys, outbound uploads and PGP.
import { corr, errorFacts, labelled, noPayload, noSecrets, noVague, says } from '../rules.js'

const next = (example) => ({
  must: /next\s*=/i,
  say: `Say what happens next, such as ${example}.`,
})
const durationVar = { must: /vars\.durationMs/, say: 'Add how long it took: durationMs=$(vars.durationMs).' }
const noSas = { not: /sasToken|sig=|vars\.shareUrl/i, say: 'Do not log the SAS token or a signed URL. Log the share and the path.' }
// file=, fileName= or a name built from vars.fileName all pass, since the situations name the variable fileName
const fileLabel = { must: /file(Name)?\s*"?\s*[=:]/i, say: 'Label the file name, such as file=$(vars.fileName), so it can be searched.' }
const noKey = { not: /privateKey|passphrase|vars\.password/i, say: 'Do not log the private key, the passphrase or a password.' }

export const SET_13 = [
  // ---------- lg-161 Larkfield Grocers: polling the share ----------
  {
    id: 'log-13001',
    kind: 'level',
    situation: 'Larkfield Grocers polls a file share every 5 minutes for store sales files. This poll found 12 new files.',
    answer: ['INFO'],
    explain: 'A poll that finds work is worth one INFO line. Empty polls belong at DEBUG.',
  },
  {
    id: 'log-13002',
    kind: 'choice',
    situation:
      'Larkfield polls a file share every 5 minutes. Over weeks the polls grew slower, because processed files are never moved out of /inbound/sales. This poll listed 9,400 entries and found 12 new. Which line would have shown the cause?',
    options: [
      'Share polled share=store-files directory=/inbound/sales found=12 durationMs=8400',
      'Share polled share=store-files listed=9400 found=12 durationMs=8400 files=sales_S001.csv,…',
      'Share polled share=store-files directory=/inbound/sales listed=9400 found=12 durationMs=8400',
      'Share polled share=store-files directory=/inbound/sales listed=9400 found=12',
    ],
    answer: 2,
    explain: 'listed against found shows the folder filling with old files, and the duration shows the cost. Without listed, 12 new files looks like a normal poll. A list of names makes one huge line. Without the duration the slowdown does not show.',
  },
  {
    id: 'log-13003',
    kind: 'multi',
    situation: 'The Larkfield poll is slower each week. Which facts on the poll line would show why?',
    options: [
      'The poll interval',
      'How many entries were listed in total',
      'How many were new',
      'The total size of the new files',
      'How long the listing took',
    ],
    answers: [1, 2, 4],
    explain: 'Many listed, few new and a long duration point to processed files never being moved. The interval does not change from week to week, and the size of the new files does not change how long a listing takes.',
  },
  {
    id: 'log-13004',
    kind: 'write',
    situation:
      'A Larkfield poll found new files. vars.share, vars.directory, vars.listed, vars.found and vars.durationMs hold the facts. Write the line.',
    available: ['vars.share', 'vars.directory', 'vars.listed', 'vars.found', 'vars.durationMs', 'vars.sasToken', 'payload'],
    level: ['INFO'],
    checks: [
      says(/polled|listed|found/i, 'Share polled'),
      labelled('share'),
      labelled('directory'),
      labelled('listed'),
      labelled('found'),
      durationVar,
      noSas,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Share polled share=$(vars.share) directory=$(vars.directory) listed=$(vars.listed) found=$(vars.found) durationMs=$(vars.durationMs)"]',
    },
    explain: 'listed against found shows when the inbound folder needs cleaning.',
  },
  {
    id: 'log-13005',
    kind: 'write',
    situation:
      'A Larkfield file was skipped because its size was still changing between two checks. vars.fileName and vars.sizeBytes hold the facts. It will be checked again on the next poll. Write the line.',
    available: ['vars.fileName', 'vars.sizeBytes', 'payload'],
    level: ['DEBUG', 'INFO'],
    checks: [
      says(/skipped|still (growing|changing|writing)|not complete/i, 'File skipped, still being written'),
      fileLabel,
      labelled('sizeBytes'),
      next('next=check again next poll'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["File skipped, still being written file=$(vars.fileName) sizeBytes=$(vars.sizeBytes) next=check again next poll"]',
    },
    explain: 'If a file is skipped for hours, this line shows the sender never finished it.',
  },

  // ---------- lg-162 Larkfield Grocers: loading a file from the share ----------
  {
    id: 'log-13006',
    kind: 'level',
    situation: 'A Larkfield sales file loaded into staging. All rows passed and the trailer count matched.',
    answer: ['INFO'],
    explain: 'A normal finished file gets one INFO line.',
  },
  {
    id: 'log-13007',
    kind: 'choice',
    situation:
      'A Larkfield sales file loaded into staging. Its trailer says 2,412 rows and all 2,412 passed. Which line lets anyone check the load was complete?',
    options: [
      'File loaded file=sales_S041_20261118.csv rows=2412 rejected=0 durationMs=1900 sizeBytes=184220',
      'File loaded file=sales_S041_20261118.csv trailerRows=2412 rejected=0 durationMs=1900',
      'File loaded file=sales_S041_20261118.csv rows=2412 trailerRows=2412 rejected=0 durationMs=1900',
      'File loaded store=S041 rows=2412 trailerRows=2412 rejected=0 durationMs=1900',
    ],
    answer: 2,
    explain: 'Rows read, the trailer count and rejects let anyone check it was complete. Without trailerRows nothing shows that every row the store sent was read. Without rows the trailer has nothing to be compared with. Without the file name the line cannot be tied to one file.',
  },
  {
    id: 'log-13008',
    kind: 'multi',
    situation: 'Which facts on the load line prove a Larkfield file was loaded completely?',
    options: [
      'Rows read',
      'The file size in bytes',
      'The row count from the trailer',
      'Rows rejected',
      'The customer names in the file',
    ],
    answers: [0, 2, 3],
    explain: 'Rows read should match the trailer, and loaded plus rejected should match rows read. A size cannot be checked against anything the store sent, and customer names are personal data.',
  },
  {
    id: 'log-13009',
    kind: 'write',
    situation:
      'A Larkfield file loaded. vars.fileName, vars.rows, vars.trailerRows, vars.rejected and vars.durationMs hold the facts. Write the line.',
    available: ['vars.fileName', 'vars.rows', 'vars.trailerRows', 'vars.rejected', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/loaded|processed/i, 'File loaded'),
      fileLabel,
      labelled('rows'),
      labelled('trailerRows'),
      labelled('rejected'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["File loaded file=$(vars.fileName) rows=$(vars.rows) trailerRows=$(vars.trailerRows) rejected=$(vars.rejected) durationMs=$(vars.durationMs)"]',
    },
    explain: 'One line per file that a report can add up.',
  },
  {
    id: 'log-13010',
    kind: 'write',
    situation:
      'A Larkfield file has fewer rows than its trailer says. It is moved to the error folder and not loaded. vars.fileName, vars.rows and vars.trailerRows hold the facts. Write the line.',
    available: ['vars.fileName', 'vars.rows', 'vars.trailerRows', 'payload'],
    level: ['ERROR', 'WARN'],
    checks: [
      says(/count mismatch|incomplete|does not match|rows? missing/i, 'File incomplete, row count mismatch'),
      fileLabel,
      labelled('rows'),
      labelled('trailerRows'),
      next('next=moved to error folder'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["File incomplete, row count mismatch file=$(vars.fileName) rows=$(vars.rows) trailerRows=$(vars.trailerRows) next=moved to error folder"]',
    },
    explain: 'A store’s sales are missing until someone acts, so ERROR.',
  },

  // ---------- lg-163 Larkfield Grocers: control files for plan sets ----------
  {
    id: 'log-13011',
    kind: 'level',
    situation:
      'The planning platform sends 12 plan files and a control file. The control file is here, but only 7 plan files are. The flow will check again on the next poll.',
    answer: ['INFO', 'WARN'],
    explain: 'Early in the window this is normal, so INFO. Near the cut off it becomes a WARN.',
  },
  {
    id: 'log-13012',
    kind: 'choice',
    situation:
      'The planning platform sends 12 plan files and a control file. The control file is here, but only 7 plan files are. The flow will check again on the next poll. Which line best records it?',
    options: [
      'Plan set incomplete, waiting control=plans_20261118.ctl present=7 next=check next poll',
      'Plan set incomplete control=plans_20261118.ctl expected=12 present=7 next=keep previous plan',
      'Plan set incomplete, waiting expected=12 present=7 directory=/inbound/plans next=check next poll',
      'Plan set incomplete, waiting control=plans_20261118.ctl expected=12 present=7 next=check next poll',
    ],
    answer: 3,
    explain: 'Expected and present show how far the set has got, and the control file names the set. Without expected nobody can tell how many files are still to come. next=keep previous plan belongs to the cut off, not to a wait. Without the control file two sets in one folder look the same.',
  },
  {
    id: 'log-13013',
    kind: 'multi',
    situation: 'Which Larkfield control file checks deserve a line when they fail?',
    options: [
      'A file named in the control file is missing',
      'A file that matched, at INFO for each file',
      'A file row count differs from the control file',
      'A plan file still being written, checked again next poll, at ERROR',
      'The set is still incomplete at the cut off',
    ],
    answers: [0, 2, 4],
    explain: 'Each failure stops the set loading and needs a reason in the log. A file that matched is the normal case. A file still being written is expected and is checked again next poll, so ERROR would call someone out for nothing.',
  },
  {
    id: 'log-13014',
    kind: 'write',
    situation:
      'A Larkfield plan set is still incomplete. vars.controlFile, vars.expected and vars.present hold the facts. Write the line.',
    available: ['vars.controlFile', 'vars.expected', 'vars.present', 'payload'],
    level: ['INFO', 'WARN'],
    checks: [
      says(/incomplete|waiting/i, 'Plan set incomplete, waiting'),
      { must: /control(File)?\s*"?\s*[=:]/i, say: 'Label the control file, such as control=$(vars.controlFile).' },
      labelled('expected'),
      labelled('present'),
      next('next=check next poll'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Plan set incomplete, waiting control=$(vars.controlFile) expected=$(vars.expected) present=$(vars.present) next=check next poll"]',
    },
    explain: 'A string of these lines shows how late the sender is.',
  },
  {
    id: 'log-13015',
    kind: 'write',
    situation:
      'The cut off passed and the Larkfield plan set is still incomplete. Stores keep yesterday’s plan. vars.controlFile, vars.expected, vars.present and vars.missing hold the facts. Write the line.',
    available: ['vars.controlFile', 'vars.expected', 'vars.present', 'vars.missing', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/cut ?off|not complete|incomplete/i, 'Plan set incomplete at cut off'),
      { must: /control(File)?\s*"?\s*[=:]/i, say: 'Label the control file, such as control=$(vars.controlFile).' },
      labelled('expected'),
      labelled('present'),
      labelled('missing'),
      next('next=stores keep previous plan'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Plan set incomplete at cut off control=$(vars.controlFile) expected=$(vars.expected) present=$(vars.present) missing=$(vars.missing) next=stores keep previous plan"]',
    },
    explain: 'The missing names tell the planning team exactly what to resend.',
  },

  // ---------- lg-164 Larkfield Grocers: moves, locks and the error folder ----------
  {
    id: 'log-13016',
    kind: 'level',
    situation: 'After loading, a Larkfield file could not be moved to processed because another program holds it open. The file may be loaded again.',
    answer: ['ERROR', 'WARN'],
    explain: 'A failed move can lead to a repeat load. ERROR if loads are not idempotent, WARN if they are.',
  },
  {
    id: 'log-13017',
    kind: 'choice',
    situation:
      'After loading, a Larkfield file could not be moved to /processed. The share answered 409 SharingViolation because another program holds the file open. Which line best records it?',
    options: [
      'Move failed file=plan_S412.txt from=/inbound to=/processed status=409 reason=Conflict',
      'Move failed file=plan_S412.txt status=409 code=SharingViolation next=load again',
      'Move failed from=/inbound to=/processed status=409 code=SharingViolation share=store-files',
      'Move failed file=plan_S412.txt from=/inbound to=/processed status=409 code=SharingViolation',
    ],
    answer: 3,
    explain: 'The file, both folders, the status and the code tell support what to look for. Conflict is the reason phrase of every 409, so it does not say the file was locked. next=load again invites the duplicate load the team must avoid. Without the file name nobody can tell which file is stuck.',
  },
  {
    id: 'log-13018',
    kind: 'multi',
    situation: 'A Larkfield file must be handled once, even when a move fails. Which lines help prove it?',
    options: [
      'Claimed, when moved to the working folder',
      'Each row inserted',
      'Loaded, with counts',
      'Listed, on each poll that sees the file',
      'Moved to processed or to error',
    ],
    answers: [0, 2, 4],
    explain: 'Claimed, loaded and moved trace each file once. A file is listed on every poll until it moves, so list lines repeat by design. Row lines bury the three that matter.',
  },
  {
    id: 'log-13019',
    kind: 'write',
    situation:
      'A Larkfield move failed. vars.fileName, vars.from, vars.to, vars.statusCode and vars.errorCode hold the facts. Write the line.',
    available: ['vars.fileName', 'vars.from', 'vars.to', 'vars.statusCode', 'vars.errorCode', 'payload'],
    level: ['ERROR', 'WARN'],
    checks: [
      says(/move failed|not moved|could not move/i, 'Move failed'),
      fileLabel,
      labelled('from'),
      labelled('to'),
      { must: /status(Code)?\s*"?\s*[=:]/i, say: 'Label the status, such as status=$(vars.statusCode).' },
      labelled('code', 'code=$(vars.errorCode)'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Move failed file=$(vars.fileName) from=$(vars.from) to=$(vars.to) status=$(vars.statusCode) code=$(vars.errorCode)"]',
    },
    explain: 'The code tells a lock from a missing folder.',
  },
  {
    id: 'log-13020',
    kind: 'write',
    situation:
      'A Larkfield file failed validation and was moved to the error folder. vars.fileName, vars.reason and vars.target hold the facts. Write the line.',
    available: ['vars.fileName', 'vars.reason', 'vars.target', 'payload'],
    level: ['WARN', 'ERROR'],
    checks: [
      says(/moved to error|rejected|failed validation/i, 'File moved to error folder'),
      fileLabel,
      labelled('reason'),
      labelled('target'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message: '#["File moved to error folder file=$(vars.fileName) reason=$(vars.reason) target=$(vars.target)"]',
    },
    explain: 'The reason lets the sender fix and resend.',
  },

  // ---------- lg-165 Larkfield Grocers: writing exports to the share ----------
  {
    id: 'log-13021',
    kind: 'level',
    situation: 'A large export to the share failed on one range write. The flow will retry that range.',
    answer: ['WARN'],
    explain: 'A retry handles it. WARN shows the write was not smooth.',
  },
  {
    id: 'log-13022',
    kind: 'choice',
    situation:
      'A 3 GB Larkfield export to the planning share finished after one range retry and was renamed to its final name. The receiver will compare rows with what it reads. Which line best records it?',
    options: [
      'Export written share=planning file=sales_history.csv sizeBytes=3221225472 rows=41200331 rangeRetries=1 durationMs=842000',
      'Export written share=planning file=sales_history.csv.tmp sizeBytes=3221225472 rows=41200331 rangeRetries=1',
      'Export written share=planning file=sales_history.csv sizeBytes=3221225472 rangeRetries=1 durationMs=842000 ranges=768',
      'Export written url=https://larkfield.file.core.windows.net/planning/sales_history.csv?sv=…&sig=… rows=41200331',
    ],
    answer: 0,
    explain: 'Size, rows, retries and time under the final name. A line with the .tmp name was written before the rename, so it does not prove the file the receiver reads is complete. Without rows the receiver cannot compare counts. The signed URL grants access to the share.',
  },
  {
    id: 'log-13023',
    kind: 'multi',
    situation: 'Which steps of a safe Larkfield export to the share deserve a line?',
    options: [
      'Writing started under a temp name',
      'A range retried',
      'Each range that worked, at INFO',
      'Export done, logged before the rename',
      'Renamed to the final name',
    ],
    answers: [0, 1, 4],
    explain: 'Log the start, the problems and the finish. Thousands of range lines hide them. A done line before the rename claims success while the file still has its temp name and the rename can still fail.',
  },
  {
    id: 'log-13024',
    kind: 'write',
    situation:
      'A Larkfield export finished and was renamed to its final name. vars.share, vars.fileName, vars.sizeBytes, vars.rows and vars.durationMs hold the facts. Write the line.',
    available: ['vars.share', 'vars.fileName', 'vars.sizeBytes', 'vars.rows', 'vars.durationMs', 'vars.shareUrl', 'payload'],
    level: ['INFO'],
    checks: [
      says(/written|renamed|export (finished|complete)/i, 'Export written'),
      labelled('share'),
      labelled('(file|fileName)', 'file=$(vars.fileName)'),
      labelled('sizeBytes'),
      labelled('rows'),
      durationVar,
      noSas,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Export written share=$(vars.share) file=$(vars.fileName) sizeBytes=$(vars.sizeBytes) rows=$(vars.rows) durationMs=$(vars.durationMs)"]',
    },
    explain: 'The receiver can compare the row count with what it reads.',
  },
  {
    id: 'log-13025',
    kind: 'write',
    situation:
      'A Larkfield export gave up after range retries. The temp file was deleted and the export must be run again. vars.fileName and vars.offset hold the facts. Write the line, with the error and what happens next.',
    available: ['vars.fileName', 'vars.offset', 'error.errorType', 'error.description', 'vars.sasToken', 'payload'],
    level: ['ERROR'],
    checks: [
      says(/export failed|gave up|not written/i, 'Export failed'),
      labelled('(file|fileName)', 'file=$(vars.fileName)'),
      labelled('offset'),
      errorFacts,
      next('next=temp file deleted, rerun needed'),
      noSas,
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Export failed file=$(vars.fileName) offset=$(vars.offset) errorType=$(error.errorType) error=$(error.description) next=temp file deleted, rerun needed"]',
    },
    explain: 'The next field tells the receiver no broken file was left behind.',
  },

  // ---------- lg-166 Brindle Outdoor: SFTP connections ----------
  {
    id: 'log-13026',
    kind: 'level',
    situation: 'Brindle Outdoor could not connect to a partner SFTP server. The reconnection strategy will try again in 30 seconds.',
    answer: ['WARN'],
    explain: 'A retry is coming. WARN, and ERROR if all retries fail.',
  },
  {
    id: 'log-13027',
    kind: 'choice',
    situation:
      'Brindle Outdoor could not connect to a partner SFTP server. The reconnection strategy will try again in 30 seconds. Last month a changed host key caused the same symptom. Which line best records it?',
    options: [
      'SFTP connect failed partner=northwind host=sftp.northwind.example port=22 user=brindle-int attempt=1 next=retry in 30s elapsedMs=30012',
      'SFTP connect failed partner=northwind host=sftp.northwind.example port=22 user=brindle-int errorType=SFTP:CONNECTIVITY next=given up',
      'SFTP connect failed partner=northwind host=sftp.northwind.example port=22 user=brindle-int errorType=SFTP:CONNECTIVITY attempt=1 next=retry in 30s',
      'SFTP connect failed partner=northwind host=sftp.northwind.example user=brindle-int identityFile=/opt/keys/brindle_rsa passphrase=… attempt=1',
    ],
    answer: 2,
    explain: 'Partner, host, port, user, error type, attempt and next. Without the error type a network fault, bad credentials and a changed host key look the same. next=given up is wrong while retries remain. A passphrase must never be logged, and the key path is not the cause.',
  },
  {
    id: 'log-13028',
    kind: 'multi',
    situation:
      'Which Brindle SFTP failures point to different owners, so the error type and description are worth logging?',
    options: [
      'Host key changed',
      'A listing that returned zero files',
      'Connection refused or timed out',
      'Auth fail',
      'A slow transfer that still finished',
    ],
    answers: [0, 2, 3],
    explain: 'Network, credentials and server identity each have a different owner, so the error type sends the call to the right team. An empty listing and a slow transfer that finished are not connection failures.',
  },
  {
    id: 'log-13029',
    kind: 'write',
    situation:
      'A Brindle SFTP connection failed. vars.partner, vars.host, vars.user and vars.attempt hold the facts. A retry follows. Write the line, with the error and what happens next.',
    available: ['vars.partner', 'vars.host', 'vars.user', 'vars.attempt', 'vars.password', 'vars.privateKey', 'error.errorType', 'error.description'],
    level: ['WARN'],
    checks: [
      says(/connect(ion)? failed|could not connect/i, 'SFTP connect failed'),
      labelled('partner'),
      labelled('host'),
      labelled('user'),
      labelled('attempt'),
      errorFacts,
      next('next=retry'),
      noKey,
      noSecrets,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["SFTP connect failed partner=$(vars.partner) host=$(vars.host) user=$(vars.user) attempt=$(vars.attempt) errorType=$(error.errorType) error=$(error.description) next=retry"]',
    },
    explain: 'The user name is fine to log. The password and key are not.',
  },
  {
    id: 'log-13030',
    kind: 'write',
    situation:
      'A Brindle connection was refused because the server host key changed. Nothing is sent until the new key is verified. vars.partner, vars.host and vars.fingerprint hold the facts. Write the line, with what happens next.',
    available: ['vars.partner', 'vars.host', 'vars.fingerprint', 'vars.privateKey', 'error.errorType', 'error.description'],
    level: ['ERROR'],
    checks: [
      says(/host key/i, 'Host key changed'),
      labelled('partner'),
      labelled('host'),
      labelled('fingerprint'),
      next('next=verify fingerprint with partner'),
      noKey,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Host key changed partner=$(vars.partner) host=$(vars.host) fingerprint=$(vars.fingerprint) next=verify fingerprint with partner"]',
    },
    explain: 'The fingerprint is public and lets you compare with what the partner sends.',
  },

  // ---------- lg-167 Brindle Outdoor: the SFTP listener ----------
  {
    id: 'log-13031',
    kind: 'level',
    situation: 'The SFTP listener picked up a new store receipts file.',
    answer: ['INFO'],
    explain: 'The start of each file is worth a line.',
  },
  {
    id: 'log-13032',
    kind: 'choice',
    situation:
      'Brindle runs its SFTP listener on a two node cluster, and only one node should poll. Some store files are processed twice. Which pick line helps prove whether both nodes poll?',
    options: [
      'File picked partner=store-041 path=/in/rcv_S041_20261118.csv sizeBytes=241800 app=brindle-sftp',
      'File picked partner=store-041 path=/in/rcv_S041_20261118.csv sizeBytes=241800 thread=io.12',
      'File picked partner=store-041 path=/in/rcv_S041_20261118.csv sizeBytes=241800 node=mule-node-1',
      'File picked partner=store-041 path=/in/rcv_S041_20261118.csv node=mule-node-1 content=S041,…',
    ],
    answer: 2,
    explain: 'Partner, path, size and the node. Two nodes logging the same path at the same time is the proof. The app name is the same on both nodes, and both run threads with the same kind of names, so neither tells the nodes apart. File content does not belong in the line.',
  },
  {
    id: 'log-13033',
    kind: 'multi',
    situation: 'Files are processed twice in the Brindle cluster. Which facts on the pick line help prove it?',
    options: [
      'The node name',
      'The correlation ID',
      'The path',
      'The time',
      'The file content',
    ],
    answers: [0, 2, 3],
    explain: 'Two nodes logging the same path at the same time is the proof. Each pick starts a new event with its own correlation ID, so the IDs differ and do not show the repeat. File content adds data, not proof.',
  },
  {
    id: 'log-13034',
    kind: 'write',
    situation:
      'A Brindle file was picked. vars.partner, attributes.path, attributes.size and vars.node hold the facts. Write the line.',
    available: ['vars.partner', 'attributes.path', 'attributes.size', 'vars.node', 'payload'],
    level: ['INFO'],
    checks: [
      says(/picked|received|new file/i, 'File picked'),
      labelled('partner'),
      labelled('path'),
      labelled('(sizeBytes|size)', 'sizeBytes=$(attributes.size)'),
      labelled('node'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message: '#["File picked partner=$(vars.partner) path=$(attributes.path) sizeBytes=$(attributes.size) node=$(vars.node)"]',
    },
    explain: 'The file attributes give path and size without reading the content.',
  },
  {
    id: 'log-13035',
    kind: 'write',
    situation:
      'A Brindle file was skipped because the same name and checksum were loaded before. vars.fileName, vars.checksum and vars.firstLoadedAt hold the facts. Write the line.',
    available: ['vars.fileName', 'vars.checksum', 'vars.firstLoadedAt', 'payload'],
    level: ['WARN', 'INFO'],
    checks: [
      says(/duplicate|already (loaded|processed)/i, 'Duplicate file skipped'),
      labelled('(file|fileName)', 'file=$(vars.fileName)'),
      labelled('checksum'),
      labelled('firstLoadedAt'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Duplicate file skipped file=$(vars.fileName) checksum=$(vars.checksum) firstLoadedAt=$(vars.firstLoadedAt)"]',
    },
    explain: 'firstLoadedAt helps the sender see they resent an old file.',
  },

  // ---------- lg-168 Brindle Outdoor: outbound uploads to the planning platform ----------
  {
    id: 'log-13036',
    kind: 'level',
    situation: 'Brindle uploaded the nightly item file to the planning platform and renamed it from .tmp to its final name.',
    answer: ['INFO'],
    explain: 'A finished upload is normal, one INFO line.',
  },
  {
    id: 'log-13037',
    kind: 'choice',
    situation:
      'Brindle uploads a nightly item delta to the planning platform, which applies deltas in sequence order. The file is written under a temp name and renamed when complete. Which line best records the finished upload?',
    options: [
      'File uploaded partner=planning-platform path=/to-planning/items_20261118_0412.txt sizeBytes=812000000 rows=58210 durationMs=410000 host=sftp.plan.example',
      'File uploaded partner=planning-platform path=/to-planning/items_20261118_0412.txt sizeBytes=812000000 seq=412 durationMs=410000 mode=binary',
      'File uploaded partner=planning-platform path=/to-planning/items_20261118_0412.txt sizeBytes=812000000 rows=58210 seq=412 durationMs=410000',
      'Upload started partner=planning-platform path=/to-planning/items_20261118_0412.txt.tmp sizeBytes=812000000 rows=58210 seq=412',
    ],
    answer: 2,
    explain: 'Path, size, rows, sequence and time let the receiver check each one. Without seq a missing or out of order delta does not show. Without rows the receiver cannot compare counts. A start line under the temp name does not prove the file arrived or was renamed.',
  },
  {
    id: 'log-13038',
    kind: 'multi',
    situation:
      'The planning platform says the 0412 delta from Brindle is incomplete. Which facts on your upload line help settle it?',
    options: [
      'The size you sent',
      'The upload speed in MB per second',
      'The row count you sent',
      'The sequence number',
      'The item descriptions',
    ],
    answers: [0, 2, 3],
    explain: 'Compare what you sent with what they read: size, rows and sequence. Speed explains a slow upload, not a short one. Item descriptions are data and add bulk.',
  },
  {
    id: 'log-13039',
    kind: 'write',
    situation:
      'A Brindle upload finished. vars.partner, vars.path, vars.sizeBytes, vars.rows, vars.seq and vars.durationMs hold the facts. Write the line.',
    available: ['vars.partner', 'vars.path', 'vars.sizeBytes', 'vars.rows', 'vars.seq', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/uploaded|sent/i, 'File uploaded'),
      labelled('partner'),
      labelled('path'),
      labelled('sizeBytes'),
      labelled('rows'),
      labelled('seq'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["File uploaded partner=$(vars.partner) path=$(vars.path) sizeBytes=$(vars.sizeBytes) rows=$(vars.rows) seq=$(vars.seq) durationMs=$(vars.durationMs)"]',
    },
    explain: 'The sequence helps the receiver apply deltas in order.',
  },
  {
    id: 'log-13040',
    kind: 'write',
    situation:
      'A Brindle upload failed and the temp file was removed. The file will be sent again in the next run. vars.partner, vars.path and vars.seq hold the facts. Write the line, with the error and what happens next.',
    available: ['vars.partner', 'vars.path', 'vars.seq', 'error.errorType', 'error.description', 'payload'],
    level: ['ERROR', 'WARN'],
    checks: [
      says(/upload failed|not uploaded|not sent/i, 'Upload failed'),
      labelled('partner'),
      labelled('path'),
      labelled('seq'),
      errorFacts,
      next('next=resend next run'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'ERROR',
      message:
        '#["Upload failed partner=$(vars.partner) path=$(vars.path) seq=$(vars.seq) errorType=$(error.errorType) error=$(error.description) next=resend next run"]',
    },
    explain: 'The sequence tells the receiver a gap is coming and why.',
  },

  // ---------- lg-169 Brindle Outdoor: plans back from the planning platform ----------
  {
    id: 'log-13041',
    kind: 'level',
    situation: 'A plan file from the planning platform loaded into the store database: 48,000 rows, 3 rejected to the reject table.',
    answer: ['INFO'],
    explain: 'The load finished. Rejects have their own lines.',
  },
  {
    id: 'log-13042',
    kind: 'choice',
    situation:
      'A plan file loaded into the Brindle store database: 48,000 rows, 47,997 merged and 3 rejected. Each run also writes a row to the job log table. Which line best records the load?',
    options: [
      'Plan loaded file=orders_20261118.csv rows=48000 merged=47997 rejected=3 durationMs=190000 runAt=02:10',
      'Plan loaded file=orders_20261118.csv rows=48000 merged=47997 rejected=3 jobId=J-5521 durationMs=190000',
      'Plan loaded file=orders_20261118.csv rows=48000 merged=48000 rejected=3 jobId=J-5521 durationMs=190000',
      'Plan loaded file=orders_20261118.csv rows=48000 merged=47997 jobId=J-5521 durationMs=190000',
    ],
    answer: 1,
    explain: 'Rows, merged and rejected add up, and the job ID joins the line to the job log row. merged=48000 counts the 3 rejects as merged, so the sum breaks. Without rejected, 3 rows that never loaded stay hidden. Without the job ID the line cannot be joined.',
  },
  {
    id: 'log-13043',
    kind: 'multi',
    situation: 'Which facts belong on a Brindle rejected plan row line?',
    options: [
      'The line number in the file',
      'The whole row of 40 fields',
      'The store and item',
      'The stack trace of the database driver',
      'The reason',
    ],
    answers: [0, 2, 4],
    explain: 'Enough to find and fix the row: where it is, what it is and why it failed. The whole row copies 40 fields of data into the log. A driver stack trace is about our code, not the row.',
  },
  {
    id: 'log-13044',
    kind: 'write',
    situation:
      'A Brindle plan file loaded. vars.fileName, vars.rows, vars.merged, vars.rejected, vars.jobId and vars.durationMs hold the facts. Write the line.',
    available: ['vars.fileName', 'vars.rows', 'vars.merged', 'vars.rejected', 'vars.jobId', 'vars.durationMs', 'payload'],
    level: ['INFO'],
    checks: [
      says(/plan loaded|loaded/i, 'Plan loaded'),
      labelled('(file|fileName)', 'file=$(vars.fileName)'),
      labelled('rows'),
      labelled('merged'),
      labelled('rejected'),
      labelled('jobId'),
      durationVar,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Plan loaded file=$(vars.fileName) rows=$(vars.rows) merged=$(vars.merged) rejected=$(vars.rejected) jobId=$(vars.jobId) durationMs=$(vars.durationMs)"]',
    },
    explain: 'merged tells you rows were upserted, so a rerun is safe.',
  },
  {
    id: 'log-13045',
    kind: 'write',
    situation:
      'A Brindle plan row was rejected. vars.lineNo, vars.store, vars.item and vars.reason hold the facts. It goes to the reject table. Write the line, with what happens next.',
    available: ['vars.lineNo', 'vars.store', 'vars.item', 'vars.reason', 'payload'],
    level: ['WARN'],
    checks: [
      says(/rejected|row failed/i, 'Plan row rejected'),
      labelled('(line|lineNo)', 'line=$(vars.lineNo)'),
      labelled('store'),
      labelled('item'),
      labelled('reason'),
      next('next=written to reject table'),
      noPayload,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Plan row rejected line=$(vars.lineNo) store=$(vars.store) item=$(vars.item) reason=$(vars.reason) next=written to reject table"]',
    },
    explain: 'The planning team can fix the row from these facts alone.',
  },

  // ---------- lg-170 Brindle Outdoor: PGP and secure transfer ----------
  {
    id: 'log-13046',
    kind: 'level',
    situation: 'Brindle encrypted the payment file with the bank’s public key and uploaded it.',
    answer: ['INFO'],
    explain: 'A normal, important event. One INFO line with the key ID.',
  },
  {
    id: 'log-13047',
    kind: 'choice',
    situation:
      'Brindle encrypted the payment file with the bank’s public key and uploaded it. If the bank cannot decrypt it, support must know which key was used. Which line best records the upload?',
    options: [
      'Encrypted file uploaded partner=bank path=/in/pay_20261118.pgp payments=1240 cipher=AES256 sizeBytes=812400',
      'Encrypted file uploaded partner=bank path=/in/pay_20261118.pgp recipientKeyId=0xE5F6A7B8 firstAccount=20-00-00 12345678',
      'Encrypted file uploaded partner=bank path=/in/pay_20261118.pgp signingKeyId=0x1A2B3C4D payments=1240',
      'Encrypted file uploaded partner=bank path=/in/pay_20261118.pgp recipientKeyId=0xE5F6A7B8 payments=1240',
    ],
    answer: 3,
    explain: 'The recipient key ID shows which bank key encrypted the file. The signing key ID is our own key, so it does not show which bank key the bank needs. The cipher and size do not name a key. Account numbers are personal and financial data.',
  },
  {
    id: 'log-13048',
    kind: 'multi',
    situation: 'Which of these must never appear in the Brindle payment upload logs?',
    options: [
      'The number of payments in the file',
      'The private key or its passphrase',
      'The recipient key ID',
      'Bank account numbers',
      'The unencrypted payment file',
    ],
    answers: [1, 3, 4],
    explain: 'The private key, its passphrase, account numbers and the plain file are secret or personal. The recipient key ID belongs to a public key, and a count of payments carries no personal data.',
  },
  {
    id: 'log-13049',
    kind: 'write',
    situation:
      'A Brindle payment file was encrypted and uploaded. vars.partner, vars.path, vars.keyId and vars.payments hold the facts. Write the line.',
    available: ['vars.partner', 'vars.path', 'vars.keyId', 'vars.payments', 'vars.passphrase', 'vars.privateKey', 'payload'],
    level: ['INFO'],
    checks: [
      says(/encrypted|uploaded/i, 'Encrypted file uploaded'),
      labelled('partner'),
      labelled('path'),
      labelled('(recipientKeyId|keyId)', 'recipientKeyId=$(vars.keyId)'),
      labelled('payments'),
      noKey,
      noSecrets,
      noPayload,
      noVague,
    ],
    model: {
      level: 'INFO',
      message:
        '#["Encrypted file uploaded partner=$(vars.partner) path=$(vars.path) recipientKeyId=$(vars.keyId) payments=$(vars.payments)"]',
    },
    explain: 'If the bank cannot decrypt, the key ID shows at once which key you used.',
  },
  {
    id: 'log-13050',
    kind: 'write',
    situation:
      'The bank’s public key expires in 10 days. A daily check found it. vars.partner, vars.keyId and vars.expiresOn hold the facts. Write the line, with what happens next.',
    available: ['vars.partner', 'vars.keyId', 'vars.expiresOn', 'vars.privateKey'],
    level: ['WARN'],
    checks: [
      says(/expir/i, 'Partner key expiring'),
      labelled('partner'),
      labelled('keyId'),
      labelled('expiresOn'),
      next('next=ask partner for new key'),
      noKey,
      noVague,
    ],
    model: {
      level: 'WARN',
      message:
        '#["Partner key expiring partner=$(vars.partner) keyId=$(vars.keyId) expiresOn=$(vars.expiresOn) next=ask partner for new key"]',
    },
    explain: 'A warning ten days early beats a rejected payment file.',
  },
]
