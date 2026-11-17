import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-126',
  category: 'logging',
  title: "Webhooks and Signature Checks",
  level: 'INTERMEDIATE',
  tags: ["logging","webhooks","security","signatures"],
  estMinutes: 20,
  quiz: fromLogging(["log-8001","log-8002","log-8003","log-8004","log-8005"]),
  description: `
Quillon Couriers receives payment webhooks from a payment provider. Each one carries a signature the flow checks before it trusts the event. Log rejected and accepted webhooks so the team can spot fake events and sender retries, without logging signatures or bodies.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A rejected signature is a WARN with the sender, event ID and status.",
    "Never log the signature header or the webhook body.",
    "On accepted events, log the event ID, type and whether it was a repeat.",
  ],
}
