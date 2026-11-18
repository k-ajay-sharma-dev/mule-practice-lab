import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-156',
  category: 'logging',
  title: "Uploading Photos to Blob Storage",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","azure-blob","upload","sas"],
  estMinutes: 25,
  quiz: fromLogging(["log-12026","log-12027","log-12028","log-12029","log-12030"]),
  description: `
Kestrel Logistics uploads each proof of delivery photo to blob storage. Log the uploads without leaking access to the files.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the container, blob name, size and business ID.",
    "Never log the signed URL, the SAS token or the account key.",
    "Log a failed upload with the error and what happens next.",
  ],
}
