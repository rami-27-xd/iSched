'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  BookOpen,
  Building2,
  Clock,
  LogOut,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/shared/logo'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'

type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'FACULTY'

interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  roles: UserRole[]
}

export interface SidebarProps {
  userRole: string
  userName?: string
  userEmail?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
}

const navItems: NavItem[] = [
  { title: 'Dashboard',          href: '/dashboard',             icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'ADMIN', 'FACULTY'] },
  { title: 'Manage Schedules',   href: '/dashboard/schedules',   icon: CalendarDays,    roles: ['SUPER_ADMIN', 'ADMIN'] },
  { title: 'Faculty Availability', href: '/dashboard/availability', icon: Clock,         roles: ['SUPER_ADMIN', 'ADMIN'] },
  { title: 'Faculty',            href: '/dashboard/faculty',     icon: Users,           roles: ['SUPER_ADMIN', 'ADMIN'] },
  { title: 'Departments',        href: '/dashboard/subjects',    icon: BookOpen,        roles: ['SUPER_ADMIN', 'ADMIN'] },
  { title: 'Buildings',          href: '/dashboard/rooms',       icon: Building2,       roles: ['SUPER_ADMIN', 'ADMIN'] },
  { title: 'User Management',    href: '/dashboard/users',       icon: Users,           roles: ['SUPER_ADMIN', 'ADMIN'] },
]

function getFilteredNavItems(role: string): NavItem[] {
  return navItems.filter(item => item.roles.includes(role as UserRole))
}

function getInitials(name?: string): string {
  if (!name) return 'U'
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

function formatRole(role: string): string {
  return { SUPER_ADMIN: 'Department Chair', ADMIN: 'Program Chair', FACULTY: 'Faculty' }[role] ?? role
}

export function Sidebar({ userRole, userName, userEmail, collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname()
  const filtered = getFilteredNavItems(userRole)

  const { data: userInfo } = useQuery({
    queryKey: ['sidebar-user-info', userEmail],
    queryFn: async () => {
      const res = await fetch('/api/users/me')
      const json = await res.json()
      if (!res.ok) return null
      return json.data ?? null
    },
    staleTime: 60_000,
  })

  const departmentName = React.useMemo(() => {
    if (!userInfo) return null
    return userInfo.departmentChair?.department?.name
      ?? userInfo.programHead?.program?.department?.name
      ?? userInfo.faculty?.department?.name
      ?? null
  }, [userInfo])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    // Back to the public landing page, not the sign-in form.
    window.location.href = '/'
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* Logo + collapse toggle */}
      <div className={cn(
        'flex shrink-0 items-center border-b border-sidebar-border',
        collapsed
          ? 'h-16 flex-col justify-center gap-1 px-2'
          : 'h-16 flex-row justify-between px-4'
      )}>
        {/* Logo */}
        <div className={cn('flex items-center gap-2.5 min-w-0', collapsed && 'justify-center')}>
          <Logo size="sm" className="rounded-full shrink-0" />
          {!collapsed && (
            <span className="text-base font-bold text-sidebar-foreground tracking-wide truncate">iSched</span>
          )}
        </div>

        {/* Toggle button — desktop only */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
          </button>
        )}
      </div>

      {/* Nav links */}
      <ScrollArea className="flex-1 py-3">
        <nav className={cn('flex flex-col gap-1', collapsed ? 'px-2' : 'px-3')}>
          {filtered.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.title : undefined}
                className={cn(
                  'flex items-center rounded-lg text-sm font-medium transition-colors',
                  collapsed ? 'justify-center h-10 w-10 mx-auto' : 'gap-3 px-3 py-2',
                  isActive
                    ? 'text-sidebar-accent-foreground font-semibold'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground'
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span>{item.title}</span>}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      {/* User profile */}
      {!collapsed ? (
        <div className="flex items-center gap-3 px-3 py-3">
          <Avatar size="default">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-sidebar-foreground">{userName ?? 'User'}</span>
            {userEmail && (
              <span className="truncate text-xs text-sidebar-foreground/60">{userEmail}</span>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Badge variant="secondary" className="w-fit bg-sidebar-primary/20 text-sidebar-primary text-[10px]">
                {formatRole(userRole)}
              </Badge>
              {departmentName && (
                <Badge variant="secondary" className="w-fit bg-[#D4AF37]/20 text-[#D4AF37] text-[10px]">
                  {departmentName}
                </Badge>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex justify-center py-3">
          <Avatar size="default" title={userName}>
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
        </div>
      )}

      {/* Logout */}
      <Separator className="bg-sidebar-border" />
      <div className={cn('py-3', collapsed ? 'px-2' : 'px-3')}>
        <button
          onClick={handleSignOut}
          title={collapsed ? 'Logout' : undefined}
          className={cn(
            'flex items-center rounded-lg text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white',
            collapsed ? 'justify-center h-10 w-10 mx-auto' : 'w-full gap-3 px-3 py-2'
          )}
        >
          <LogOut className="size-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  )
}
