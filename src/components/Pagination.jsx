export const PAGE_SIZES = [10, 20, 50]

// Slice `items` for a 1-based page, clamping the page into range.
export function paginate(items, page, size) {
  const pageCount = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount)
  const start = (current - 1) * size
  return { page: current, pageCount, start, items: items.slice(start, start + size) }
}

// Page numbers to show: first, last, and a window around the current page, with gaps as '…'.
function pageList(page, pageCount) {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount))
  const sorted = [...pages].sort((a, b) => a - b)
  const out = []
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push(p - sorted[i - 1] === 2 ? p - 1 : `gap-${p}`)
    out.push(p)
  })
  return out
}

export default function Pagination({ page, pageCount, total, start, shown, onPage, size, onSize, compact }) {
  if (!total) return null
  return (
    <nav className={`pagination${compact ? ' compact' : ''}`} aria-label="Pagination">
      <span className="pagination-info muted small">
        {start + 1}–{start + shown} of {total}
      </span>
      {pageCount > 1 && (
        <div className="pagination-pages">
          <button className="page-btn" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            ‹
          </button>
          {pageList(page, pageCount).map((p) =>
            typeof p === 'string' ? (
              <span key={p} className="page-gap muted">
                …
              </span>
            ) : (
              <button
                key={p}
                className={`page-btn${p === page ? ' active' : ''}`}
                onClick={() => onPage(p)}
                aria-current={p === page ? 'page' : undefined}
              >
                {p}
              </button>
            ),
          )}
          <button className="page-btn" onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">
            ›
          </button>
        </div>
      )}
      {onSize && (
        <label className="pagination-size muted small">
          Per page
          <select className="input" value={size} onChange={(e) => onSize(Number(e.target.value))}>
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
    </nav>
  )
}
