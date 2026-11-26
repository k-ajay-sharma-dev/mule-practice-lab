export default {
  id: 'cs-143',
  category: 'case-studies',
  title: 'Recruitment Agency Pulling Candidates From Six Job Boards Into One Applicant Tracking System',
  level: 'INTERMEDIATE',
  tags: ['canonical-model', 'deduplication', 'personal-data', 'partners'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Each application comes with a CV file. How should the CV travel through the intake?',
      options: [
        'As a link to the file in secure storage, carried in the application',
        'As base64 content inside the application message on the queue',
        'As the URL of the CV on the job board site where it was uploaded',
        'As text pulled out of the CV, with the original file dropped',
      ],
      answer: 0,
      explain: 'The file is stored once in secure storage, and the application carries only a link. CVs then stay out of queues, error messages and logs, and there is one place to delete at the end of retention. Base64 on the queue puts the CV in every retry, dead letter and error. A board URL can expire, and the agency cannot control or delete it. Text alone loses the document recruiters need.',
    },
    {
      type: 'single',
      prompt: 'The same person applies through two boards. How do you avoid two candidate records?',
      options: [
        'Match on normalised email and phone, and link to the existing candidate',
        'Create a new record each time and let recruiters merge them by hand',
        'Match on full name and town, and link to the existing candidate',
        'Match on the email exactly as each board sends it, without changes',
      ],
      answer: 0,
      explain: 'Normalised contact details are the best match keys here. Names repeat, and the same email can arrive in different case or with spaces from different boards. Unclear matches go to a recruiter to decide.',
    },
    {
      type: 'multi',
      prompt: 'Which three rules protect candidates’ personal data?',
      options: [
        'Record the consent and the source of each application',
        'Delete or anonymise candidates after the agreed retention period',
        'Keep CVs out of logs and error queues',
        'Keep a backup copy of every CV in the integration, in case the ATS loses one',
        'Encrypt CVs written to logs so they can stay there for debugging',
        'Rely on each job board to hold the consent the candidate gave there',
      ],
      answer: [0, 1, 2],
      explain: 'Consent, retention and keeping documents out of logs are the basics for personal data. A second copy of every CV in the integration is one more place to secure and to delete on time. Encrypted CVs in logs still have to be found and deleted when the retention period ends, so keep them out. The agency must show consent itself, so it records consent and source with each application instead of relying on six boards.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'One board sends a burst of 3,000 applications for a new graduate scheme. What keeps the ATS safe?',
      options: [
        'Queue the applications and load them within the ATS limit',
        'Load them all in parallel as the webhooks arrive',
        'Refuse the webhook calls with an error once the ATS limit is reached',
        'Load them one by one inside each webhook call, before answering',
      ],
      answer: 0,
      explain: 'A queue soaks up the burst and protects the ATS. At 10 calls a second, 3,000 applications load in about five minutes, and no application is lost. Parallel loading breaks the limit, and refusing webhooks leaves the board to retry or drop them.',
    },
    {
      type: 'match',
      prompt: 'Match each step to its job.',
      pairs: [
        ['Board adapter', 'Turns one board format into the canonical application'],
        ['Matching', 'Links the application to an existing candidate or creates one'],
        ['Queue', 'Smooths bursts before the ATS'],
        ['Retention job', 'Removes data after the agreed period'],
      ],
      explain: 'Each step has one job, so a new board needs only a new adapter.',
    },
    {
      type: 'order',
      prompt: 'Order the project.',
      items: [
        'Design the canonical application and match rules',
        'Build matching, the queue and the ATS loader',
        'Add the two busiest boards',
        'Add the other four boards',
        'Add the retention job and reports',
      ],
      explain: 'Core first, then the biggest sources, then the rest, then data care.',
    },
  ],
  description: `
**Context.** A recruitment agency posts jobs on **six job boards**. Applications arrive by email, file and API, and recruiters key them into the applicant tracking system (ATS).

**Facts gathered so far**
- Each board sends a different format. Two have APIs with webhooks.
- About a fifth of candidates apply through more than one board.
- The ATS has an API with a limit of 10 calls a second.
- The agency must keep candidate data only for an agreed period and record consent.
- Big campaigns bring thousands of applications in a day.

**Opinions**
- Recruiters: "Duplicates waste our time."
- Compliance: "We must be able to show consent and delete on time."
- IT: "We keep adding boards."

**Your task.** Design how applications from all boards reach the ATS, with matching, consent and retention.
`,
  answerTemplate: `## Decision

## Canonical application

## Board adapters

## Matching

## Load and limits

## Personal data

## Rollout

## Risks
`,
  keyPoints: [
    'One canonical application with an adapter per board.',
    'Match by normalised email and phone, and send unclear cases to a recruiter.',
    'A queue protects the ATS from bursts.',
    'Record consent and source with each application.',
    'Delete or anonymise after the retention period.',
    'Keep CVs out of logs and error queues.',
  ],
  solution: `
**Decision.** An intake platform with one adapter per board, a canonical application, matching, a queue and one ATS loader.

**Canonical application.** Candidate details, the job, the board, the consent text and time, and a link to the CV in secure storage.

**Board adapters.** Webhooks for boards with APIs, polling or files for the others.

**Matching.** Normalise email and phone, look up the candidate, link or create. Weak matches go to a review list.

**Load and limits.** Applications wait on a queue and are loaded within the ATS limit.

**Personal data.** CVs stay in secure storage, never in logs. A nightly job removes data past its retention date.

**Risks.** Wrong matches merging two people, a board changing its format, and CVs ending up in error messages.
`,
  followUps: [
    { q: 'Why not match on name and date of birth?', a: 'Many boards do not send a date of birth, and names repeat. Contact details are more reliable here.' },
    { q: 'What if two candidates share an email?', a: 'Treat it as a weak match and let a recruiter decide.' },
    { q: 'How do you add a seventh board?', a: 'Write one adapter to the canonical application. Everything after it stays the same.' },
    { q: 'How do you prove deletion?', a: 'Log the candidate ID and the date of deletion, without the deleted data.' },
  ],
}
