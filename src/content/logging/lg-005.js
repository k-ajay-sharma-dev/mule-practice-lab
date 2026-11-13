import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-005',
  category: 'logging',
  title: "Bad Requests and Normal Not Founds",
  level: 'BEGINNER',
  tags: ["logging","validation","apikit"],
  estMinutes: 20,
  quiz: fromLogging(["log-009","log-021","log-064","log-067","log-309","log-404"]),
  description: `
Clients send requests with missing fields, and ask for customers or products that do not exist. These are normal answers of a healthy API. Log them at the right level.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A 400 or 404 caused by the caller is not an ERROR of your app. Use INFO or WARN.",
    "Say which field was wrong, not the whole payload.",
    "Save ERROR for the failures someone in your team must fix.",
  ],
}
