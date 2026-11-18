import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-122',
  category: 'logging',
  title: "Duplicate Prescription Messages",
  level: 'INTERMEDIATE',
  tags: ["myproject", "logging","idempotency","queues","dlq"],
  estMinutes: 20,
  quiz: fromLogging(["log-7006","log-7007","log-7008","log-7009","log-7010"]),
  description: `
Larkspur Pharmacy reads prescriptions from a queue with an Idempotent Message Validator. After a broker reconnect, some messages arrive twice. Log duplicates and failures so the team can prove nothing was filled twice, without putting patient data in the logs.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A dropped duplicate is expected, so INFO or WARN, with the message and prescription IDs.",
    "A message that runs out of deliveries is an ERROR that says it went to the DLQ.",
    "Never log patient data. IDs are enough to trace a prescription.",
  ],
}
