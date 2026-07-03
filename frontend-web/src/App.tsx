import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { FolderKanban, AlertTriangle, RotateCw } from 'lucide-react'
import {
  useBoot,
  canManageGroups,
  canManageBrands,
  canManageUsers,
  canManageBadges,
  canManageMarketplace,
  canGrantPoints,
  canManageAttendance,
} from '@/hooks/useData'
import { ApiError } from '@/lib/api'
import Login from '@web/pages/Login'
import { AppShell } from '@web/components/AppShell'
import Home from '@web/pages/Home'
import Calendar from '@web/pages/Calendar'
import ProjectsWorkspace, { ProjectsIndexPrompt } from '@web/pages/ProjectsWorkspace'
import Project, { ProjectIndexPane } from '@web/pages/Project'
import ProjectDetailPane from '@web/pages/ProjectDetailPane'
import ProjectItem from '@web/pages/ProjectItem'
import ProjectDetail from '@web/pages/ProjectDetail'
import Review from '@web/pages/Review'
import Me from '@web/pages/Me'
import Reports from '@web/pages/Reports'
import DataHealth from '@web/pages/DataHealth'
import ReportPage from '@web/pages/ReportPage'
import Leaderboard from '@web/pages/Leaderboard'
import TeamWall from '@web/pages/TeamWall'
import Marketplace from '@web/pages/Marketplace'
import WalletLog from '@web/pages/WalletLog'
import GiftPoints from '@web/pages/GiftPoints'
import Users from '@web/pages/Users'
import UserForm from '@web/pages/UserForm'
import Groups from '@web/pages/Groups'
import GroupForm from '@web/pages/GroupForm'
import Brands from '@web/pages/Brands'
import BrandForm from '@web/pages/BrandForm'
import Notes from '@web/pages/Notes'
import NoteForm from '@web/pages/NoteForm'
import Feedback from '@web/pages/Feedback'
import Help from '@web/pages/Help'
import FeedbackInbox from '@web/pages/FeedbackInbox'
import GamificationSettings from '@web/pages/GamificationSettings'
import Settings from '@web/pages/Settings'
import MarketplaceAdmin from '@web/pages/MarketplaceAdmin'
import RewardForm from '@web/pages/RewardForm'
import GrantPoints from '@web/pages/GrantPoints'
import Onboarding from '@web/pages/Onboarding'
import { Meetings } from './pages/Meetings'
import AvatarCustomizer from '@web/pages/AvatarCustomizer'
import AttendanceReport from '@web/pages/AttendanceReport'
import Stations from '@web/pages/Stations'
import Schedules from '@web/pages/Schedules'
import Exceptions from '@web/pages/Exceptions'
import HolidayLists from '@web/pages/HolidayLists'
import AttendanceProfiles from '@web/pages/AttendanceProfiles'
import Kiosk from '@web/pages/Kiosk'
import Achievements from '@web/pages/Achievements'
import Events from '@web/pages/Events'
import EventDetail from '@web/pages/EventDetail'
import { CrumbProvider } from '@web/lib/crumbs'

const ONBOARDED_KEY = 'vernon-onboarded-v1'

function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 text-white">
      <FolderKanban className="w-12 h-12 animate-pulse" />
    </div>
  )
}

function BootError() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6 text-center">
      <AlertTriangle className="w-12 h-12 text-amber-500" />
      <h1 className="text-xl font-semibold">Couldn’t load Vernon</h1>
      <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
        Something went wrong reaching the server. Check your connection and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-2 inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700"
      >
        <RotateCw className="w-4 h-4" /> Reload
      </button>
    </div>
  )
}

