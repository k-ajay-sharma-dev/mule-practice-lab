import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-018',
  category: 'logging',
  title: "Handing Work Between Flows",
  level: 'INTERMEDIATE',
  tags: ["logging","vm","async"],
  estMinutes: 15,
  quiz: fromLogging(["log-227","log-432","log-409","log-217","log-220"]),
  description: `
An API answers 202 and hands the order to a VM queue, an Async scope sends emails and audit records, and SAP sends IDocs. Make sure the logs still join up across these hand-offs.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "The correlation ID must travel with the work, so the receiving flow can log it.",
    "Work in an Async scope needs its own line: the main flow does not wait for it.",
    "Log the business key on both sides of a hand-off.",
  ],
}
