import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-023',
  category: 'logging',
  title: "Database Calls",
  level: 'INTERMEDIATE',
  tags: ["logging","database"],
  estMinutes: 15,
  quiz: fromLogging(["log-010","log-203","log-221","log-418","log-305","log-419"]),
  description: `
Your APIs read and write the orders database. Sometimes the database cannot be reached. Log the calls and the failures at the right level.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "After a select, log how many rows came back, not the rows.",
    "After an insert, log the key and the affected rows.",
    "A database that cannot be reached breaks every request: ERROR, with the error type.",
  ],
}
