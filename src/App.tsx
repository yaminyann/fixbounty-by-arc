import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Landing } from '@/pages/Landing'
import { Explore } from '@/pages/Explore'
import { CreateBounty } from '@/pages/CreateBounty'
import { BountyDetail } from '@/pages/BountyDetail'
import { Dashboard } from '@/pages/Dashboard'
import { Profile } from '@/pages/Profile'
import { ActivityFeed } from '@/pages/ActivityFeed'
import { Help } from '@/pages/Help'
import { Admin } from '@/pages/Admin'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/create" element={<CreateBounty />} />
        <Route path="/bounty/:id" element={<BountyDetail />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/activity" element={<ActivityFeed />} />
        <Route path="/help" element={<Help />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
