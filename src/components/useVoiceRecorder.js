import { useEffect, useRef, useState } from 'react'
import { AUDIO_BITS, micProblem, pickFormat } from '../study/recording.js'

export const canRecord =
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined'

// Records one clip per question into this page's memory. Keeping a clip is up to the page using this.
export default function useVoiceRecorder() {
  const [recording, setRecording] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [problem, setProblem] = useState(null)
  const [clips, setClips] = useState({}) // question id -> { url, seconds, type }
  const stream = useRef(null)
  const recorder = useRef(null)
  const urls = useRef([])
  const generation = useRef(0) // a clip finishing after discard() belongs to a round that has gone

  async function open() {
    setProblem(null)
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      setMicOn(true)
      return true
    } catch (error) {
      setProblem(micProblem(error?.name))
      return false
    }
  }

  function begin(id) {
    if (!stream.current || recorder.current) return
    const format = pickFormat((t) => MediaRecorder.isTypeSupported(t))
    const rec = new MediaRecorder(stream.current, { audioBitsPerSecond: AUDIO_BITS, ...(format && { mimeType: format }) })
    const chunks = []
    const started = Date.now()
    const round = generation.current
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      if (round !== generation.current || !chunks.length) return
      const type = rec.mimeType || format
      const blob = new Blob(chunks, { type })
      const url = URL.createObjectURL(blob)
      urls.current.push(url)
      setClips((c) => ({ ...c, [id]: { url, blob, seconds: (Date.now() - started) / 1000, type } }))
    }
    rec.start()
    recorder.current = rec
    setRecording(true)
  }

  function finish() {
    const rec = recorder.current
    recorder.current = null
    if (rec?.state === 'recording') rec.stop()
    setRecording(false)
  }

  // Turns the microphone off, which also clears the browser's "in use" indicator. Clips stay for listening back.
  function close() {
    finish()
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    setMicOn(false)
  }

  function discard() {
    generation.current++
    urls.current.forEach(URL.revokeObjectURL)
    urls.current = []
    setClips({})
  }

  useEffect(
    () => () => {
      generation.current++
      recorder.current?.state === 'recording' && recorder.current.stop()
      stream.current?.getTracks().forEach((t) => t.stop())
      urls.current.forEach(URL.revokeObjectURL)
    },
    [],
  )

  return { open, begin, finish, close, discard, recording, micOn, problem, clips, stream }
}
