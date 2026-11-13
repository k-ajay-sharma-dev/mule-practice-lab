import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-101',
  category: 'logging',
  title: "log4j2.xml for a Bank Runtime",
  level: 'INTERMEDIATE',
  tags: ["log4j2","categories","appenders"],
  estMinutes: 20,
  quiz: fromLogging(["log-5051","log-5052","log-5053","log-5054","log-5055"]),
  description: `
Alder Bank runs its payments app on its own Mule runtime. Review the log4j2.xml after a disk-full alert and use categories to trace one problem.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A named AsyncLogger has its own level, whatever the root says.",
    "Keep the HTTP wire logger off in production.",
    "A rolling file keeps a fixed size, so noisy logs shorten your history.",
  ],
}
