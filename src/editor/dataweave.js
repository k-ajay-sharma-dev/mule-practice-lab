// Minimal DataWeave 2.0 syntax highlighting for Monaco (no IntelliSense).
export const KEYWORDS = [
  'fun', 'var', 'type', 'ns', 'import', 'from', 'as', 'is', 'if', 'else', 'unless', 'otherwise',
  'match', 'case', 'do', 'using', 'update', 'at', 'and', 'or', 'not', 'default', 'input', 'output',
  'null', 'true', 'false',
]

export const BUILTINS = [
  'map', 'mapObject', 'filter', 'filterObject', 'reduce', 'pluck', 'groupBy', 'orderBy', 'distinctBy',
  'flatten', 'flatMap', 'sizeOf', 'isEmpty', 'isBlank', 'contains', 'splitBy', 'joinBy', 'upper', 'lower',
  'trim', 'capitalize', 'now', 'log', 'sum', 'avg', 'max', 'min', 'maxBy', 'minBy', 'keysOf', 'valuesOf',
  'entriesOf', 'namesOf', 'read', 'write', 'zip', 'unzip', 'replace', 'with', 'startsWith', 'endsWith',
  'indexOf', 'find', 'scan', 'matches', 'abs', 'ceil', 'floor', 'round', 'sqrt', 'random', 'uuid',
  'typeOf', 'then', 'to',
]

let registered = false

export function registerDataWeave(monaco) {
  if (registered) return
  registered = true

  // Black editor background to match the app's dark theme.
  monaco.editor.defineTheme('pl-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0a0a0a',
      'editor.lineHighlightBackground': '#141414',
      'editorGutter.background': '#0a0a0a',
    },
  })

  monaco.languages.register({ id: 'dataweave' })

  monaco.languages.setLanguageConfiguration('dataweave', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  })

  monaco.languages.setMonarchTokensProvider('dataweave', {
    keywords: KEYWORDS,
    builtins: BUILTINS,
    tokenizer: {
      root: [
        [/%dw\s*[\d.]+/, 'keyword'],
        [/---/, 'keyword'],
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],
        [/`([^`\\]|\\.)*`/, 'string'],
        [/\|[^|\n]+\|/, 'number'],
        [/\d+(\.\d+)?/, 'number'],
        [/\$+[a-zA-Z_]*/, 'variable'],
        [/@[a-zA-Z_]*/, 'annotation'],
        [/[a-zA-Z_][\w]*/, { cases: { '@keywords': 'keyword', '@builtins': 'type.identifier', '@default': 'identifier' } }],
        [/->|\+\+|--|~=|==|!=|>=|<=|[=<>+\-*/!]/, 'operator'],
      ],
      comment: [
        [/[^*/]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[*/]/, 'comment'],
      ],
    },
  })
}
