import { useEffect, useState } from 'react'

// Milliseconds left in a timed session. Measured against the start time, so a sleeping tab cannot stretch it.
export default function useRemaining(session) {
  const end = new Date(session.startedIso).getTime() + session.minutes * 60000
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return Math.max(0, end - now)
}
