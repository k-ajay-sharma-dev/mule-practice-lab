import { useEffect, useRef, useState } from 'react'
import { speechProblem } from '../study/answer-check.js'

const engine = () => window.SpeechRecognition ?? window.webkitSpeechRecognition

export const canListen = () => typeof window !== 'undefined' && Boolean(engine())

// Turns speech into text, one answer per question id.
export default function useSpeechText() {
  const [texts, setTexts] = useState({}) // question id -> what was heard
  const [problem, setProblem] = useState(null)
  const session = useRef(null)
  const settled = useRef({}) // question id -> text the engine won't change any more

  function start(id) {
    if (session.current || problem) return
    const Engine = engine()
    const listener = new Engine()
    listener.continuous = true
    listener.interimResults = true
    listener.lang = navigator.language?.startsWith('en') ? navigator.language : 'en-US'
    session.current = listener

    listener.onresult = (event) => {
      let draft = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const said = event.results[i][0].transcript
        if (event.results[i].isFinal) settled.current[id] = `${settled.current[id] ?? ''} ${said}`.trim()
        else draft += said
      }
      setTexts((t) => ({ ...t, [id]: `${settled.current[id] ?? ''} ${draft}`.trim() }))
    }
    listener.onerror = (event) => {
      const message = speechProblem(event.error)
      if (!message) return
      setProblem(message)
      session.current = null
    }
    // browsers stop listening after a pause, and an answer can have pauses in it
    listener.onend = () => {
      if (session.current !== listener) return
      try {
        listener.start()
      } catch {
        session.current = null
      }
    }
    listener.start()
  }

  function stop() {
    const listener = session.current
    session.current = null
    listener?.stop()
  }

  function edit(id, text) {
    settled.current[id] = text
    setTexts((t) => ({ ...t, [id]: text }))
  }

  function clear() {
    stop()
    settled.current = {}
    setTexts({})
    setProblem(null)
  }

  useEffect(
    () => () => {
      const listener = session.current
      session.current = null
      listener?.abort()
    },
    [],
  )

  return { start, stop, edit, clear, texts, problem }
}
