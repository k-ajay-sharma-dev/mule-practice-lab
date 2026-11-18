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
        'Through an API in Mule that wraps the library system, so the app never calls it directly',
        'The app connects to the library database',
        'Staff copy data into the app each day',
        'The app reads the library website',
      ],
      answer: 0,
      explain: 'An API hides the old system, protects it from load, and lets you replace it later without changing the app.',
    },
    {
      type: 'single',
      prompt: 'A member tries to renew a book that someone else has reserved. What should the API return?',
      options: [
        'A clear "cannot renew, reserved by another member" answer, with the due date unchanged',
        'A generic error',
        'Renew it anyway',
        'Nothing',
      ],
      answer: 0,
      explain: 'A business rule that says no is a normal answer. The member needs to know why.',
    },
    {
      type: 'multi',
      prompt: 'Which three protect members\' data in the app?',
      options: [
        'Members log in, and the API returns only their own loans',
        'The API never returns other members\' names on reservations',
        'Tokens are short-lived and checked on each call',
        'The app keeps a copy of every member\'s record',
      ],
      answer: [0, 1, 2],
      explain: 'Each member sees only their own data. A copy of every record on a phone would be a risk.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The library system goes offline every night from 1 to 2 for backups. What should the app do then?',
      options: [
        'Show the loans from a recent cache and say renewals are paused until 2 AM',
        'Crash',
        'Let renewals succeed and lose them',
        'Hide the app',
      ],
      answer: 0,
      explain: 'Be honest about the window. Reading from a cache is fine, but renewals must wait for the real system.',
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

**Security.** Members log in through the council identity service. The API reads the member from the token and returns only their own data.

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
