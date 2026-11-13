import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-045',
  category: 'logging',
  title: "Stock Updates: PUT, ETags and Conflicts",
  level: 'ADVANCED',
  tags: ["logging","put","etag"],
  estMinutes: 20,
  quiz: fromLogging(["log-1071","log-1072","log-1073","log-1074","log-1075"]),
  description: `
The Inventory Process API of an invented home goods firm updates stock with PUT and If-Match. When two updates cross, the Inventory System API answers 412. Log the updates, the conflicts and the retry.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A 412 means nothing changed: another update came first.",
    "Log the ETag you sent and the status, so crossed updates can be matched.",
    "When the retry fails too, answer 409 and log the attempts.",
  ],
}
