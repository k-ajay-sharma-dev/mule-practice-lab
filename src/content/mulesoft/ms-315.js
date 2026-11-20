export default {
  id: 'ms-315',
  category: 'mulesoft',
  title: 'Reject Report Emails: Summaries and Links Instead of Large Attachments',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'rejects', 'reports', 'attachments', 'size-limits'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'A reject report attaches a CSV that is sometimes 40 MB. Mails bounce. Why?',
      options: [
        'Relays reject CSV attachments, since they can carry spreadsheet formulas',
        'The mail is over the relay or mailbox size limit, and base64 adds about a third',
        'The subject is too long once the run ID and date are added to it',
        'The relay needs an HTML body when a mail carries an attachment',
      ],
      answer: 1,
      explain: 'Limits differ by system, often in the tens of megabytes. Do not design reports that come near them.',
    },
    {
      type: 'single',
      prompt: 'What is a better design for large reject reports?',
      options: [
        'Split the CSV across many emails that each stay under the limit',
        'Send a summary with counts by reason and examples, plus a link to the full file',
        'Zip it with a password and put the password in the same mail',
        'Attach it as a zip file, which always brings it under the limit',
      ],
      answer: 1,
      explain: 'The full file sits in a controlled store or report. The link can require login, so access is controlled and the file is kept once, not in many inboxes.',
    },
    {
      type: 'multi',
      prompt: 'What makes a reject summary useful to the business team?',
      options: [
        'Counts by reason, such as Unknown supplier 120, Missing barcode 30',
        'A few example keys per reason, so they can look them up',
        'The run ID and file name, so they can match the report to a delivery',
        'The exception stack trace of each reject, for root cause analysis',
      ],
      answer: [0, 1, 2],
      explain: 'Stack traces help developers, not buyers. Keep them in logs.',
    },
    {
      type: 'single',
      prompt: 'When is attaching the reject CSV still reasonable?',
      options: [
        'Always, since business readers prefer the data in their inbox',
        'When it is small, under a set limit such as 2 MB, with no personal data',
        'Never, since any attachment can be forwarded outside the company',
        'Only when the summary in the body lists more than ten reasons',
      ],
      answer: 1,
      explain: 'A rule like "attach if small, else link" keeps small runs convenient and large runs safe.',
    },
    {
      type: 'single',
      prompt: 'The job loaded zero rejects. Should the report email still go out?',
      options: [
        'Never, since a mail with nothing to act on is noise',
        'It depends on what the team agreed, such as a line in a daily digest',
        'Always, as a separate mail for each run of the job',
        'Only if the job failed, since that is when support must act',
      ],
      answer: 1,
      explain: 'A daily "no rejects" line in a digest proves the job ran, while a separate empty mail is often noise. Silence is ambiguous: it can mean no rejects or a job that never ran.',
    },
    {
      type: 'single',
      prompt: 'Where should the data for the reject report come from?',
      options: [
        'The Mule log of the run, filtered on the reject logger category',
        'The reject and job log tables for the run, so it matches what support sees',
        'The bounce messages that the mail server returns for the run',
        'The original inbound file, parsed again by the report flow',
      ],
      answer: 1,
      explain: 'A report built from the same tables avoids two versions of the truth.',
    },
  ],
  description: `
Larkfield Grocers loads supplier item files into Oracle staging tables. Rejected rows go to a reject table. Each run emails the buying team a CSV of all rejects. Some runs reject tens of thousands of rows and the mail bounces. When it does arrive, the team cannot see what to fix first.

**Questions**
1. Why do some reports bounce?
2. What should the email contain instead?
3. When is an attachment still fine?
4. Where does the report data come from, and what about runs with no rejects?
`,
  answerTemplate: `## Bounces

## A better email

## When to attach

## Data source and empty runs
`,
  keyPoints: [
    'Base64 makes attachments about a third larger.',
    'Relays and mailboxes have size limits.',
    'Send counts by reason with a few example keys.',
    'Link to the full file in a controlled store.',
    'Attach only small files with no personal data.',
    'Build the report from the reject and job log tables.',
  ],
  solution: `
**1. Bounces.** Attachments are base64 encoded and grow by about a third. A 30 MB CSV becomes about 40 MB, above the limit of many relays or mailboxes, so the mail bounces or is dropped.

**2. A better email.** Put a summary in the body: run ID, file name, totals, and counts per reject reason sorted by count, with up to five example keys per reason. Add a link to the full reject file, stored in a controlled place such as a blob container with access rules, or to a report screen. The team sees at once what to fix first.

**3. When to attach.** If the file is small, below a limit you set in a property, and holds no personal data, attaching it is convenient. Above the limit, link only.

**4. Data source and empty runs.** Build the summary from the reject and job log tables for the run, so the numbers match the database. For runs with no rejects, follow the team agreement. A line in a daily digest shows the job ran without making noise.
`,
  followUps: [
    {
      q: 'How long should the linked file stay available?',
      a: 'As long as the business needs to act, such as 30 days, then a lifecycle rule removes it.',
    },
    {
      q: 'Would you zip the CSV?',
      a: 'Zip shrinks CSV a lot, which helps mid size reports. Some mail filters block zip files, so check first.',
    },
    {
      q: 'How do you make the link safe?',
      a: 'Use a link that needs login, or a short lived signed link if the store supports it. Never a public link to reject data.',
    },
  ],
}
