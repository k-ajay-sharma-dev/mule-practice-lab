// "What does this script output?" questions for DataWeave quizzes. Each keeps the script it shows in `run`, so
// scripts/check-content.js can run it on the real engine and prove the answer. Options are shuffled when displayed,
// so the right one always goes first here.

export const FAILS = 'The script fails with an error'

const JSON_INPUT = 'application/json'

export function outputQuestion({ payload, inputMime = JSON_INPUT, head = '', output = 'application/json', body, right, wrong, error, explain }) {
  const script = ['%dw 2.0', head, `output ${output}`, '---', body].filter(Boolean).join('\n')
  const language = inputMime === JSON_INPUT ? 'json' : 'xml'
  const input = payload ? `**Input payload**\n\n\`\`\`${language}\n${payload}\n\`\`\`\n\n` : ''
  return {
    type: 'single',
    code: true,
    prompt: `${input}**Script**\n\n\`\`\`dataweave\n${script}\n\`\`\`\n\nWhat does this script output?`,
    options: [right, ...wrong],
    answer: 0,
    explain,
    run: { script, error, inputs: payload ? [{ name: 'payload', mime: inputMime, content: payload }] : [] },
  }
}
