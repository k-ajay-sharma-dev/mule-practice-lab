import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-131',
  category: 'logging',
  title: "Statements That Bounce",
  level: 'BEGINNER',
  tags: ["myproject", "logging","notifications","personal-data","batch"],
  estMinutes: 20,
  quiz: fromLogging(["log-9001","log-9002","log-9003","log-9004","log-9005"]),
  description: `
Larchmont Lettings sends monthly statements to 3,000 landlords. A few bounce each month and get a paper copy instead. Log bounces and the run summary so support can fix contact details, without copying any address into the logs.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A bounced statement with a fallback is a WARN with IDs, the error and what happens next.",
    "Log landlord and statement IDs, never the address.",
    "End each run with one line of labelled counts and the duration.",
  ],
}
