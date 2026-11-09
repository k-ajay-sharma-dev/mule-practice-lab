import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-092',
  category: 'use-cases',
  title: 'Positive Pay Cheque Issue File to the Bank over SFTP',
  level: 'BEGINNER',
  tags: ['sftp', 'pgp', 'fixed-width', 'oracle-ebs', 'scheduler', 'finance', 'banking'],
  estMinutes: 15,
  diagram: {
    task: 'draw the daily job that reads issued and voided cheques from Oracle EBS Payables, builds the Positive Pay file and delivers it to the bank SFTP server, with the archive copy and the alert to treasury.',
    checks: [
      { label: 'A scheduled job builds the daily file', rule: { type: 'node', match: 'batch-job' } },
      { label: 'The job reads issued and voided cheques from Oracle EBS', rule: { type: 'path', from: 'batch-job', to: 'erp' } },
      { label: 'The file is delivered to the bank SFTP server', rule: { type: 'path', from: 'batch-job', to: 'sftp-server' } },
      { label: 'Oracle EBS is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The bank SFTP server is reached only through a System API', rule: { type: 'only-via', target: 'sftp-server', from: 'system-api' } },
      { label: 'A copy of every file sent is archived', rule: { type: 'edge', from: ['batch-job', 'process-api', 'system-api'], to: ['file-store', 's3-bucket', 'azure-blob'] } },
      { label: 'Treasury is alerted when the file is late or rejected', rule: { type: 'edge', from: ['batch-job', 'process-api', 'system-api'], to: 'notification' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Positive Pay job (daily 17:00)'],
        sebs: ['system-api', 'sys-oracle-ebs-ap-api'],
        ebs: ['erp', 'Oracle EBS Payables'],
        sbank: ['system-api', 'sys-bank-sftp-api'],
        sftp: ['sftp-server', 'Bank SFTP (/inbound/positive-pay)'],
        arch: ['file-store', 'Encrypted file archive (7 years)'],
        mail: ['notification', 'Treasury alert'],
      },
      ['job -> sebs', 'sebs -> ebs', 'job -> sbank', 'sbank -> sftp', 'job -> arch', 'job -> mail'],
    ),
  },
  description: `
A US manufacturer still pays about **400 suppliers a day by cheque** from **Oracle E-Business Suite 12.2 Payables**. To stop cheque fraud the bank offers **Positive Pay**: the company sends a list of every cheque it issued, and the bank pays only cheques that match the list.

Facts:
- The bank needs one file per business day by **18:00 Eastern**. A missing file means every cheque presented the next day is held for manual review.
- Format: **fixed width, 80 characters per line**. One header, one detail line per cheque (account, cheque number, amount in cents, issue date, payee name, \`I\` for issued or \`V\` for void) and one trailer with the record count and total amount.
- The file must be **PGP encrypted** with the bank's public key and uploaded to the bank's SFTP server with a key pair, not a password.
- The bank drops an acknowledgement file in \`/outbound/ack\` within 30 minutes.
- Auditors want every file kept for 7 years.

**Describe your solution:**
- How do you select the cheques for one day without sending a cheque twice?
- How do you build and protect the file?
- How do you know the bank received it?
`,
  answerTemplate: `## Selecting cheques

## Building and sending the file

## Acknowledgement, archive and alerts
`,
  keyPoints: [
    'A Scheduler at 17:00 Eastern reads cheques issued or voided since the last file through sys-oracle-ebs-ap-api.',
    'Each cheque is marked as sent (or a sent-file table is kept) so a rerun does not send it twice.',
    'DataWeave flatfile output with a fixed-width schema builds header, detail and trailer; the trailer totals are checked before sending.',
    'The file is PGP encrypted with the bank public key and uploaded with SFTP key authentication through sys-bank-sftp-api.',
    'The encrypted file is archived, the ack file is checked, and treasury gets an alert if there is no ack by 17:45.',
  ],
  solution: `
**Selecting cheques.** At 17:00 Eastern a Scheduler calls **sys-oracle-ebs-ap-api**. The API runs a parameterised query on a read-only view over \`AP_CHECKS_ALL\` for cheques with a status change since the last file. The id of the last file and its cut-off time are stored in a small control table, so each cheque goes in exactly one file. Voided cheques appear again with code \`V\`.

**Building the file.** DataWeave writes \`application/flatfile\` with a fixed-width schema: header, one detail line per cheque, trailer. The job computes the record count and total, and compares them with a sum query on the same selection. If they differ, the file is not sent.

**Sending.** The PGP module of the Crypto connector encrypts the file with the bank's public key. **sys-bank-sftp-api** uploads it with SSH key authentication under a temporary name and then renames it, so the bank never picks up a half-written file. The encrypted copy goes to the archive store with the date in the name.

**Acknowledgement.** At 17:30 and 17:45 the job checks \`/outbound/ack\` for the matching file name. A rejected or missing ack sends an alert to treasury, who can still phone the bank before 18:00.
`,
  followUps: [
    { q: 'Why upload under a temporary name and then rename it?', a: 'The bank polls the folder. A rename is atomic, so the bank never reads a partial file.' },
    { q: 'What do you do if the job is rerun after a successful upload?', a: 'The control table shows the cheques were already sent. The rerun builds an empty file or none, so no cheque is listed twice.' },
    { q: 'Where do the PGP and SSH keys live?', a: 'In a secrets manager or secure properties, injected at deploy time. They are never stored in the repository.' },
  ],
}
