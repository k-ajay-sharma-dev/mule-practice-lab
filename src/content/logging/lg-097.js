import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-097',
  category: 'logging',
  title: "Until Successful at a Pharmacy",
  level: 'INTERMEDIATE',
  tags: ["until-successful","retries","healthcare"],
  estMinutes: 15,
  quiz: fromLogging(["log-5031","log-5032","log-5033","log-5034","log-5035"]),
  description: `
Meadowbrook Pharmacy sends prescription refills to a dispensing system with Until Successful. Log the failed attempts and the moment the retries run out.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "maxRetries counts the retries, so the call is made one more time than that.",
    "The runtime logs each failed attempt at ERROR, without your correlation ID or business IDs.",
    "Handle MULE:RETRY_EXHAUSTED and say what happens next.",
  ],
}
