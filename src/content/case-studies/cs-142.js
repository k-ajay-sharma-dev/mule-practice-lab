export default {
  id: 'cs-142',
  category: 'case-studies',
  title: 'Library Service Letting Members Renew Loans and Reserve Books From a New App',
  level: 'BEGINNER',
  tags: ['api-led', 'mobile', 'public-sector', 'legacy'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The app needs loans, renewals and reservations from the old library system. How should it reach them?',
      options: [
        'Through an API in Mule that wraps the library web service',
        'The app calls the library web service directly from each phone',
        'The app connects to the library system database with a read user',
        'A nightly export of loans is loaded into the app’s own database',
      ],
      answer: 0,
      explain: 'An API hides the old system, protects it from load, and lets you replace it later without changing the app. Direct calls expose a fragile system to every phone, and a nightly export cannot renew or reserve.',
    },
    {
      type: 'single',
      prompt: 'A member tries to renew a book that someone else has reserved. What should the API return?',
      options: [
        'A clear "reserved by another member" answer, with the due date unchanged',
        'A 500 error with the message the library system returned',
        'A success, with the renewal queued until the reservation is filled',
        'A success, since the library system will refuse it later anyway',
      ],
      answer: 0,
      explain: 'A business rule that says no is a normal answer, not a server error. The member needs to know why, and must not be told a renewal worked when it did not.',
    },
    {
      type: 'multi',
      prompt: 'Which three protect members’ data in the app?',
      options: [
        'Members log in, and the API returns only their own loans',
        'The API never returns other members’ names on reservations',
        'Tokens are short-lived and checked on each call',
        'The app sends the card number and PIN with every API call',
      ],
      answer: [0, 1, 2],
      explain: 'Each member sees only their own data. Sending the card number and PIN on every call spreads the secret across every request and log, where a short-lived token limits the damage of a leak.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The library system goes offline every night from 1 to 2 for backups. What should the app do then?',
      options: [
        'Show cached loans and say renewals are paused until 2 AM',
        'Show an error page for the whole app until 2 AM',
        'Accept renewals and tell members they are done, then send them at 2 AM',
        'Retry each renewal against the library system until it answers',
      ],
      answer: 0,
      explain: 'Be honest about the window. Reading from a cache is fine, but renewals must wait for the real system, which may refuse them. Retrying for an hour holds the member and adds load at 2 AM.',
    },
    {
      type: 'match',
      prompt: 'Match each feature to its call.',
      pairs: [
        ['See my loans', 'GET my loans'],
        ['Renew a loan', 'POST a renewal for one loan'],
        ['Reserve a book', 'POST a reservation'],
        ['Cancel a reservation', 'DELETE the reservation'],
      ],
      explain: 'Small, clear operations that match what members do.',
    },
    {
      type: 'order',
      prompt: 'Order the project.',
      items: [
        'Agree the operations the app needs',
        'Build the API over the library system',
        'Add member login and per-member access',
        'Pilot with library staff',
        'Release to members and watch errors and response times',
      ],
      explain: 'Scope, build, secure, try with staff, then release.',
    },
  ],
  description: `
**Context.** A county library service has **120,000 members**. Members ask for an app to see their loans, renew them and reserve books.

**Facts gathered so far**
- The library system is old but has a web service for loans and reservations.
- It is offline every night from 1 to 2 for backups.
- Renewals are refused when another member has reserved the book.
- Members log in today with their library card number and a PIN on the website.

**Opinions**
- Head of libraries: "Members should not need to phone us to renew."
- IT: "The library system is fragile under load."

**Your task.** Design how the app gets to loans, renewals and reservations.
`,
  answerTemplate: `## Decision

## API

## Business rules

## Security

## Backup window

## Rollout

## Risks
`,
  keyPoints: [
    'Put an API in front of the old system.',
    'Return clear answers for business rules such as "reserved by another member".',
    'Members see only their own data.',
    'Cache reads and pause writes during the backup window.',
    'Protect the old system from load with limits and caching.',
    'Pilot with staff before members.',
  ],
  solution: `
**Decision.** A Members API in Mule wraps the library web service. The app calls only the API.

**API.** Operations to list my loans, renew a loan, reserve a book and cancel a reservation.

**Business rules.** The library system decides. The API turns its answers into clear messages, such as "reserved by another member".

**Security.** Members log in once with their card number and PIN through an identity service, which issues a short-lived token. The API reads the member from the token and returns only their own data.

**Backup window.** Loans are cached for a short time. Between 1 and 2, renewals and reservations answer "paused until 2 AM".

**Rollout.** Staff pilot, then members, with alerts on errors and slow calls.

**Risks.** Load on the old system, members locked out of login, and rules the old system applies quietly.
`,
  followUps: [
    { q: 'Why not let the app call the library web service?', a: 'It would expose the old system and tie the app to it. The API protects it and can change later.' },
    { q: 'How do you protect the old system from load?', a: 'A rate limit on the API and a short cache for loan lists.' },
    { q: 'What if a member renews twice by tapping twice?', a: 'Renewing the same loan twice should give the same answer. Check the due date before renewing again.' },
    { q: 'What do you measure?', a: 'Renewals through the app, calls to the library desk, and errors.' },
  ],
}
