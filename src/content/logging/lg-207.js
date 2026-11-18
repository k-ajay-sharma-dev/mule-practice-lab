import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-207',
  category: 'logging',
  title: "Oracle Session Use and Code Maps",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","oracle","connections","code-map"],
  estMinutes: 25,
  quiz: fromLogging(["log-17031","log-17032","log-17033","log-17034","log-17035"]),
  description: `
Fenwick Supply watches Oracle session use after scaling and logs code map misses.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log pool settings and the total across replicas at startup.",
    "Warn when session use nears the limit.",
    "Log code map misses with field, value and count.",
  ],
}
