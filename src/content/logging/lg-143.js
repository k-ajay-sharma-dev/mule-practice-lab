import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-143',
  category: 'logging',
  title: "Webhooks Sent to Merchants",
  level: 'INTERMEDIATE',
  tags: ["logging","webhooks","retries","partners"],
  estMinutes: 20,
  quiz: fromLogging(["log-11011","log-11012","log-11013","log-11014","log-11015"]),
  description: `
Quayside Payments sends webhooks to merchants and retries when they fail. Log each attempt so support can answer "we never got it" in seconds.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log every attempt with the event ID, status and attempt number.",
    "Never log the body or the signature.",
    "Log at ERROR when every attempt has failed, and say how to resend.",
  ],
}
