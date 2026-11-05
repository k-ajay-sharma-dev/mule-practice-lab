import { useMemo, useRef } from 'react'
import { tokenize } from '../editor/highlight.js'

// Characters DataWeave needs that a phone keyboard hides behind extra screens.
// `back` leaves the cursor inside a pair.
const KEYS = [
  { label: 'Tab', text: '  ' },
  { label: '->', text: ' -> ' },
  { label: '$', text: '$' },
  { label: '" "', text: '""', back: 1 },
  { label: '{ }', text: '{}', back: 1 },
  { label: '[ ]', text: '[]', back: 1 },
  { label: '( )', text: '()', back: 1 },
  { label: ':', text: ': ' },
  { label: ',', text: ', ' },
  { label: '.', text: '.' },
  { label: '++', text: ' ++ ' },
  { label: '~=', text: ' ~= ' },
  { label: '---', text: '---\n' },
]

// Monaco is a desktop editor: phones only open their keyboard reliably for a real text field, so this is one.
// The text field is transparent, with a coloured copy of the same text behind it.
export default function TouchEditor({ value, onChange, language, readOnly, height }) {
  const field = useRef(null)
  const layer = useRef(null)
  const tokens = useMemo(() => tokenize(value ?? '', language), [value, language])

  function syncScroll() {
    layer.current.scrollTop = field.current.scrollTop
    layer.current.scrollLeft = field.current.scrollLeft
  }

  function insert({ text, back = 0 }) {
    const input = field.current
    input.focus()
    const { selectionStart: start, selectionEnd: end } = input
    const caret = start + text.length - back
    // execCommand keeps the phone's undo history; setting the value directly would clear it
    if (document.execCommand?.('insertText', false, text)) {
      input.setSelectionRange(caret, caret)
      return
    }
    onChange?.(input.value.slice(0, start) + text + input.value.slice(end))
    requestAnimationFrame(() => input.setSelectionRange(caret, caret))
  }

  return (
    <div className="touch-editor" style={{ height }}>
      {/* a read-only panel opens no keyboard, so say why before a tap looks broken */}
      {readOnly && <div className="touch-editor-note">Read only</div>}
      {!readOnly && (
        <div className="touch-editor-keys" role="toolbar" aria-label="Insert symbols">
          {KEYS.map((key) => (
            <button
              key={key.label}
              type="button"
              className="touch-editor-key mono"
              // pressing a key must not take focus from the text field, or the keyboard would close
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => insert(key)}
            >
              {key.label}
            </button>
          ))}
        </div>
      )}
      <div className="touch-editor-area">
        <pre ref={layer} className="touch-editor-layer" aria-hidden="true">
          {tokens.map((t, i) => (t.kind === 'plain' ? t.text : <span key={i} className={`tok-${t.kind}`}>{t.text}</span>))}
          {'\n'}
        </pre>
        <textarea
          ref={field}
          className="touch-editor-input"
          value={value ?? ''}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          onScroll={syncScroll}
          aria-label={readOnly ? 'Output' : 'Code editor'}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          wrap="soft"
        />
      </div>
    </div>
  )
}
