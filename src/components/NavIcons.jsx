// Line icons for the sidebar (24×24, stroke = currentColor), one per destination.
const PATHS = {
  path: <path d="M4 19h4l3-7 3 4 2-3 4 6M4 5h16" />,
  tracks: (
    <>
      <path d="M4 6h10M4 12h16M4 18h7" />
      <circle cx="17" cy="6" r="2" />
      <circle cx="14" cy="18" r="2" />
    </>
  ),
  review: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.7L20 8" />
      <path d="M20 4v4h-4M12 8v4l3 2" />
    </>
  ),
  flashcards: (
    <>
      <rect x="3" y="7" width="14" height="12" rx="2" />
      <path d="M7 4h12a2 2 0 0 1 2 2v10" />
    </>
  ),
  mock: (
    <>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 10v3l2 2M10 3h4M12 3v3" />
    </>
  ),
  readiness: (
    <>
      <path d="M4 20h16M7 20v-6M12 20V9M17 20V4" />
    </>
  ),
  exam: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16l1.5 1.5L14 14" />
    </>
  ),
  interview: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
    </>
  ),
  weak: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  lab: (
    <>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
      <path d="M7.5 15h9" />
    </>
  ),
  cheatsheets: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 12h7M9 16h7" />
    </>
  ),
  dataweave: <path d="M8 6l-5 6 5 6M16 6l5 6-5 6M14 4l-4 16" />,
  mulesoft: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </>
  ),
  flows: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="15" width="6" height="6" rx="1" />
      <path d="M9 6h4a2 2 0 0 1 2 2v7" />
    </>
  ),
  architecture: <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />,
  'use-cases': (
    <>
      <path d="M4 7h16v12H4zM9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M4 12h16" />
    </>
  ),
  'case-studies': <path d="M4 21V5l8-2v18M12 7l8 3v11M8 8v.01M8 12v.01M8 16v.01M16 13v.01M16 17v.01M2 21h20" />,
  incidents: <path d="M12 3l10 18H2L12 3zM12 10v5M12 18v.01" />,
  playground: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3M13 15h4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
  collapse: <path d="M15 6l-6 6 6 6" />,
  expand: <path d="M9 6l6 6-6 6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
}

export default function NavIcon({ name, size = 18 }) {
  return (
    <svg
      className="nav-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.path}
    </svg>
  )
}
