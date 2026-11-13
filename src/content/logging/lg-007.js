import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-007',
  category: 'logging',
  title: "Debugging in Dev Without Leaking Data",
  level: 'BEGINNER',
  tags: ["logging","debug","security"],
  estMinutes: 20,
  quiz: fromLogging(["log-002","log-066","log-117","log-435","log-437","log-044"]),
  description: `
You are fixing a mapping and a 401 in the dev and test environments. You want to see payloads and headers while you work, without leaving anything unsafe behind for production.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Detail for troubleshooting belongs at DEBUG, which is off in production.",
    "Headers can hold tokens: log the ones you need, never Authorization.",
    "Remove or lower temporary loggers before the code moves on.",
  ],
}
