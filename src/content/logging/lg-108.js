import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-108',
  category: 'logging',
  title: "Timing Each Call",
  level: 'INTERMEDIATE',
  tags: ["logging","performance","duration"],
  estMinutes: 10,
  quiz: fromLogging(["log-6011","log-6012","log-6013","log-6014","log-6015"]),
  description: `
The Alderwood Prescription API checks stock in the Stock System API for every prescription. Pharmacists say it is slow some days. Log how long each call takes, so the team can see when and where.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the status and the duration after each call.",
    "Put the unit in the field name, such as durationMs.",
    "A slow call that still works is WARN.",
  ],
}
