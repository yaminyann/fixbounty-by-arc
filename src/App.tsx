import { lazy, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'

// Each page is its own chunk, so the first visit only downloads what it shows.
const Landing = lazy(() => import('@/pages/Landing'))
const Explore = lazy(() => import('@/pages/Explore'))
const BountyDetail = lazy(() => import('@/pages/BountyDetail'))
const CreateBounty = lazy(() => import('@/pages/CreateBounty'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Account = lazy(() => import('@/pages/Account'))
const Activity = lazy(() => import('@/pages/Activity'))
const Help = lazy(() => import('@/pages/Help'))
const NotFound = lazy(() => import('@/pages/NotFound'))

const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'))
const AdminOverview = lazy(() => import('@/pages/admin/Overview'))
const ReviewQueue = lazy(() => import('@/pages/admin/Bounties').then((m) => ({ default: m.ReviewQueue })))
const AllBounties = lazy(() => import('@/pages/admin/Bounties').then((m) => ({ default: m.AllBounties })))
const AdminSubmissions = lazy(() => import('@/pages/admin/Lists').then((m) => ({ default: m.Submissions })))
const AdminUsers = lazy(() => import('@/pages/admin/Lists').then((m) => ({ default: m.Users })))
const AdminRevenue = lazy(() => import('@/pages/admin/Lists').then((m) => ({ default: m.Revenue })))
const AdminActivity = lazy(() => import('@/pages/admin/Lists').then((m) => ({ default: m.ChainActivity })))
const AdminAudit = lazy(() => import('@/pages/admin/Lists').then((m) => ({ default: m.Audit })))
const AdminSystem = lazy(() => import('@/pages/admin/Lists').then((m) => ({ default: m.System })))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

export default function App() {
  return (
    <AppShell>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/bounty/:id" element={<BountyDetail />} />
        <Route path="/create" element={<CreateBounty />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/account" element={<Account />} />
        <Route path="/profile" element={<Navigate to="/account" replace />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/help" element={<Help />} />

        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminOverview />} />
          <Route path="review" element={<ReviewQueue />} />
          <Route path="bounties" element={<AllBounties />} />
          <Route path="submissions" element={<AdminSubmissions />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="revenue" element={<AdminRevenue />} />
          <Route path="activity" element={<AdminActivity />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="system" element={<AdminSystem />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  )
}
