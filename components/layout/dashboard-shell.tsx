'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'
import { Sidebar, type SidebarProps } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { CollegeProvider } from '@/lib/college-context'

// ── User role context ─────────────────────────────────────────────────────
const UserRoleContext = React.createContext<string>('FACULTY')
export function useUserRole() { return React.useContext(UserRoleContext) }

export interface DashboardShellProps {
  children: React.ReactNode
  userRole: string
  userName?: string
  userEmail?: string
  /** College the logged-in user belongs to (null = all, for SUPER_ADMIN). */
  defaultCollegeId?: string | null
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/schedules': 'Manage Schedules',
  '/dashboard/availability': 'Faculty Availability',
  '/dashboard/faculty': 'Faculty',
  '/dashboard/rooms': 'Buildings & Labs',
  '/dashboard/subjects': 'Departments',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/users': 'Users',
  '/dashboard/settings': 'Settings',
}

export function DashboardShell({
  children,
  userRole,
  userName,
  userEmail,
  defaultCollegeId,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState(false)
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] ?? 'iSched'

  React.useEffect(() => { setMobileOpen(false) }, [pathname])

  const sidebarProps: SidebarProps = { userRole, userName, userEmail }

  return (
    <UserRoleContext.Provider value={userRole}>
      <CollegeProvider userRole={userRole} defaultCollegeId={defaultCollegeId}>
        <div className="flex h-screen overflow-hidden bg-background">

          {/* Desktop sidebar — collapsible */}
          <aside
            className={`hidden lg:flex lg:shrink-0 lg:flex-col overflow-hidden rounded-r-2xl bg-sidebar transition-all duration-200 ${
              collapsed ? 'lg:w-16' : 'lg:w-64'
            }`}
          >
            <Sidebar
              {...sidebarProps}
              collapsed={collapsed}
              onToggleCollapse={() => setCollapsed(v => !v)}
            />
          </aside>

          {/* Main content */}
          <div className="flex flex-1 flex-col overflow-hidden min-w-0">
            <Topbar
              title={title}
              userName={userName}
              userEmail={userEmail}
              userRole={userRole}
              leading={
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger
                    render={
                      <Button
                        variant="outline"
                        size="icon"
                        className="lg:hidden bg-background"
                        aria-label="Open navigation"
                      />
                    }
                  >
                    <svg
                      className="size-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
                    <SheetTitle className="sr-only">Navigation menu</SheetTitle>
                    <Sidebar {...sidebarProps} />
                  </SheetContent>
                </Sheet>
              }
            />
            <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
          </div>
        </div>
      </CollegeProvider>
    </UserRoleContext.Provider>
  )
}