export default function App() {
  const boot = useBoot()
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (boot.data && !localStorage.getItem(ONBOARDED_KEY)) setShowOnboarding(true)
  }, [boot.data])

  const finishOnboarding = () => {
    localStorage.setItem(ONBOARDED_KEY, '1')
    setShowOnboarding(false)
  }

  // Kiosk runs on unattended (often logged-out) station screens; it only needs
  // the allow_guest station_token endpoint, so render it before the login wall.
  if (window.location.pathname.includes('/kiosk/')) {
    return (
      <Routes>
        <Route path="/kiosk/:station" element={<Kiosk />} />
      </Routes>
    )
  }

  if (boot.isLoading) return <Splash />

  const err = boot.error
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    return <Login />
  }
  // Genuine auth failure with no data -> login; any other boot failure (500,
  // network) is an outage, not a missing session -> show a retry screen.
  if (!boot.data && err) {
    return err instanceof ApiError ? <Login /> : <BootError />
  }

  const b = boot.data

  return (
    <CrumbProvider>
      {showOnboarding && <Onboarding onDone={finishOnboarding} />}
      <Routes>
        <Route path="/kiosk/:station" element={<Kiosk />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/calendar" element={<Calendar />} />
          {/* Projects workspace: persistent rail (left) + selected project (right) */}
          <Route element={<ProjectsWorkspace />}>
            <Route path="/projects" element={<ProjectsIndexPrompt />} />
            <Route path="/project/:name" element={<Project />}>
              <Route index element={<ProjectIndexPane />} />
              <Route path="detail/:detailName" element={<ProjectDetailPane />}>
                <Route path="item/:itemName" element={<ProjectItem />} />
              </Route>
            </Route>
          </Route>
          {/* Standalone deep-link targets (notifications, reports, command palette) */}
          <Route path="/project-item/:name" element={<ProjectItem />} />
          <Route path="/project-detail/:name" element={<ProjectDetail />}>
            <Route path="item/:itemName" element={<ProjectItem />} />
          </Route>
          <Route path="/review" element={<Review />} />
          <Route path="/meetings" element={<Meetings />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/notes/new" element={<NoteForm />} />
          <Route path="/notes/:name" element={<NoteForm />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/help" element={<Help />} />
          {/* Rewards / reports (all users) */}
          <Route path="/reports" element={<Reports />} />
          <Route path="/report/:name" element={<ReportPage />} />
          {canManageGroups(b) && (
            <Route path="/data-health" element={<DataHealth />} />
          )}
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/team-wall" element={<TeamWall />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/wallet" element={<WalletLog />} />
          <Route path="/gift-points" element={<GiftPoints />} />
          {/* Admin (gated) */}
          {canManageUsers(b) && (
            <>
              <Route path="/users" element={<Users />} />
              <Route path="/users/new" element={<UserForm />} />
              <Route path="/users/:name" element={<UserForm />} />
              <Route path="/feedback-inbox" element={<FeedbackInbox />} />
            </>
          )}
          {canManageGroups(b) && (
            <>
              <Route path="/groups" element={<Groups />} />
              <Route path="/groups/new" element={<GroupForm />} />
              <Route path="/groups/:name" element={<GroupForm />} />
            </>
          )}
          {canManageBrands(b) && (
            <>
              <Route path="/brands" element={<Brands />} />
              <Route path="/brands/new" element={<BrandForm />} />
              <Route path="/brands/:name" element={<BrandForm />} />
            </>
          )}
          {canManageBadges(b) && (
            <Route path="/gamification-settings" element={<GamificationSettings />} />
          )}
          {canManageGroups(b) && (
            <Route path="/settings" element={<Settings />} />
          )}
          {canManageMarketplace(b) && (
            <>
              <Route path="/marketplace-admin" element={<MarketplaceAdmin />} />
              <Route path="/marketplace-admin/reward/new" element={<RewardForm />} />
              <Route path="/marketplace-admin/reward/:name" element={<RewardForm />} />
            </>
          )}
          {canGrantPoints(b) && (
            <Route path="/grant-points" element={<GrantPoints />} />
          )}
          {canManageAttendance(b) && (
            <>
              <Route path="/attendance-report" element={<AttendanceReport />} />
              <Route path="/attendance/stations" element={<Stations />} />
              <Route path="/attendance/schedules" element={<Schedules />} />
              <Route path="/attendance/exceptions" element={<Exceptions />} />
              <Route path="/attendance/holidays" element={<HolidayLists />} />
              <Route path="/attendance/profiles" element={<AttendanceProfiles />} />
            </>
          )}
          <Route path="/events" element={<Events />} />
          <Route path="/events/:name" element={<EventDetail />} />
          <Route path="/me" element={<Me onReplayOnboarding={() => setShowOnboarding(true)} />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/avatar" element={<AvatarCustomizer />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </CrumbProvider>
  )
}
