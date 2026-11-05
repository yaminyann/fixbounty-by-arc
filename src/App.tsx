import { lazy, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { WorkspaceLayout } from '@/components/layout/Sidebar'

// Each page is its own chunk, so the first visit only downloads what it shows.
const Landing = lazy(() => import('@/pages/Landing'))
const Explore = lazy(() => import('@/pages/Explore'))
const Categories = lazy(() => import('@/pages/Categories'))
const Projects = lazy(() => import('@/pages/Projects'))
const ProjectPage = lazy(() => import('@/pages/ProjectPage'))
const Profile = lazy(() => import('@/pages/Profile'))
const BountyDetail = lazy(() => import('@/pages/BountyDetail'))
const CreateBounty = lazy(() => import('@/pages/CreateBounty'))
const Activity = lazy(() => import('@/pages/Activity'))
const Help = lazy(() => import('@/pages/Help'))
const Leaderboard = lazy(() => import('@/pages/Leaderboard'))
const Developers = lazy(() => import('@/pages/Developers'))
const DisputePage = lazy(() => import('@/pages/workspace/DisputePage'))
const NotFound = lazy(() => import('@/pages/NotFound'))

const ContributorDashboard = lazy(() => import('@/pages/workspace/ContributorDashboard'))
const OwnerDashboard = lazy(() => import('@/pages/workspace/OwnerDashboard'))
const MyProjects = lazy(() => import('@/pages/workspace/Projects').then((m) => ({ default: m.MyProjects })))
const NewProject = lazy(() => import('@/pages/workspace/Projects').then((m) => ({ default: m.NewProject })))
const ManageProject = lazy(() => import('@/pages/workspace/Projects').then((m) => ({ default: m.ManageProject })))
const Contributions = lazy(() => import('@/pages/workspace/Contributions'))
const Teams = lazy(() => import('@/pages/workspace/Teams'))
const Submissions = lazy(() => import('@/pages/workspace/Submissions'))
const Rewards = lazy(() => import('@/pages/workspace/Rewards'))
const Notifications = lazy(() => import('@/pages/workspace/Notifications'))
const Settings = lazy(() => import('@/pages/workspace/Settings'))

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
const AdminProjects = lazy(() => import('@/pages/admin/Catalog').then((m) => ({ default: m.Projects })))
const AdminCategories = lazy(() => import('@/pages/admin/Catalog').then((m) => ({ default: m.Categories })))
const AdminDisputes = lazy(() => import('@/pages/admin/Catalog').then((m) => ({ default: m.Disputes })))

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
        {/* Discover */}
        <Route path="/" element={<Landing />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:slug" element={<ProjectPage />} />
        <Route path="/bounty/:id" element={<BountyDetail />} />
        <Route path="/u/:wallet" element={<Profile />} />
        <Route path="/create" element={<CreateBounty />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/help" element={<Help />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/developers" element={<Developers />} />

        {/* Signed-in workspace */}
        <Route element={<WorkspaceLayout />}>
          <Route path="/dashboard" element={<ContributorDashboard />} />
          <Route path="/dashboard/owner" element={<OwnerDashboard />} />
          <Route path="/workspace/projects" element={<MyProjects />} />
          <Route path="/workspace/projects/new" element={<NewProject />} />
          <Route path="/workspace/projects/:slug" element={<ManageProject />} />
          <Route path="/workspace/contributions" element={<Contributions />} />
          <Route path="/workspace/teams" element={<Teams />} />
          <Route path="/submissions" element={<Submissions />} />
          <Route path="/rewards" element={<Rewards />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/disputes/:id" element={<DisputePage />} />
        </Route>

        {/* Old links keep working */}
        <Route path="/account" element={<Navigate to="/settings" replace />} />
        <Route path="/profile" element={<Navigate to="/settings" replace />} />

        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminOverview />} />
          <Route path="review" element={<ReviewQueue />} />
          <Route path="bounties" element={<AllBounties />} />
          <Route path="submissions" element={<AdminSubmissions />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="projects" element={<AdminProjects />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="disputes" element={<AdminDisputes />} />
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
