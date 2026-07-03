import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import { useBoot } from './hooks/useData'
import { ApiError } from './lib/api'
import { Spinner } from './components/ui'
import { useConfirm } from './components/Confirm'
import { pushSupported, subscribeToPush } from './lib/push'
import Login from './pages/Login'
import Today from './pages/Today'
import Calendar from './pages/Calendar'
import Reports from './pages/Reports'
import ReportPage from './pages/ReportPage'
import Review from './pages/Review'
import Projects from './pages/Projects'
import ProjectScreen from './pages/ProjectScreen'
import ProjectDetailScreen from './pages/ProjectDetailScreen'
import ProjectItemScreen from './pages/ProjectItemScreen'
import Profile from './pages/Profile'
import Onboarding from './pages/Onboarding'
import GroupsScreen from './pages/GroupsScreen'
import DataHealthScreen from './pages/DataHealthScreen'
import GroupFormScreen from './pages/GroupFormScreen'
import BrandsScreen from './pages/BrandsScreen'
import BrandFormScreen from './pages/BrandFormScreen'
import CompaniesScreen from './pages/CompaniesScreen'
import CompanyFormScreen from './pages/CompanyFormScreen'
import UsersScreen from './pages/UsersScreen'
import UserFormScreen from './pages/UserFormScreen'
import WalletLogScreen from './pages/WalletLogScreen'
import LeaderboardScreen from './pages/LeaderboardScreen'
import TeamWallScreen from './pages/TeamWallScreen'
import MarketplaceScreen from './pages/MarketplaceScreen'
import RewardFormScreen from './pages/RewardFormScreen'
import MarketplaceAdminScreen from './pages/MarketplaceAdminScreen'
import GrantPointsScreen from './pages/GrantPointsScreen'
import GiftPointsScreen from './pages/GiftPointsScreen'
import GamificationSettingsScreen from './pages/GamificationSettingsScreen'
import SettingsScreen from './pages/SettingsScreen'
import NotesScreen from './pages/NotesScreen'
import NoteFormScreen from './pages/NoteFormScreen'
import FeedbackScreen from './pages/FeedbackScreen'
import HelpScreen from './pages/HelpScreen'
import { MeetingsScreen } from './pages/MeetingsScreen'
import ActivityScreen from './pages/ActivityScreen'
import NotificationsScreen from './pages/NotificationsScreen'
import AvatarCustomizerScreen from './pages/AvatarCustomizerScreen'
import Scan from './pages/Scan'
import MyAttendance from './pages/MyAttendance'
import RequestException from './pages/RequestException'
import AttendanceAdminScreen from './pages/AttendanceAdminScreen'
import AttendanceProfilesScreen from './pages/AttendanceProfilesScreen'
import AttendanceSchedulesScreen from './pages/AttendanceSchedulesScreen'
import AttendanceStationsScreen from './pages/AttendanceStationsScreen'
import AttendanceExceptionsScreen from './pages/AttendanceExceptionsScreen'
import AttendanceHolidaysScreen from './pages/AttendanceHolidaysScreen'
import AttendanceReportAdminScreen from './pages/AttendanceReportAdminScreen'
import UnderOccupiedScreen from './pages/UnderOccupiedScreen'
import AchievementsScreen from './pages/AchievementsScreen'
import EventsScreen from './pages/EventsScreen'
import EventDetailScreen from './pages/EventDetailScreen'
import { canManageGroups, canManageBrands, canManageUsers, canManageMarketplace, canGrantPoints, canManageBadges, canManageAttendance } from './hooks/useData'

const ONBOARDED_KEY = 'vernon-onboarded-v1'
const PUSH_ASKED_KEY = 'vernon-push-asked-v1'

function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-brand-600 border border-brand-700/50 text-white">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15">
        <FolderKanban className="h-10 w-10" />
      </div>
      <Spinner className="h-6 w-6 text-white/80" />
    </div>
  )
}

function LegacyRedirect({ to }: { to: string }) {
  const { name } = useParams()
  return <Navigate to={`/${to}/${name}`} replace />
}

