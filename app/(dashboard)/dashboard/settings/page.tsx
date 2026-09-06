"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useTheme } from "next-themes"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { User, Key, Loader2, Building2, Sun, Moon, Palette } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useDepartments } from "@/hooks/use-data"
import { passwordError } from "@/lib/password"
import { PasswordRequirements } from "@/components/shared/password-requirements"

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const defaultTab = searchParams.get("tab") === "password" ? "password"
    : searchParams.get("tab") === "appearance" ? "appearance"
    : "profile"
  const [tab, setTab] = useState(defaultTab)
  const { theme, setTheme } = useTheme()

  const [profileForm, setProfileForm] = useState({ firstName: "", lastName: "", email: "" })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" })
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("")
  const [selectedClusterId, setSelectedClusterId] = useState("")

  const { data: currentUser, isLoading } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const res = await fetch("/api/users/me")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch")
      return json.data ?? null
    },
  })

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN"
  const { data: departments = [] } = useDepartments()

  // CAS clusters a Department Chair can head (Social Sciences / Languages,
  // Literature, and Humanities / Mathematics and Natural Sciences).
  const { data: clusters = [] } = useQuery({
    queryKey: ["clusters"],
    queryFn: async () => {
      const res = await fetch("/api/clusters")
      const json = await res.json()
      if (!res.ok) return []
      return json.data ?? []
    },
    enabled: isSuperAdmin,
  })

  useEffect(() => {
    if (currentUser) {
      setProfileForm({
        firstName: currentUser.firstName ?? "",
        lastName: currentUser.lastName ?? "",
        email: currentUser.email ?? "",
      })
      setSelectedDepartmentId(currentUser.departmentId ?? "")
      setSelectedClusterId(currentUser.clusterId ?? "")
    }
  }, [currentUser])

  const updateProfile = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; departmentId?: string | null; clusterId?: string | null }) => {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to update")
      return json.data
    },
    onSuccess: () => toast.success("Profile updated"),
    onError: (err: Error) => toast.error(err.message),
  })

  async function handleChangePassword() {
    if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
      return toast.error("Please fill in all password fields")
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return toast.error("Passwords do not match")
    }
    const pwError = passwordError(passwordForm.newPassword)
    if (pwError) {
      return toast.error(pwError)
    }
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword })
      if (error) throw error
      toast.success("Password updated successfully")
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
    } catch (err: any) {
      toast.error(err.message ?? "Failed to change password")
    }
  }

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={(v) => v && setTab(v)} className="max-w-2xl">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="mr-1.5 h-3.5 w-3.5" />
            Profile Settings
          </TabsTrigger>
          <TabsTrigger value="password">
            <Key className="mr-1.5 h-3.5 w-3.5" />
            Change Password
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="mr-1.5 h-3.5 w-3.5" />
            Appearance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profile Information</CardTitle>
                <CardDescription>Update your personal information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>First Name</Label>
                    <Input
                      value={profileForm.firstName}
                      onChange={(e) => setProfileForm((f) => ({ ...f, firstName: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Last Name</Label>
                    <Input
                      value={profileForm.lastName}
                      onChange={(e) => setProfileForm((f) => ({ ...f, lastName: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Email</Label>
                  <Input value={profileForm.email} disabled className="bg-muted" />
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Role</Label>
                    <Input
                      value={
                        currentUser?.role === "SUPER_ADMIN" ? "Department Chair (Super Admin)"
                          : currentUser?.role === "ADMIN" ? "Program Chair"
                          : "Faculty"
                      }
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Department</Label>
                    {isSuperAdmin ? (
                      <>
                        <select
                          value={selectedDepartmentId}
                          onChange={(e) => setSelectedDepartmentId(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="">Not assigned</option>
                          {(departments as any[]).map((d: any) => (
                            <option key={d.id} value={d.id}>
                              {d.college?.abbreviation ? `${d.college.abbreviation} — ${d.name}` : d.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">As Department Chair, you can change your department assignment.</p>
                      </>
                    ) : (
                      <>
                        <Input
                          value={currentUser?.departmentName ?? "Not assigned"}
                          disabled
                          readOnly
                          className="bg-muted cursor-not-allowed"
                        />
                        <p className="text-xs text-muted-foreground">Department is assigned during registration and cannot be changed. Contact a Department Chair if this needs updating.</p>
                      </>
                    )}
                  </div>
                </div>

                {isSuperAdmin && (
                  <div className="grid gap-2">
                    <Label>Cluster You Head</Label>
                    <select
                      value={selectedClusterId}
                      onChange={(e) => setSelectedClusterId(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Not assigned</option>
                      {(clusters as any[]).map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      The CAS cluster you head — Social Sciences; Languages, Literature, and Humanities; or Mathematics and Natural Sciences. This scopes the GEC/GEL subjects you manage.
                    </p>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={() => updateProfile.mutate({
                      firstName: profileForm.firstName,
                      lastName: profileForm.lastName,
                      ...(isSuperAdmin && selectedDepartmentId !== (currentUser?.departmentId ?? "")
                        ? { departmentId: selectedDepartmentId || null }
                        : {}),
                      ...(isSuperAdmin && selectedClusterId !== (currentUser?.clusterId ?? "")
                        ? { clusterId: selectedClusterId || null }
                        : {}),
                    })}
                    disabled={updateProfile.isPending}
                  >
                    {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Profile
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="password" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>New Password</Label>
                <Input
                  type="password"
                  placeholder="Enter new password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
                />
                {passwordForm.newPassword.length > 0 && (
                  <PasswordRequirements password={passwordForm.newPassword} />
                )}
              </div>
              <div className="grid gap-2">
                <Label>Confirm New Password</Label>
                <Input
                  type="password"
                  placeholder="Confirm new password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleChangePassword}>
                  Change Password
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Appearance</CardTitle>
              <CardDescription>Customize how iSched looks on your device</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Theme toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Theme</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Choose between light and dark mode</p>
                </div>
                <div className="flex overflow-hidden rounded-lg border border-input">
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                      theme === "light"
                        ? "bg-[#1B4332] text-white"
                        : "bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    <Sun className="h-4 w-4" />
                    Light
                  </button>
                  <div className="w-px bg-input" />
                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                      theme === "dark"
                        ? "bg-[#1B4332] text-white"
                        : "bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    <Moon className="h-4 w-4" />
                    Dark
                  </button>
                </div>
              </div>

              {/* Preview swatch */}
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-[#1B4332] flex items-center justify-center">
                    <span className="text-xs text-white font-bold">iS</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">iSched</p>
                    <p className="text-xs text-muted-foreground">
                      {theme === "dark" ? "Dark mode is active" : "Light mode is active"}
                    </p>
                  </div>
                  <div className="h-6 w-6 rounded-full bg-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
