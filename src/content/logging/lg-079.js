import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-079',
  category: 'logging',
  title: "Store Stock Database",
  level: 'BEGINNER',
  tags: ["logging","database","update"],
  estMinutes: 10,
  quiz: fromLogging(["log-4016","log-4017","log-4018","log-4019","log-4020"]),
  description: `
The Stock System API of Pinecrest Grocers reads and lowers stock in a database after each sale. Log the selects and updates so a wrong stock level can be traced.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "After an update, log affectedRows with the keys you changed.",
    "An update that matches 0 rows raises no error, so check it yourself.",
    "A slow query that still works is a WARN.",
  ],
}
