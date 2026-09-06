'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Bell, LogOut, User, Key, CheckCheck, Clock, ShieldCheck, CalendarDays, AlertTriangle, Info, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useNotifications, useMarkNotificationRead } from '@/hooks/use-data'

export interface TopbarProps {
  title: string
  leading?: React.ReactNode
  userName?: string
  userEmail?: string
  userRole?: string
  /** Rendered in the toolbar between the title and the notification bell. */
  collegeFilter?: React.ReactNode
}

function getInitials(name?: string): string {
  if (!name) return 'U'
  return name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2)
}

function UserAccountMenu({ userName, userEmail, onSignOut }: { userName?: string; userEmail?: string; onSignOut: () => void }) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  // Fetch user info for department & role
  const { data: userInfo } = useQuery({
    queryKey: ['topbar-user-info'],
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
    if (userInfo.departmentChair?.department?.name) return userInfo.departmentChair.department.name
    if (userInfo.programHead?.program?.department?.name) return userInfo.programHead.program.department.name
    if (userInfo.faculty?.department?.name) return userInfo.faculty.department.name
    return null
  }, [userInfo])

  const roleLabel = React.useMemo(() => {
    if (!userInfo) return null
    const labels: Record<string, string> = { SUPER_ADMIN: 'Department Chair', ADMIN: 'Program Chair', FACULTY: 'Faculty' }
    return labels[userInfo.role] ?? userInfo.role
  }, [userInfo])

  // Close on outside click
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [menuOpen])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 rounded-full p-0.5 outline-none transition-all focus-visible:outline-none"
        aria-label="User menu"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1B4332] text-white text-xs font-semibold">
          {getInitials(userName)}
        </div>
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border bg-popover p-1 shadow-lg z-50 animate-in fade-in-0 zoom-in-95">
          <div className="px-3 py-2 border-b mb-1">
            <p className="text-sm font-medium text-foreground">{userName ?? 'User'}</p>
            {userEmail && <p className="text-xs text-muted-foreground">{userEmail}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {roleLabel && (
                <span className="inline-flex items-center rounded-full bg-[#1B4332]/10 text-[#1B4332] px-2 py-0.5 text-[10px] font-medium">
                  {roleLabel}
                </span>
              )}
              {departmentName && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#D4AF37]/15 text-[#8B7A2B] px-2 py-0.5 text-[10px] font-medium">
                  <Building2 className="h-2.5 w-2.5" />
                  {departmentName}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setMenuOpen(false); router.push('/dashboard/settings') }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <User className="size-4" />
            Profile Settings
          </button>
          <button
            type="button"
            onClick={() => { setMenuOpen(false); router.push('/dashboard/settings?tab=password') }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Key className="size-4" />
            Change Password
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            onClick={() => { setMenuOpen(false); onSignOut() }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="size-4" />
            Log Out
          </button>
        </div>
      )}
    </div>
  )
}

const NOTIF_ICONS: Record<string, React.ReactNode> = {
  schedule_published: <CalendarDays className="h-4 w-4 text-green-600" />,
  schedule_generated: <CalendarDays className="h-4 w-4 text-blue-600" />,
  user_approved: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
  user_registered: <User className="h-4 w-4 text-amber-600" />,
  faculty_added: <User className="h-4 w-4 text-blue-600" />,
  conflict_detected: <AlertTriangle className="h-4 w-4 text-red-600" />,
  general: <Info className="h-4 w-4 text-muted-foreground" />,
}

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function Topbar({ title, leading, userName, userEmail, userRole, collegeFilter }: TopbarProps) {
  const router = useRouter()
  const [notifOpen, setNotifOpen] = React.useState(false)
  const { data } = useNotifications()
  const markRead = useMarkNotificationRead()

  const notifications = data?.notifications ?? []
  const unreadCount = data?.unreadCount ?? 0

  function handleMarkAllRead() {
    markRead.mutate({ markAll: true })
  }

  function handleNotifClick(notif: any) {
    if (!notif.read) {
      markRead.mutate({ notificationId: notif.id })
    }
    if (notif.link) {
      setNotifOpen(false)
      router.push(notif.link)
    }
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    // Back to the public landing page, not the sign-in form.
    window.location.href = '/'
  }

  return (
    <header className="flex h-20 shrink-0 items-center gap-3 border-b bg-card px-5 lg:px-8 shadow-sm">
      {leading}
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        {/* Per-college filter — shown for SUPER_ADMIN and ADMIN */}
        {collegeFilter && (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') && (
          <div className="hidden sm:flex items-center">{collegeFilter}</div>
        )}

        {/* Notification bell with popover */}
        <Popover open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverTrigger
            className="relative flex h-9 w-9 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:outline-none"
            aria-label="Notifications"
          >
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                </div>
              ) : (
                notifications.map((notif: any) => (
                  <button
                    key={notif.id}
                    onClick={() => handleNotifClick(notif)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-emerald-50/60 border-b last:border-0 ${
                      !notif.read ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {NOTIF_ICONS[notif.type] ?? NOTIF_ICONS.general}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!notif.read ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>
                        {notif.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{notif.message}</p>
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {timeAgo(notif.createdAt)}
                      </div>
                    </div>
                    {!notif.read && (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* User account dropdown */}
        <UserAccountMenu userName={userName} userEmail={userEmail} onSignOut={handleSignOut} />
      </div>
    </header>
  )
}
