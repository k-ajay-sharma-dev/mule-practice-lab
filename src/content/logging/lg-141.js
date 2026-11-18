import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-141',
  category: 'logging',
  title: "Customer Profile Changes",
  level: 'BEGINNER',
  tags: ["logging","personal-data","audit","customers"],
  estMinutes: 15,
  quiz: fromLogging(["log-11001","log-11002","log-11003","log-11004","log-11005"]),
  description: `
Bramble Insurance lets customers change their details in its app. Log each change so the insurer can show when details changed, without copying the details into the logs.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the names of the fields that changed, never their values.",
    "Add the customer ID and the channel.",
    "Log a refused change with the field and the reason, not what was typed.",
  ],
}
