import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="empty-state">
      <h2>Nothing here</h2>
      <p>That page or problem doesn’t exist.</p>
      <Link to="/" className="btn">
        Back to problems
      </Link>
    </div>
  )
}
