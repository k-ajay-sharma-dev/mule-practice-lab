export default {
  id: 'cs-136',
  category: 'case-studies',
  title: 'Vet Clinic Chain Linking an Online Booking App to 150 Clinic Systems and Sending Reminders',
  level: 'INTERMEDIATE',
  tags: ['booking', 'saas', 'reminders', 'sync', 'healthcare'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Which system should own the appointment diary?',
      options: [
        'The clinic system, because staff also book at the desk and by phone; the app reads free slots and asks the clinic system to book',
        'The booking app, with clinics copying it every night',
        'Both, each with its own diary',
        'A spreadsheet per clinic',
      ],
      answer: 0,
      explain: 'One owner per slot stops double bookings. The clinic system already takes desk and phone bookings, so it stays the owner.',
    },
    {
      type: 'single',
      prompt: 'Two people try to book the last 9:00 slot at once, one in the app and one at the desk. What should happen?',
      options: [
        'The clinic system books the first request; the second gets a clear "slot taken" answer and fresh slots',
        'Both are booked and the vet sorts it out',
        'The app always wins',
        'The integration retries until both succeed',
      ],
      answer: 0,
      explain: 'The owner decides. The app must handle a "slot taken" answer as normal, not as an error.',
    },
    {
      type: 'multi',
      prompt: 'Which three things keep reminders safe?',
      options: [
        'Send a reminder only for appointments the clinic system still holds, checked shortly before sending',
        'Respect each owner\'s contact choice and opt out',
        'Keep a record of what was sent, so a rerun does not send twice',
        'Send the full medical history in the reminder',
      ],
      answer: [0, 1, 2],
      explain: 'A reminder for a cancelled visit, an unwanted message or a double message all hurt trust. Medical details do not belong in a reminder.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Some clinics lose their internet link for an hour at a time. What should the app do?',
      options: [
        'Show that online booking is unavailable for that clinic, and stop offering its slots until the link is back',
        'Take bookings and send them later',
        'Show the slots from yesterday',
        'Hide the clinic forever',
      ],
      answer: 0,
      explain: 'Taking bookings you cannot confirm leads to double bookings. Being honest about the outage is safer.',
    },
    {
      type: 'match',
      prompt: 'Match each need to how it is met.',
      pairs: [
        ['Free slots in the app', 'Read from the clinic system, cached for a short time'],
        ['A new booking', 'Sent to the clinic system, which confirms or refuses it'],
        ['A desk cancellation', 'Event from the clinic system that frees the slot in the app'],
        ['Reminder 24 hours before', 'Scheduled job that checks the appointment still exists'],
      ],
      explain: 'Reads, writes, changes and reminders each have their own pattern, and the clinic system is the source for all of them.',
    },
    {
      type: 'order',
      prompt: 'Order the rollout.',
      items: [
        'Agree the clinic system as owner of the diary',
        'Build the slot and booking APIs over the clinic system',
        'Pilot in five clinics with good links',
        'Add reminders with a sent record',
        'Roll out clinic by clinic, with a check of the link first',
      ],
      explain: 'Settle ownership, build the core path, prove it small, add reminders, then grow.',
    },
  ],
  description: `
**Context.** A chain of **150 vet clinics** wants pet owners to book online through a new booking app. Each clinic runs its own copy of the same clinic system, which staff use for desk and phone bookings.

**Facts gathered so far**
- The clinic system has an API on each clinic's server. It can list free slots and create or cancel appointments.
- About 20 clinics have weak internet links that drop for an hour or so a few times a month.
- Owners want a reminder by text or email 24 hours before the visit. Some have opted out.
- About 40% of bookings are still made at the desk or by phone.

**Opinions**
- Marketing: "The app must always show slots, even if a clinic is offline."
- Clinic managers: "Double bookings are the worst thing that can happen."
- IT: "We cannot change the clinic system."

**Your task.** Design how the app, the clinic systems and the reminders work together, and how you roll it out.
`,
  answerTemplate: `## Decision

## Owner of the diary

## Booking flow

## Cancellations

## Reminders

## Offline clinics

## Rollout

## Risks
`,
  keyPoints: [
    'The clinic system stays the owner of every slot.',
    'The app reads slots and asks the clinic system to book.',
    '"Slot taken" is a normal answer, not an error.',
    'Desk cancellations reach the app as events.',
    'Reminders check the appointment still exists and respect opt outs.',
    'An offline clinic shows as unavailable, never as stale slots.',
  ],
  solution: `
**Decision.** The clinic system owns the diary. Mule puts one booking API in front of all 150 clinic systems, routing by clinic ID.

**Owner of the diary.** Slots are read from the clinic system and cached for a minute or two. Every booking is made in the clinic system, which can refuse it.

**Booking flow.** The app calls the booking API. Mule asks the right clinic system to create the appointment and returns the result. A "slot taken" answer comes back with fresh slots.

**Cancellations.** Desk changes are polled or pushed from each clinic system and update the cache, so freed slots appear in the app.

**Reminders.** A scheduled job finds visits for tomorrow, checks each one still exists, skips owners who opted out, sends the message, and records it so a rerun does not send twice. No medical details are in the message.

**Offline clinics.** A health check per clinic. When a clinic is unreachable, the app shows "online booking unavailable, please call" for that clinic.

**Rollout.** Pilot five clinics with good links, then add clinics in groups, checking each link first.

**Risks.** Clinics on old versions of the clinic system, a cache showing a slot that was booked a moment ago, and reminders sent for visits moved at the last minute.
`,
  followUps: [
    { q: 'Why not copy every diary to the cloud?', a: 'Two copies of a diary that both take bookings will conflict. The clinic system must stay the one place that says yes.' },
    { q: 'How long can slots be cached?', a: 'Briefly, a minute or two. The booking call is the real check, so a stale slot only causes a "slot taken" answer.' },
    { q: 'How do you reach 150 clinic servers safely?', a: 'Through a secure network link or an agent at each clinic, never by opening each clinic server to the internet.' },
    { q: 'What do you measure after launch?', a: 'Booking success rate, "slot taken" answers, clinics offline, reminder sends and opt outs.' },
  ],
}
