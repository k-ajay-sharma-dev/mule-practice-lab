import { Component } from 'react'

// Catches a render error in one page so the header and tabs keep working instead of a blank screen.
// A failed chunk import usually means a new deploy replaced the old files: reloading fetches the new ones.
const isChunkError = (error) =>
  /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically/i.test(
    String(error?.message ?? error),
  )

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error(error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const chunk = isChunkError(error)
    return (
      <div className="empty-state">
        <h2>{chunk ? 'A newer version is available' : 'Something went wrong on this page'}</h2>
        <p>
          {chunk
            ? 'The site was updated while this tab was open. Reload to get the latest version — your progress is kept.'
            : 'Your progress is safe in this browser. Reload the page, or go back to the Learning Path.'}
        </p>
        {!chunk && <pre className="error-detail">{String(error?.message ?? error)}</pre>}
        <div className="hero-actions" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
          <a className="btn btn-ghost" href="#/" onClick={() => this.setState({ error: null })}>
            Learning Path
          </a>
        </div>
      </div>
    )
  }
}
