import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-150',
  category: 'logging',
  title: "Turning Away Traffic Under Load",
  level: 'EXPERT',
  tags: ["logging","performance","load-shedding","volume"],
  estMinutes: 30,
  quiz: fromLogging(["log-11046","log-11047","log-11048","log-11049","log-11050"]),
  description: `
Greyfriars Ticketing turns away requests it cannot take during an on-sale. Log the overload as counts, so logging does not add load at the worst moment.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log one summary line a minute, not a line per rejected request.",
    "Add rejected, accepted and the limit.",
    "Log one closing line with the total and how long it lasted.",
  ],
}
