import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-003',
  category: 'logging',
  title: "Retries Against SAP and Workday",
  level: 'INTERMEDIATE',
  tags: ["logging","retry","until-successful"],
  estMinutes: 15,
  quiz: fromLogging(["log-004","log-022","log-063","log-430","log-326","log-219"]),
  description: `
SAP sometimes times out and Workday sometimes answers 429. Your flows retry with Until Successful and a wait. Log the retries so a slow day is visible without filling the log.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A retry that will probably work is WARN, not ERROR.",
    "Each retry line says which attempt it is and what failed.",
    "A call that worked after a retry gets one INFO line with the attempt count.",
  ],
}
