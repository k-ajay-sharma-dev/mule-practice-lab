import { useEffect, useState } from 'react'
import { runnerMaySleep } from '../runner/client.js'

// "Running…" that explains itself when a hosted runner is slow because it is waking from sleep.
export default function RunningMessage({ children = 'Running…' }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 5000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="io-message muted">
      {children}
      {slow && runnerMaySleep() && (
        <div className="small">The runner is probably waking up from sleep (free host) — this takes about a minute, then runs are quick.</div>
      )}
    </div>
  )
}
