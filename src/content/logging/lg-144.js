import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-144',
  category: 'logging',
  title: "Slow Searches",
  level: 'ADVANCED',
  tags: ["logging","performance","search","latency"],
  estMinutes: 25,
  quiz: fromLogging(["log-11016","log-11017","log-11018","log-11019","log-11020"]),
  description: `
Larkspur Books wants its search to answer within a second. Log slow searches with the shape of the query, so the team can find the cause without logging what customers typed.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log a slow request at WARN with the time and the target.",
    "Log the shape of the query: filters, sort, page and result count.",
    "Leave out the search words. They can hold personal details.",
  ],
}
