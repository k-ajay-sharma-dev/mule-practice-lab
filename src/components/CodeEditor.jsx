import { useRef } from 'react'
import Editor from '@monaco-editor/react'
import { useTheme } from '../theme.jsx'
import { registerDataWeave } from '../editor/dataweave.js'

export default function CodeEditor({ value, onChange, onRun, language = 'dataweave', readOnly = false, height = '100%' }) {
  const { theme } = useTheme()
  // Keep the latest onRun so the Ctrl+Enter command never calls a stale closure.
  const runRef = useRef(onRun)
  runRef.current = onRun

  function handleMount(editor, monaco) {
    if (onRun) editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.())
  }

  return (
    <Editor
      height={height}
      language={language}
      value={value}
      onChange={(v) => onChange?.(v ?? '')}
      beforeMount={registerDataWeave}
      onMount={handleMount}
      theme={theme === 'dark' ? 'pl-dark' : 'vs'}
      loading={<div className="editor-loading">Loading editor…</div>}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontFamily: "'JetBrains Mono', Consolas, monospace",
        fontSize: 14,
        lineNumbersMinChars: 3,
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        tabSize: 2,
        automaticLayout: true,
        padding: { top: 10 },
      }}
    />
  )
}
