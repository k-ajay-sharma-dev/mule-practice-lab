import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-048',
  category: 'logging',
  title: "Reading Bookings from a JMS Queue",
  level: 'BEGINNER',
  tags: ["logging","jms","queues","listener"],
  estMinutes: 15,
  quiz: fromLogging(["log-2011","log-2012","log-2013","log-2014","log-2015"]),
  description: `
Northfield Rail receives ticket bookings on the JMS queue TICKETS.IN. Write the loggers for a booking that arrives and for one that is rejected.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the JMS message ID and the business key when a message arrives.",
    "Pick facts from attributes. Do not write the whole object.",
    "A rejected message is WARN, with the reason and where it went.",
  ],
}
