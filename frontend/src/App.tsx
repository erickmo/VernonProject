import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import { useBoot } from './hooks/useData'
import { ApiError } from './lib/api'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import Today from './pages/Today'
import Reports from './pages/Reports'
import ReportPage from './pages/ReportPage'
import Review from './pages/Review'
import Projects from './pages/Projects'
import ProjectDetailPage from './pages/ProjectDetailPage'
import WorkItemPage from './pages/WorkItemPage'
import TodoPage from './pages/TodoPage'
import Profile from './pages/Profile'
import Onboarding from './pages/Onboarding'

const ONBOARDED_KEY = 'vernon-onboarded-v1'

function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-brand-600 to-brand-800 text-white">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15">
        <FolderKanban className="h-10 w-10" />
      </div>
      <Spinner className="h-6 w-6 text-white/80" />
    </div>
  )
}

export default function App() {
  const { data: boot, isLoading, error } = useBoot()
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (boot && !localStorage.getItem(ONBOARDED_KEY)) setShowOnboarding(true)
  }, [boot])

  const finishOnboarding = () => {
    localStorage.setItem(ONBOARDED_KEY, '1')
    setShowOnboarding(false)
  }

  if (isLoading && !boot) return <Splash />

  // Auth failure (Guest / expired session) -> in-app login (no desk page).
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return <Login />
  }
  if (!boot && error) return <Login />

  return (
    <>
      {showOnboarding && <Onboarding onDone={finishOnboarding} />}
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/review" element={<Review />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/report/:name" element={<ReportPage />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/project/:name" element={<ProjectDetailPage />} />
        <Route path="/work-item/:name" element={<WorkItemPage />} />
        <Route path="/todo/:name" element={<TodoPage />} />
        <Route path="/me" element={<Profile onReplayOnboarding={() => setShowOnboarding(true)} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
