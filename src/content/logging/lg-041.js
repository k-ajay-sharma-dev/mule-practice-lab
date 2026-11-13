import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-041',
  category: 'logging',
  title: "Client IDs, 401s and 429s",
  level: 'INTERMEDIATE',
  tags: ["logging","policies","client-id"],
  estMinutes: 15,
  quiz: fromLogging(["log-1051","log-1052","log-1053","log-1054","log-1055"]),
  description: `
An invented food company runs an Order Experience API that calls an Order Process API. The Process API has Client ID Enforcement and Rate Limiting policies. Some questions look at the 401 and the 429 from the calling app, others stand inside the protected API and ask what its own loggers can see.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A request that a policy rejects never reaches the flow loggers.",
    "The client ID names the caller. The client secret never goes in a log.",
    "A 429 that the flow handles is a WARN with the wait time.",
  ],
}
