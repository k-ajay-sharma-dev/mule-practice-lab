import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-058',
  category: 'logging',
  title: "JMS Transactions and Rollbacks",
  level: 'ADVANCED',
  tags: ["logging","jms","transactions","rollback"],
  estMinutes: 15,
  quiz: fromLogging(["log-2061","log-2062","log-2063","log-2064","log-2065"]),
  description: `
Tessaly Hotels reads reservations from a JMS queue inside a transaction. When something fails, the transaction rolls back and the message comes again. Make the log lines tell the truth about what was committed.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A message published inside a transaction is only sent on commit. Say so.",
    "On Error Continue commits the transaction, so the message is not redelivered.",
    "A rollback with redelivery is WARN, with the delivery count.",
  ],
}
