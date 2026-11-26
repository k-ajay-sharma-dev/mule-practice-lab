export default {
  id: 'ms-081',
  category: 'mulesoft',
  title: 'Reading Mail Reliably: Watermark, Read Flags, Imap Matcher, Mark-as-Read, Move, Delete and Expunge',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'imap', 'watermark', 'polling', 'connectors', 'primary-node'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'An `email:listener-imap` has no Imap Matcher. People also open emails in this mailbox, and opened emails must still be processed. The reference says read emails are filtered by default, yet lists Seen with a default of INCLUDE. What should the team do?',
      options: [
        'Set Seen on an Imap Matcher and test it with read and unread emails',
        'Keep the defaults, because Seen is listed with a default of INCLUDE',
        'Turn off Enable Watermark, so opened emails are picked up on a later poll',
        'Add an Imap Matcher with Recent set to INCLUDE, so new mail passes',
      ],
      answer: 0,
      explain: 'The docs do not reconcile these two statements or define REQUIRE, INCLUDE and EXCLUDE, so do not rely on either default. Set Seen yourself and test it on your own mail server. Trusting the INCLUDE default ignores the other statement. The watermark filters by received date, not by read flag. Recent says nothing about whether an email was opened.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'An IMAP listener polls every 5 minutes with Enable Watermark on, the default. An email arrives at 09:58, and the 10:00 poll skips it because the Imap Matcher does not accept it at that moment. By the 10:05 poll the email would pass the matcher. What happens to it?',
      options: [
        'It is dispatched at 10:05, because it now passes the matcher and was never dispatched',
        'It is dispatched at 10:05, because the watermark only records the ids of dispatched emails',
        'It is not dispatched, because the watermark filters by received date and it is now older',
        'It is not dispatched, because the 10:00 poll marked it as read on the server',
      ],
      answer: 2,
      explain: 'The connector watermarks by received date, so only mail newer than the last poll is dispatched. An email skipped on the poll after it arrived is not picked up on a later poll, because it is now older than the watermark. It would be dispatched at 10:05 only with the watermark off. The watermark does not track message ids, and skipping an email does not change its read flag.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each operation to what it does on an IMAP mailbox.',
      pairs: [
        ['email:mark-as-read', 'Changes one email to the read state'],
        ['email:move-to-folder', 'Moves one email from a source folder to a target folder'],
        ['email:delete', 'Removes one email and also erases every message flagged deleted in the folder'],
        ['email:expunge-folder', 'Removes all messages flagged deleted in the folder'],
      ],
      explain: 'The surprise here is `email:delete`: on IMAP it is not limited to the id you pass, because it also erases everything else flagged deleted in that folder.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The flow must file each processed email in `Processed/2026`, and that folder may not exist yet. Which setting matters?',
      options: [
        'Create Target Folder on email:move-to-folder, which defaults to false',
        'Delete After Retrieve on the listener, which defaults to false',
        'Target Folder on email:move-to-folder, which creates the folder when needed',
        'The Folder field on the listener, which defaults to INBOX',
      ],
      answer: 0,
      explain: 'Create Target Folder defaults to `false`, so the target must already exist unless you turn it on.',
    },
    {
      type: 'single',
      prompt: 'A Mule app with an `email:listener-imap` polling source runs on a two-node cluster. Both nodes must not dispatch the same email. Which setting handles this?',
      options: [
        'Turn on Enable Watermark on the listener',
        'Set Primary Node Only on the listener',
        'Add an Imap Matcher that filters on `seen`',
        'Use a longer frequency in the scheduling strategy',
      ],
      answer: 1,
      explain: 'A polling source that runs on every node reads the same mailbox from each of them. Primary Node Only keeps the source on the primary node. The reference lists no default for it on this listener, so set it explicitly. The watermark filters by received date and deletes nothing. The listener also needs a scheduling strategy, but that sets how often it polls and not where.',
    },
    {
      type: 'order',
      prompt: 'Put a safe processing sequence for one IMAP email in order.',
      items: [
        'The listener dispatches the email',
        'Save the id from the attributes in a variable',
        'Process the email and store the result durably',
        'Call email:move-to-folder with the saved id',
      ],
      explain: 'Keep the id early because later processors can replace the attributes, and change the state of the mailbox only after the business work has succeeded.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A shared mailbox holds 40,000 emails. The Imap Matcher keeps only a few emails from one sender, yet each poll moves a lot of data. A colleague proposes Enable Remote Search, which is false by default. What is the honest assessment?',
      options: [
        'It changes nothing, because the filters already run on the mail server by default',
        'It cuts traffic, because the mail server then applies the matcher filters',
        'It cuts traffic, because the server then searches the listener folder and not the whole mailbox',
        'It cuts traffic, because the listener then reads only headers and skips the message bodies',
      ],
      answer: 1,
      explain: 'With Remote Search on, the mail server applies the search filters instead of the client, which reduces traffic. It is off by default because some mail servers do not fully support the search terms, so test it on your own server. By default the filtering happens in the client, which is why each poll moves so much data. The setting is about where filters run, not about skipping the body.',
    },
  ],
  description: `
A logistics firm receives about 1,500 proof-of-delivery emails a day in \`pod@\`. A Mule app on a two-node cluster reads the mailbox with \`email:listener-imap\` every 5 minutes, stores each PDF and updates the TMS. A small customer service team also has the mailbox open in a mail client.

The team needs answers before go-live:

- Some emails will be opened by people before the flow sees them.
- Each processed email must be filed in a \`Processed\` folder for 12 months.
- The team has proposed \`email:delete\` for spam-like automated notices.
- Both cluster nodes must not read the same email.

**Questions**
1. What do the default matcher and the watermark do, and how do they interact?
2. How would you change the listener so that opened emails are still processed?
3. Compare mark-as-read, move, delete and expunge. Which would you use here?
4. What is the right cluster setup for the listener?
`,
  answerTemplate: `## Default matcher and watermark

## Processing emails that were already opened

## Mark-as-read, move, delete and expunge

## Cluster setup
`,
  keyPoints: [
    'The listener reference says already-read emails are filtered by default, but it also lists Seen with a default of INCLUDE and does not define it. Treat a person opening an email as a risk until a test proves otherwise.',
    'Enable Watermark defaults to true and works by received date: only emails received after the last poll are dispatched.',
    'The Imap Matcher filters on seen, answered, deleted, recent, receivedSince, subjectRegex and fromRegex.',
    'email:delete on IMAP also erases every message flagged deleted in the folder. email:expunge-folder removes all flagged messages.',
    'email:move-to-folder has targetFolder and createTargetFolder, which defaults to false.',
    'Primary Node Only keeps a polling source on one node of a cluster.',
    'Pass the id with emailId="#[attributes.id]" and change mailbox state only after processing succeeds.',
  ],
  solution: `
**1. Default matcher and watermark.** These are two separate filters:
- The **default matcher**: the listener reference says already-read emails are filtered by default. It also lists Seen with a default of INCLUDE, so prove this in a test mailbox.
- The **watermark** (on by default) uses the received date, so only emails received after the last poll are dispatched.

Together they can create a gap. If read emails are filtered and a person opens an email between its arrival and the next poll, the matcher drops it. By the following poll it is older than the watermark, so it stays skipped even if someone marks it unread again. No error is raised.

**2. Opened emails.** Configure an **Imap Matcher** whose \`seen\` setting also retrieves read emails. The field is described as choosing "seen" or "not seen" emails, with the values REQUIRE, INCLUDE and EXCLUDE. The reference does not define each value, and its INCLUDE default sits beside the statement that read emails are filtered by default. So set \`seen\` explicitly, and prove the result in a test mailbox with one read and one unread email. Keep the watermark on so read emails are not dispatched on every poll. The cleanest design is a mailbox that people do not work in.

**3. Mailbox operations.**
| Operation | Effect | Use here |
|---|---|---|
| \`email:mark-as-read\` | Changes one email to read | Possible, but leaves it in INBOX |
| \`email:move-to-folder\` | Moves one email to the target folder | **Yes**, for the 12-month archive |
| \`email:delete\` | Removes one email and, on IMAP, also erases everything flagged deleted in the folder | Avoid in a shared folder |
| \`email:expunge-folder\` | Removes all messages flagged deleted | Only as a deliberate clean-up |

\`\`\`xml
<set-variable variableName="emailId" value="#[attributes.id]"/>
<!-- store the PDF, update the TMS -->
<email:move-to-folder config-ref="imap" emailId="#[vars.emailId]"
                      targetFolder="Processed" createTargetFolder="true"/>
\`\`\`
Delete After Retrieve defaults to \`false\` to avoid deleting mail by mistake, and that is the right setting here because the emails must be kept.

**4. Cluster.** Run the source on the primary node only with **Primary Node Only**. The reference lists no default for it on this listener, so set it explicitly. Keep processing idempotent on the delivery reference, so a repeated email does no harm.
`,
  followUps: [
    {
      q: 'How would you recover emails that were skipped before the matcher was fixed?',
      a: 'They are older than the watermark, so changing the listener does not bring them back. Run a one-off flow with email:list-imap and a matcher that includes read emails, and process them idempotently.',
    },
    {
      q: 'When would you use Enable Remote Search?',
      a: 'When a mailbox is large and client-side filtering moves too much data. Check that the mail server supports the search terms you use, which is why the option is off by default.',
    },
    {
      q: 'What attributes does the IMAP listener give you?',
      a: 'The id and number, the flags (answered, deleted, draft, recent, seen), addresses, headers, subject, receivedDate and sentDate.',
    },
  ],
}
