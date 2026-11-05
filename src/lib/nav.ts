import type { ComponentType } from 'react'
import {
  BookOpen,
  BriefcaseBusiness,
  Coins,
  Compass,
  FlaskConical,
  FolderKanban,
  Globe,
  GitPullRequest,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  Palette,
  Cpu,
  Layers,
  Settings,
  ShieldCheck,
  Sparkles,
  Telescope,
  UserRound,
  Users,
  Code,
  Bell,
  type LucideProps,
} from 'lucide-react'

type Icon = ComponentType<LucideProps>

export interface NavItem {
  to: string
  label: string
  icon: Icon
  end?: boolean
}

/** Public discovery. Always visible in the header. */
export const DISCOVER_NAV: NavItem[] = [
  { to: '/explore', label: 'Explore bounties', icon: Compass },
  { to: '/categories', label: 'Categories', icon: LayoutGrid },
  { to: '/projects', label: 'Projects', icon: FolderKanban, end: true },
]

/** Signed-in areas, shown in the workspace sidebar and the mobile menu. */
export const WORKSPACE_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Contributor dashboard', icon: LayoutDashboard, end: true },
  { to: '/dashboard/owner', label: 'Project dashboard', icon: BriefcaseBusiness },
  { to: '/workspace/projects', label: 'My projects', icon: FolderKanban },
  { to: '/workspace/contributions', label: 'My contributions', icon: GitPullRequest },
  { to: '/workspace/teams', label: 'Team bounties', icon: Users },
]

export const ACTIVITY_NAV: NavItem[] = [
  { to: '/submissions', label: 'Submissions', icon: Inbox },
  { to: '/rewards', label: 'Reward history', icon: Coins },
  { to: '/notifications', label: 'Notifications', icon: Bell },
]

export const SETTINGS_NAV: NavItem = { to: '/settings', label: 'Settings and wallet', icon: Settings }

export function profileNav(wallet: string | null | undefined): NavItem | null {
  return wallet ? { to: `/u/${wallet.toLowerCase()}`, label: 'Contributor profile', icon: UserRound } : null
}

/** Category icons are stored by name, so admins can add categories without a code change. */
export const CATEGORY_ICONS: Record<string, Icon> = {
  'shield-check': ShieldCheck,
  code: Code,
  palette: Palette,
  telescope: Telescope,
  users: Users,
  'flask-conical': FlaskConical,
  megaphone: Megaphone,
  'book-open': BookOpen,
  globe: Globe,
  cpu: Cpu,
  layers: Layers,
  sparkles: Sparkles,
}

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS)

export function categoryIcon(name: string | undefined): Icon {
  return (name && CATEGORY_ICONS[name]) || Code
}
