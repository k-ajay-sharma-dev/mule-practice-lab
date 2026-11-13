import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-035',
  category: 'logging',
  title: "Shipping API: Carrier Calls and Their Status Codes",
  level: 'INTERMEDIATE',
  tags: ["logging","http-request","status-codes"],
  estMinutes: 15,
  quiz: fromLogging(["log-1021","log-1022","log-1023","log-1024","log-1025"]),
  description: `
The Shipping Process API of an invented parcel company calls the Carrier System API to create labels. Calls answer 201, and sometimes 503. Log each call and its failure.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "After an HTTP Request, attributes holds the response, with statusCode.",
    "Log the status and durationMs after every call to another API.",
    "When an order cannot ship, log ERROR with next= to say where it is now.",
  ],
}
