import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-001',
  category: 'logging',
  title: "Order API: The First and Last Line of a Request",
  level: 'BEGINNER',
  tags: ["logging","http","correlation-id"],
  estMinutes: 15,
  quiz: fromLogging(["log-001","log-023","log-040","log-060","log-072"]),
  description: `
The Order Process API takes POST /orders, creates the order in SAP and answers 201. Operations read its logs every day. Decide what the API logs when a request arrives and when it ends.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log one INFO line when a request arrives and one when it ends.",
    "Every line carries the correlation ID, so one request can be followed across apps.",
    "The last line gives the result and how long the request took.",
  ],
}
