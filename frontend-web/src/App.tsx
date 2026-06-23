import { Routes, Route, Navigate } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import { useBoot } from '@/hooks/useData'
import { ApiError } from '@/lib/api'
import Login from '@web/pages/Login'
import { AppShell } from '@web/components/AppShell'
import Today from '@web/pages/Today'
import Projects from '@web/pages/Projects'
import Project from '@web/pages/Project'
import ProjectItem from '@web/pages/ProjectItem'
import ProjectDetail from '@web/pages/ProjectDetail'
import Review from '@web/pages/Review'
import Me from '@web/pages/Me'

function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 text-white">
      <FolderKanban className="w-12 h-12 animate-pulse" />
    </div>
  )
}

export default function App() {
  const boot = useBoot()

  if (boot.isLoading) return <Splash />

  const err = boot.error
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    return <Login />
  }
  if (!boot.data && err) return <Login />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Today />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/project/:name" element={<Project />}>
          <Route path="item/:itemName" element={<ProjectItem />} />
        </Route>
        <Route path="/project-item/:name" element={<ProjectItem />} />
        <Route path="/project-detail/:name" element={<ProjectDetail />} />
        <Route path="/review" element={<Review />} />
        <Route path="/me" element={<Me />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
