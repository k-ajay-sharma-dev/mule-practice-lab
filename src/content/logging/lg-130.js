import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-130',
  category: 'logging',
  title: "Progress of a Long Migration",
  level: 'BEGINNER',
  tags: ["myproject", "logging","migration","batch","restart"],
  estMinutes: 20,
  quiz: fromLogging(["log-8021","log-8022","log-8023","log-8024","log-8025"]),
  description: `
Wrenfield Insurance moves 2 million policies to a new system over one weekend. The team watches the logs all weekend and must be able to restart the job if it stops.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log progress every set number of records, not every record.",
    "Put the last committed ID and the run ID on progress lines, so a restart knows where to begin.",
    "Log each failed record at WARN with its ID, the error and what happens next.",
  ],
}
