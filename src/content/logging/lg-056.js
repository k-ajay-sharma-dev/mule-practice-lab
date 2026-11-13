import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-056',
  category: 'logging',
  title: "Duplicate Payments on Kafka",
  level: 'INTERMEDIATE',
  tags: ["logging","kafka","idempotency","payments"],
  estMinutes: 15,
  quiz: fromLogging(["log-2051","log-2052","log-2053","log-2054","log-2055"]),
  description: `
Quillon Bank reads payment instructions from Kafka, which delivers at least once. An Idempotent Message Validator stops duplicates. Log the duplicates and the case where the check itself fails.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A stopped duplicate is INFO or WARN, with the key that was checked.",
    "If the duplicate check cannot run, stop and log ERROR.",
    "Never log account numbers. The payment ID is enough.",
  ],
}
