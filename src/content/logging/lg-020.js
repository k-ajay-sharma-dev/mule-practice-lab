import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-020',
  category: 'logging',
  title: "OAuth Tokens",
  level: 'INTERMEDIATE',
  tags: ["logging","oauth","security"],
  estMinutes: 15,
  quiz: fromLogging(["log-109","log-110","log-209","log-302","log-422","log-428"]),
  description: `
Your apps fetch OAuth tokens for Salesforce and partner APIs, and check client IDs of callers. Log token refreshes and refusals without ever logging a token.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A routine token refresh is DEBUG or INFO, without the token.",
    "A refresh refused with invalid_grant stops all calls: ERROR, so someone renews the credentials.",
    "A caller refused by the client ID check is WARN with the client ID.",
  ],
}