export default function App() {
  const { data: boot, isLoading, error } = useBoot()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const confirm = useConfirm()

  useEffect(() => {
    if (boot && !localStorage.getItem(ONBOARDED_KEY)) setShowOnboarding(true)
  }, [boot])

  useEffect(() => {
    if (!boot || !boot.vapid_public_key) return
    if (!pushSupported() || Notification.permission !== 'default') return
    if (localStorage.getItem(PUSH_ASKED_KEY)) return
    localStorage.setItem(PUSH_ASKED_KEY, '1')
    ;(async () => {
      const ok = await confirm({
        title: 'Enable notifications?',
        message:
          'Get notified about task assignments, approvals, comments, and points — even when the app is closed.',
        confirmLabel: 'Enable',
        cancelLabel: 'Not now',
      })
      if (ok) {
        try {
          await subscribeToPush(boot.vapid_public_key!)
        } catch {
          /* user can retry from Profile */
        }
      }
    })()
  }, [boot, confirm])

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
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/review" element={<Review />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/report/:name" element={<ReportPage />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/project/:name" element={<ProjectScreen />} />
        <Route path="/project-detail/:name" element={<ProjectDetailScreen />} />
        <Route path="/project-item/:name" element={<ProjectItemScreen />} />
        {/* Legacy deep-link redirects (cached PWA links). Remove next release. */}
        <Route path="/work-item/:name" element={<LegacyRedirect to="project-detail" />} />
        <Route path="/todo/:name" element={<LegacyRedirect to="project-item" />} />
        {canManageGroups(boot) && (
          <>
            <Route path="/groups" element={<GroupsScreen />} />
            <Route path="/groups/new" element={<GroupFormScreen />} />
            <Route path="/groups/:name" element={<GroupFormScreen />} />
            <Route path="/data-health" element={<DataHealthScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </>
        )}
        {boot?.roles.includes('System Manager') && (
          <Route path="/reports/under-occupied" element={<UnderOccupiedScreen />} />
        )}
        {canManageBrands(boot) && (
          <>
            <Route path="/brands" element={<BrandsScreen />} />
            <Route path="/brands/new" element={<BrandFormScreen />} />
            <Route path="/brands/:name" element={<BrandFormScreen />} />
            <Route path="/companies" element={<CompaniesScreen />} />
            <Route path="/companies/new" element={<CompanyFormScreen />} />
            <Route path="/companies/:name" element={<CompanyFormScreen />} />
          </>
        )}
        {canManageUsers(boot) && (
          <>
            <Route path="/users" element={<UsersScreen />} />
            <Route path="/users/new" element={<UserFormScreen />} />
            <Route path="/users/:name" element={<UserFormScreen />} />
          </>
        )}
        {canManageBadges(boot) && (
          <Route path="/gamification-settings" element={<GamificationSettingsScreen />} />
        )}
        {canManageMarketplace(boot) && (
          <>
            <Route path="/marketplace-admin" element={<MarketplaceAdminScreen />} />
            <Route path="/marketplace-admin/reward/new" element={<RewardFormScreen />} />
            <Route path="/marketplace-admin/reward/:name" element={<RewardFormScreen />} />
          </>
        )}
        {canGrantPoints(boot) && (
          <Route path="/grant-points" element={<GrantPointsScreen />} />
        )}
        <Route path="/gift-points" element={<GiftPointsScreen />} />
        <Route path="/notes" element={<NotesScreen />} />
        <Route path="/notes/new" element={<NoteFormScreen />} />
        <Route path="/notes/:name" element={<NoteFormScreen />} />
        <Route path="/feedback" element={<FeedbackScreen />} />
        <Route path="/help" element={<HelpScreen />} />
        <Route path="/meetings" element={<MeetingsScreen />} />
        <Route path="/activity" element={<ActivityScreen />} />
        <Route path="/notifications" element={<NotificationsScreen />} />
        <Route path="/avatar" element={<AvatarCustomizerScreen />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/attendance" element={<MyAttendance />} />
        <Route path="/attendance/request" element={<RequestException />} />
        {canManageAttendance(boot) && (
          <>
            <Route path="/attendance/manage" element={<AttendanceAdminScreen />} />
            <Route path="/attendance/manage/enrolled" element={<AttendanceProfilesScreen />} />
            <Route path="/attendance/manage/schedules" element={<AttendanceSchedulesScreen />} />
            <Route path="/attendance/manage/stations" element={<AttendanceStationsScreen />} />
            <Route path="/attendance/manage/exceptions" element={<AttendanceExceptionsScreen />} />
            <Route path="/attendance/manage/holidays" element={<AttendanceHolidaysScreen />} />
            <Route path="/attendance/manage/report" element={<AttendanceReportAdminScreen />} />
          </>
        )}
        <Route path="/achievements" element={<AchievementsScreen />} />
        <Route path="/events" element={<EventsScreen />} />
        <Route path="/events/:name" element={<EventDetailScreen />} />
        <Route path="/wallet" element={<WalletLogScreen />} />
        <Route path="/leaderboard" element={<LeaderboardScreen />} />
        <Route path="/team-wall" element={<TeamWallScreen />} />
        <Route path="/marketplace" element={<MarketplaceScreen />} />
        <Route path="/me" element={<Profile onReplayOnboarding={() => setShowOnboarding(true)} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
