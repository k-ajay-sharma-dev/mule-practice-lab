import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-199',
  category: 'logging',
  title: "Archives",
  level: 'ADVANCED',
  tags: ["logging","myproject","large-files","zip","security"],
  estMinutes: 25,
  quiz: fromLogging(["log-16041","log-16042","log-16043","log-16044","log-16045"]),
  description: `
Thornbury Freight extracts large zip archives entry by entry. Log the result and reject unsafe archives.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log entries, uncompressed size, written and skipped.",
    "Reject entries with unsafe paths.",
    "Do not list every entry name.",
  ],
}
