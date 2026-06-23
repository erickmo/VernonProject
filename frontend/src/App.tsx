import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
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
import ProjectScreen from './pages/ProjectScreen'
import ProjectDetailScreen from './pages/ProjectDetailScreen'
import ProjectItemScreen from './pages/ProjectItemScreen'
import Profile from './pages/Profile'
import Onboarding from './pages/Onboarding'
import GroupsScreen from './pages/GroupsScreen'
import GroupFormScreen from './pages/GroupFormScreen'
import BrandsScreen from './pages/BrandsScreen'
import BrandFormScreen from './pages/BrandFormScreen'
import UsersScreen from './pages/UsersScreen'
import UserFormScreen from './pages/UserFormScreen'
import WalletLogScreen from './pages/WalletLogScreen'
import LeaderboardScreen from './pages/LeaderboardScreen'
import MarketplaceScreen from './pages/MarketplaceScreen'
import RewardFormScreen from './pages/RewardFormScreen'
import MarketplaceAdminScreen from './pages/MarketplaceAdminScreen'
import GrantPointsScreen from './pages/GrantPointsScreen'
import GiftPointsScreen from './pages/GiftPointsScreen'
import BadgeSettingsScreen from './pages/BadgeSettingsScreen'
import { canManageGroups, canManageBrands, canManageUsers, canManageMarketplace, canGrantPoints, canManageBadges } from './hooks/useData'

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

function LegacyRedirect({ to }: { to: string }) {
  const { name } = useParams()
  return <Navigate to={`/${to}/${name}`} replace />
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
          </>
        )}
        {canManageBrands(boot) && (
          <>
            <Route path="/brands" element={<BrandsScreen />} />
            <Route path="/brands/new" element={<BrandFormScreen />} />
            <Route path="/brands/:name" element={<BrandFormScreen />} />
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
          <Route path="/badge-settings" element={<BadgeSettingsScreen />} />
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
        <Route path="/wallet" element={<WalletLogScreen />} />
        <Route path="/leaderboard" element={<LeaderboardScreen />} />
        <Route path="/marketplace" element={<MarketplaceScreen />} />
        <Route path="/me" element={<Profile onReplayOnboarding={() => setShowOnboarding(true)} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
