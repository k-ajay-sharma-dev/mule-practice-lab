import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-047',
  category: 'logging',
  title: "A VM Queue Between Two Flows",
  level: 'BEGINNER',
  tags: ["logging","vm","queues","async"],
  estMinutes: 10,
  quiz: fromLogging(["log-2006","log-2007","log-2008","log-2009","log-2010"]),
  description: `
Halvorsen Freight takes bookings in one flow and prices them in another. A VM queue sits between the two. Log both sides so a booking can be followed across the queue.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log on both sides of a VM queue with the same business key and correlation ID.",
    "A full queue that turns work away is ERROR.",
    "The last line of a flow gives the result and the time it took.",
  ],
}
