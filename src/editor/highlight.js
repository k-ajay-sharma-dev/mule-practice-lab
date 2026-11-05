// Small tokenizer for the touch editor, which has no Monaco. The tokens always join back into the exact text,
// because the coloured layer sits under a transparent text field and must line up with it character for character.
import { BUILTINS, KEYWORDS } from './dataweave.js'

const keywords = new Set(KEYWORDS)
const builtins = new Set(BUILTINS)

const STRINGS = String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|` + '`(?:[^`\\\\\\n]|\\\\.)*`'

const RULES = {
  dataweave: {
    pattern: new RegExp(
      String.raw`(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|(${STRINGS})|(%dw\s*[\d.]+|---)|(\|[^|\n]+\||\b\d+(?:\.\d+)?\b)|(\$+[a-zA-Z_]*|@[a-zA-Z_]*)|([a-zA-Z_]\w*)`,
      'g',
    ),
    kinds: ['comment', 'string', 'keyword', 'number', 'variable', 'word'],
  },
  json: {
    pattern: /("(?:[^"\\\n]|\\.)*"(?=\s*:))|("(?:[^"\\\n]|\\.)*")|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b(?:true|false|null)\b)/g,
    kinds: ['variable', 'string', 'number', 'keyword'],
  },
  xml: {
    pattern: /(<!--[\s\S]*?(?:-->|$))|("[^"\n]*"|'[^'\n]*')|(<\/?[\w:.-]+|\/?>|<\?[\w:.-]+|\?>)/g,
    kinds: ['comment', 'string', 'keyword'],
  },
}

export function tokenize(code, language) {
  const rule = RULES[language]
  if (!rule) return [{ text: code, kind: 'plain' }]
  const tokens = []
  let at = 0
  for (const match of code.matchAll(rule.pattern)) {
    if (match[0] === '') continue
    if (match.index > at) tokens.push({ text: code.slice(at, match.index), kind: 'plain' })
    const group = match.slice(1).findIndex((g) => g !== undefined)
    let kind = rule.kinds[group]
    if (kind === 'word') kind = keywords.has(match[0]) ? 'keyword' : builtins.has(match[0]) ? 'builtin' : 'plain'
    tokens.push({ text: match[0], kind })
    at = match.index + match[0].length
  }
  if (at < code.length) tokens.push({ text: code.slice(at), kind: 'plain' })
  return tokens
}
