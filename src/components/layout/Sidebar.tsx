import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useIdentity } from '@/contexts/IdentityContext'
import { useUnreadCount, useWorkspace } from '@/lib/api/ecosystem'
import { cn } from '@/lib/cn'
import { ACTIVITY_NAV, DISCOVER_NAV, SETTINGS_NAV, WORKSPACE_NAV, profileNav, type NavItem } from '@/lib/nav'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 px-2.5 text-xs font-medium text-mute">{title}</p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  )
}

function Item({ item, count, onNavigate }: { item: NavItem; count?: number; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <li>
      <NavLink
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
            isActive ? 'bg-ink/[0.06] text-ink' : 'text-mute hover:bg-ink/[0.04] hover:text-ink',
          )
        }
      >
        {({ isActive }) => (
          <>
            <Icon size={16} aria-hidden className={cn(isActive ? 'text-ink' : 'text-mute group-hover:text-ink')} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {count !== undefined && count > 0 && <span className="num rounded-full bg-signal px-1.5 text-xs font-medium text-ink">{count}</span>}
          </>
        )}
      </NavLink>
    </li>
  )
}

/** The grouped navigation used by the workspace sidebar and the mobile menu. */
export function SidebarNav({ signedIn, onNavigate, includeDiscover = true }: { signedIn: boolean; onNavigate?: () => void; includeDiscover?: boolean }) {
  const { user } = useAuth()
  const id = useIdentity()
  const workspace = useWorkspace(id.status === 'ready')
  const unread = useUnreadCount(Boolean(user))

  const toReview = (workspace.data?.owner.submissionsToReview ?? 0) + (workspace.data?.owner.milestonesToReview ?? 0)
  const changes = workspace.data?.contributor.changesRequested ?? 0
  const profile = profileNav(id.linkedWallet)

  return (
    <nav aria-label="Workspace" className="space-y-5">
      {includeDiscover && (
        <Group title="Discover">
          {DISCOVER_NAV.map((item) => (
            <Item key={item.to} item={item} onNavigate={onNavigate} />
          ))}
          <Item item={{ to: '/help', label: 'How it works', icon: DISCOVER_NAV[0].icon }} onNavigate={onNavigate} />
        </Group>
      )}
      {signedIn ? (
        <>
          <Group title="Workspace">
            {WORKSPACE_NAV.map((item) => (
              <Item
                key={item.to}
                item={item}
                count={item.to === '/dashboard/owner' ? toReview : item.to === '/workspace/contributions' ? changes : undefined}
                onNavigate={onNavigate}
              />
            ))}
          </Group>
          <Group title="Activity">
            {ACTIVITY_NAV.map((item) => (
              <Item key={item.to} item={item} count={item.to === '/notifications' ? unread.data : item.to === '/submissions' ? toReview : undefined} onNavigate={onNavigate} />
            ))}
          </Group>
          <Group title="Profile">
            {profile && <Item item={profile} onNavigate={onNavigate} />}
            <Item item={SETTINGS_NAV} onNavigate={onNavigate} />
          </Group>
        </>
      ) : (
        <p className="rounded-md bg-ink/[0.04] px-3 py-3 text-sm text-mute">Sign in to see your dashboards, submissions and rewards.</p>
      )}
    </nav>
  )
}

/** Layout route for every signed-in page: sidebar on large screens, content beside it. Small screens use the header menu. */
export function WorkspaceLayout() {
  const { user } = useAuth()
  return (
    <div className="grid gap-8 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
      {user && (
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <SidebarNav signedIn includeDiscover={false} />
          </div>
        </aside>
      )}
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
