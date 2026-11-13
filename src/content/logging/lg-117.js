import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-117',
  category: 'logging',
  title: "Orders Lost Between Two Apps",
  level: 'ADVANCED',
  tags: ["logging","incident","splunk","correlation-id"],
  estMinutes: 20,
  quiz: fromLogging(["log-6056","log-6057","log-6058","log-6059","log-6060"]),
  description: `
Quillstone customers say their orders were accepted but never confirmed. During the incident you search the logs of the Web Order Experience API and the Order Process API to find where the orders went.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Find one line by a business ID, then search by its correlation ID.",
    "A gap after a call means its result was never logged.",
    "Every error handler needs a logger, so a failure is never silent.",
  ],
}
