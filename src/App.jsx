import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Layout from './components/Layout.jsx'
import CategoryPage from './pages/CategoryPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import NotFound from './pages/NotFound.jsx'

// Pages other than the dashboard and lists are split into their own chunks and load on first visit.
const ProblemPage = lazy(() => import('./pages/ProblemPage.jsx'))
const PlaygroundPage = lazy(() => import('./pages/PlaygroundPage.jsx'))
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'))
const SearchPage = lazy(() => import('./pages/SearchPage.jsx'))
const TracksPage = lazy(() => import('./pages/TracksPage.jsx'))
const ReviewPage = lazy(() => import('./pages/ReviewPage.jsx'))
const FlashcardsPage = lazy(() => import('./pages/FlashcardsPage.jsx'))
const MockInterviewPage = lazy(() => import('./pages/MockInterviewPage.jsx'))
const ExamPage = lazy(() => import('./pages/ExamPage.jsx'))
const InterviewPage = lazy(() => import('./pages/InterviewPage.jsx'))
const WeakAreasPage = lazy(() => import('./pages/WeakAreasPage.jsx'))
const ReadinessPage = lazy(() => import('./pages/ReadinessPage.jsx'))
const CheatSheetsPage = lazy(() => import('./pages/CheatSheetsPage.jsx'))
const PlatformLabPage = lazy(() => import('./pages/PlatformLabPage.jsx'))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage.jsx'))
const CalmPage = lazy(() => import('./pages/CalmPage.jsx'))

// A crash on one page shouldn't follow you to the next, so the boundary resets on navigation.
function PageBoundary({ children }) {
  const { pathname } = useLocation()
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
}

// HashRouter keeps deep links working on GitHub Pages, which has no SPA rewrites.
export default function App() {
  return (
    <HashRouter>
      {/* last line of defence: if the header itself fails, still show a reload screen, never a blank page */}
      <ErrorBoundary>
      <Layout>
        <PageBoundary>
          <Suspense fallback={<div className="workspace-loading muted small">Loading…</div>}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/playground" element={<PlaygroundPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/tracks" element={<TracksPage />} />
              <Route path="/tracks/:slug" element={<TracksPage />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/flashcards" element={<FlashcardsPage />} />
              <Route path="/mock" element={<MockInterviewPage />} />
              <Route path="/exam" element={<ExamPage />} />
              <Route path="/interview" element={<InterviewPage />} />
              <Route path="/weak-areas" element={<WeakAreasPage />} />
              <Route path="/readiness" element={<ReadinessPage />} />
              <Route path="/cheatsheets" element={<CheatSheetsPage />} />
              <Route path="/cheatsheets/:slug" element={<CheatSheetsPage />} />
              <Route path="/platform-lab" element={<PlatformLabPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:projectId" element={<ProjectsPage />} />
              <Route path="/calm" element={<CalmPage />} />
              <Route path="/:category" element={<CategoryPage />} />
              <Route path="/:category/:problemId" element={<ProblemPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </PageBoundary>
      </Layout>
      </ErrorBoundary>
    </HashRouter>
  )
}
