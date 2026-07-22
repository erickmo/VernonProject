import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate, type Location } from 'react-router-dom'
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
  canHrApprove,
  canManageResources,
  canModerateAds,
  canManageLms,
  canManageIncome,
  canManageCompanies,
  canManageBusinessUnits,
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
import MyInfo from '@web/pages/MyInfo'
import Reports from '@web/pages/Reports'
import DataHealth from '@web/pages/DataHealth'
import ReportPage from '@web/pages/ReportPage'
import TodosDue from '@web/pages/TodosDue'
import Income from '@web/pages/Income'
import IncomeAdmin from '@web/pages/IncomeAdmin'
import Companies from '@web/pages/Companies'
import CompanyForm from '@web/pages/CompanyForm'
import BusinessUnits from '@web/pages/BusinessUnits'
import BusinessUnitForm from '@web/pages/BusinessUnitForm'
import Activity from '@web/pages/Activity'
import Leaderboard from '@web/pages/Leaderboard'
import TeamWall from '@web/pages/TeamWall'
import Marketplace from '@web/pages/Marketplace'
import WalletLog from '@web/pages/WalletLog'
import UserPointsLog from '@web/pages/UserPointsLog'
import GiftPoints from '@web/pages/GiftPoints'
import Users from '@web/pages/Users'
import UserForm from '@web/pages/UserForm'
import UserDashboard from '@web/pages/UserDashboard'
import Groups from '@web/pages/Groups'
import GroupForm from '@web/pages/GroupForm'
import Brands from '@web/pages/Brands'
import BrandForm from '@web/pages/BrandForm'
import MeetingRooms from '@web/pages/MeetingRooms'
import MeetingRoomForm from '@web/pages/MeetingRoomForm'
import Equipment from '@web/pages/Equipment'
import EquipmentForm from '@web/pages/EquipmentForm'
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
import TransferTasks from '@web/pages/TransferTasks'
import Onboarding from '@web/pages/Onboarding'
import SuperpowerGate from '@/components/SuperpowerGate'
import { Meetings } from './pages/Meetings'
import AvatarCustomizer from '@web/pages/AvatarCustomizer'
import AttendanceReport from '@web/pages/AttendanceReport'
import Logbook from '@web/pages/Logbook'
import Stations from '@web/pages/Stations'
import ShiftTemplates from '@web/pages/ShiftTemplates'
import ShiftAssignments from '@web/pages/ShiftAssignments'
import Exceptions from '@web/pages/Exceptions'
import LeaveTypesAdmin from '@web/pages/LeaveTypesAdmin'
import HolidayLists from '@web/pages/HolidayLists'
import AttendanceProfiles from '@web/pages/AttendanceProfiles'
import ExceptionApprovals from '@web/pages/ExceptionApprovals'
import RequestException from '@web/pages/RequestException'
import MyExceptions from '@web/pages/MyExceptions'
import CutiLedger from '@web/pages/CutiLedger'
import CutiLedgerAdmin from '@web/pages/CutiLedgerAdmin'
import Kiosk from '@web/pages/Kiosk'
import Achievements from '@web/pages/Achievements'
import Bookings from '@web/pages/Bookings'
import BookingForm from '@web/pages/BookingForm'
import Events from '@web/pages/Events'
import EventDetail from '@web/pages/EventDetail'
import EventForm from '@web/pages/EventForm'
import EventRoster from '@web/pages/EventRoster'
import MyRegistrations from '@web/pages/MyRegistrations'
import PapanIklan from '@web/pages/PapanIklan'
import PapanIklanDetail from '@web/pages/PapanIklanDetail'
import PapanIklanForm from '@web/pages/PapanIklanForm'
import PapanIklanBans from '@web/pages/PapanIklanBans'
import Learn from '@web/pages/Learn'
import Course from '@web/pages/Course'
import LmsAdmin from '@web/pages/LmsAdmin'
import Superpowers from '@web/pages/Superpowers'
import SuperpowersAdmin from '@web/pages/SuperpowersAdmin'
import WhatsNew from '@web/pages/WhatsNew'
import { isTodoPath } from '@web/lib/todoDrawer'
import TodoDrawer from '@web/components/TodoDrawer'
import { TodoContextMenuProvider } from '@web/components/TodoContextMenuProvider'

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
  const location = useLocation()
  const navigate = useNavigate()
  const bgRef = useRef<Location | null>(null)
  const onTodo = isTodoPath(location.pathname)
  // Freeze the last non-todo page; it stays mounted behind the drawer.
  if (!onTodo) bgRef.current = location
  const showDrawer = onTodo && bgRef.current !== null
  const background = showDrawer ? bgRef.current! : location
  const closeDrawer = () => navigate((bgRef.current?.pathname ?? '/') + (bgRef.current?.search ?? ''))

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

  const sp = b?.settings
  // Blocking superpower gate: forced on + user has none, everywhere but /superpowers.
  const superpowerBlocked =
    !!(sp?.force_superpower && !sp?.has_superpower) && !location.pathname.startsWith('/superpowers')

  return (
    <TodoContextMenuProvider>
      {showOnboarding && <Onboarding onDone={finishOnboarding} />}
      {superpowerBlocked && <SuperpowerGate onGo={() => navigate('/superpowers')} />}
      <Routes location={background}>
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
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/bookings/new" element={<BookingForm />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/help" element={<Help />} />
          {/* Rewards / reports (all users) */}
          <Route path="/reports" element={<Reports />} />
          <Route path="/report/:name" element={<ReportPage />} />
          <Route path="/reports/todos-due" element={<TodosDue />} />
          <Route path="/logbook" element={<Logbook />} />
          {canManageGroups(b) && (
            <Route path="/data-health" element={<DataHealth />} />
          )}
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/team-wall" element={<TeamWall />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/wallet" element={<WalletLog />} />
          <Route path="/points-log/:user" element={<UserPointsLog />} />
          <Route path="/gift-points" element={<GiftPoints />} />
          {/* Admin (gated) */}
          {canManageUsers(b) && (
            <>
              <Route path="/users" element={<Users />} />
              <Route path="/users/new" element={<UserForm />} />
              <Route path="/users/:name" element={<UserDashboard />} />
              <Route path="/users/:name/edit" element={<UserForm />} />
              <Route path="/feedback-inbox" element={<FeedbackInbox />} />
              <Route path="/transfer-tasks" element={<TransferTasks />} />
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
          {canManageResources(b) && (
            <>
              <Route path="/meeting-rooms" element={<MeetingRooms />} />
              <Route path="/meeting-rooms/new" element={<MeetingRoomForm />} />
              <Route path="/meeting-rooms/:name" element={<MeetingRoomForm />} />
            </>
          )}
          {canManageResources(b) && (
            <>
              <Route path="/equipment" element={<Equipment />} />
              <Route path="/equipment/new" element={<EquipmentForm />} />
              <Route path="/equipment/:name" element={<EquipmentForm />} />
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
              <Route path="/attendance/templates" element={<ShiftTemplates />} />
              <Route path="/attendance/assignments" element={<ShiftAssignments />} />
              <Route path="/attendance/holidays" element={<HolidayLists />} />
              <Route path="/attendance/profiles" element={<AttendanceProfiles />} />
            </>
          )}
          <Route path="/events" element={<Events />} />
          <Route path="/events/:name" element={<EventDetail />} />
          <Route path="/events/manage" element={<Navigate to="/events?tab=manage" replace />} />
          <Route path="/events/manage/new" element={<EventForm />} />
          <Route path="/events/manage/:name/roster" element={<EventRoster />} />
          <Route path="/events/manage/:name" element={<EventForm />} />
          <Route path="/my-registrations" element={<MyRegistrations />} />
          <Route path="/attendance/my-approvals" element={<ExceptionApprovals />} />
          <Route path="/attendance/request" element={<RequestException />} />
          <Route path="/attendance/my-requests" element={<MyExceptions />} />
          <Route path="/attendance/cuti" element={<CutiLedger />} />
          {canHrApprove(b) && <Route path="/attendance/exceptions" element={<Exceptions />} />}
          {canHrApprove(b) && <Route path="/attendance/leave-types" element={<LeaveTypesAdmin />} />}
          {canHrApprove(b) && <Route path="/attendance/cuti-admin" element={<CutiLedgerAdmin />} />}
          <Route path="/me" element={<Me onReplayOnboarding={() => setShowOnboarding(true)} />} />
          <Route path="/me/info" element={<MyInfo />} />
          <Route path="/income" element={<Income />} />
          {canManageIncome(b) && <Route path="/income-admin" element={<IncomeAdmin />} />}
          <Route path="/activity" element={<Activity />} />
          {canManageCompanies(b) && (
            <>
              <Route path="/companies" element={<Companies />} />
              <Route path="/companies/new" element={<CompanyForm />} />
              <Route path="/companies/:name" element={<CompanyForm />} />
            </>
          )}
          {canManageBusinessUnits(b) && (
            <>
              <Route path="/business-units" element={<BusinessUnits />} />
              <Route path="/business-units/new" element={<BusinessUnitForm />} />
              <Route path="/business-units/:name" element={<BusinessUnitForm />} />
            </>
          )}
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/superpowers" element={<Superpowers />} />
          <Route path="/superpowers/:user" element={<Superpowers />} />
          {canManageBadges(b) && (
            <Route path="/superpower-admin" element={<SuperpowersAdmin />} />
          )}
          <Route path="/avatar" element={<AvatarCustomizer />} />
          <Route path="/papan-iklan" element={<PapanIklan />} />
          <Route path="/papan-iklan/new" element={<PapanIklanForm />} />
          {canModerateAds(b) && <Route path="/papan-iklan/bans" element={<PapanIklanBans />} />}
          <Route path="/papan-iklan/:name/edit" element={<PapanIklanForm />} />
          <Route path="/papan-iklan/:name" element={<PapanIklanDetail />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:course" element={<Course />} />
          {canManageLms(b) && <Route path="/learn-admin" element={<LmsAdmin />} />}
          <Route path="/whats-new" element={<WhatsNew />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {showDrawer && (
        <Routes location={location}>
          <Route path="/project-item/:name" element={<TodoDrawer onClose={closeDrawer} />} />
        </Routes>
      )}
    </TodoContextMenuProvider>
  )
}
