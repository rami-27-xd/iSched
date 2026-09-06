"use client"

import { useState, useMemo } from "react"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DoorOpen, Plus, Search, Building2, Monitor, MoreHorizontal, Loader2, ChevronDown, ChevronRight, FlaskConical, Pencil, Lock } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { useRoomList, useCreateRoom, useUpdateRoom, useBuildings, useCreateBuilding, useUpdateBuilding, useDepartments } from "@/hooks/use-data"
import { RoleGuard } from "@/components/shared/role-guard"
import { LabInventory } from "@/components/rooms/lab-inventory"
import { useCollege } from "@/lib/college-context"

const ROOM_TYPE_LABELS: Record<string, string> = {
  LECTURE_ROOM: "Lecture Room",
  LABORATORY: "Laboratory",
  COMPUTER_LAB: "Computer Lab",
  LECTURE_LAB: "Lecture + Lab",
}


const ROOM_TYPE_COLORS: Record<string, string> = {
  LECTURE_ROOM: "bg-primary/10 text-primary",
  LABORATORY: "bg-accent/10 text-accent-foreground",
}

const INITIAL_ROOM_FORM = { name: "", code: "", buildingId: "", type: "" }

export default function RoomsPage() {
  const { selectedCollegeId } = useCollege()
  const [search, setSearch] = useState("")
  const [buildingStatusFilter, setBuildingStatusFilter] = useState<"all" | "active" | "inactive">("active")
  const [addRoomOpen, setAddRoomOpen] = useState(false)
  const [addRoomBuildingId, setAddRoomBuildingId] = useState("")
  const [addBuildingOpen, setAddBuildingOpen] = useState(false)
  const [newBuildingName, setNewBuildingName] = useState("")
  const [newBuildingCode, setNewBuildingCode] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<any>(null)
  const [roomForm, setRoomForm] = useState(INITIAL_ROOM_FORM)
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set())
  const [newBuildingCollegeIds, setNewBuildingCollegeIds] = useState<string[]>([])

  // Edit Building state
  const [editBuildingOpen, setEditBuildingOpen] = useState(false)
  const [editBuildingTarget, setEditBuildingTarget] = useState<any>(null)
  const [editBuildingName, setEditBuildingName] = useState("")
  const [editBuildingCode, setEditBuildingCode] = useState("")
  const [editBuildingCollegeIds, setEditBuildingCollegeIds] = useState<string[]>([])

  // Room-level college access (stored as college IDs in UI; expanded to dept IDs when saving)
  const [addRoomCollegeIds, setAddRoomCollegeIds] = useState<string[]>([])
  const [editRoomCollegeIds, setEditRoomCollegeIds] = useState<string[]>([])

  // Room-level program (course) access — finer-grained than college/department
  const [addRoomProgramIds, setAddRoomProgramIds] = useState<string[]>([])
  const [editRoomProgramIds, setEditRoomProgramIds] = useState<string[]>([])

  const { data: buildings = [], isLoading: loadingBuildings } = useBuildings()
  const { data: rooms = [], isLoading: loadingRooms } = useRoomList()
  const { data: allDepartments = [] } = useDepartments()

  // One entry per college, with the list of department IDs that belong to it.
  // CAS has three sub-departments (SS, LLH, MNS); all others typically have one.
  const collegeOptions = useMemo(() => {
    const map = new Map<string, any>()
    for (const dept of (allDepartments as any[])) {
      if (!dept.college) continue
      if (!map.has(dept.college.id)) map.set(dept.college.id, { ...dept.college, deptIds: [] })
      map.get(dept.college.id)!.deptIds.push(dept.id)
    }
    return Array.from(map.values()).sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))
  }, [allDepartments])

  // Flat list of programs (courses) across all departments, for room-level access.
  const programOptions = useMemo(() => {
    const list: any[] = []
    for (const dept of (allDepartments as any[])) {
      for (const prog of dept.programs ?? []) {
        list.push({ ...prog, collegeAbbr: dept.college?.abbreviation ?? "" })
      }
    }
    return list.sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))
  }, [allDepartments])

  // For badge display: convert stored ProgramRoom rows to program abbreviations.
  function programAbbrs(programs: any[]): string {
    return programs
      .map((p: any) => p.program?.abbreviation ?? programOptions.find(o => o.id === p.programId)?.abbreviation ?? "")
      .filter(Boolean).join(", ")
  }

  // Expand selected college IDs to all their department IDs (for the API).
  function collegeIdsToDeptIds(collegeIds: string[]): string[] {
    return collegeIds.flatMap(cid => collegeOptions.find(c => c.id === cid)?.deptIds ?? [])
  }

  // Convert a list of department IDs (from DB) back to college IDs (for checkboxes).
  function deptIdsToCollegeIds(deptIds: string[]): string[] {
    return collegeOptions
      .filter(c => c.deptIds.some((did: string) => deptIds.includes(did)))
      .map(c => c.id)
  }

  // For badge display: convert stored department IDs to college abbreviations.
  function deptIdsToCollegeAbbrs(depts: any[]): string {
    const deptIds = depts.map((d: any) => d.departmentId)
    return deptIdsToCollegeIds(deptIds)
      .map(cid => collegeOptions.find(c => c.id === cid)?.abbreviation ?? "")
      .filter(Boolean).join(", ")
  }

  const createRoom = useCreateRoom()
  const updateRoom = useUpdateRoom()
  const createBuilding = useCreateBuilding()
  const updateBuilding = useUpdateBuilding()

  const isLoading = loadingBuildings || loadingRooms

  // Group rooms by building, applying status + search filters
  const buildingsWithRooms = useMemo(() => {
    return buildings
      .filter((b: any) => {
        if (buildingStatusFilter === "active") return b.isActive !== false
        if (buildingStatusFilter === "inactive") return b.isActive === false
        return true
      })
      .map((b: any) => {
        const buildingRooms = rooms.filter((r: any) => r.buildingId === b.id)
        const filteredRooms = search
          ? buildingRooms.filter((r: any) =>
              r.name.toLowerCase().includes(search.toLowerCase()) ||
              r.code.toLowerCase().includes(search.toLowerCase())
            )
          : buildingRooms
        return { ...b, filteredRooms, totalRooms: buildingRooms.length }
      })
      .filter((b: any) => !search || b.filteredRooms.length > 0 || b.name.toLowerCase().includes(search.toLowerCase()))
  }, [buildings, rooms, search, buildingStatusFilter])

  function toggleBuilding(id: string) {
    setExpandedBuildings((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openAddRoom(buildingId: string) {
    setRoomForm({ ...INITIAL_ROOM_FORM, buildingId })
    setAddRoomBuildingId(buildingId)
    setAddRoomCollegeIds([])
    setAddRoomProgramIds([])
    setAddRoomOpen(true)
  }

  function openEdit(r: any) {
    setEditTarget(r)
    setRoomForm({ name: r.name, code: r.code, buildingId: r.buildingId, type: r.type })
    setEditRoomCollegeIds(deptIdsToCollegeIds((r.departments ?? []).map((d: any) => d.departmentId)))
    setEditRoomProgramIds((r.programs ?? []).map((p: any) => p.programId ?? p.program?.id).filter(Boolean))
    setEditOpen(true)
  }

  async function handleCreateRoom() {
    const { name, code, buildingId, type } = roomForm
    if (!name || !code || !buildingId || !type) return toast.error("Please fill in all required fields")
    try {
      await createRoom.mutateAsync({
        name, code, buildingId, type,
        restrictedDepartmentIds: collegeIdsToDeptIds(addRoomCollegeIds),
        restrictedProgramIds: addRoomProgramIds,
      })
      setAddRoomOpen(false)
      setRoomForm(INITIAL_ROOM_FORM)
      setAddRoomCollegeIds([])
      setAddRoomProgramIds([])
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handleUpdateRoom() {
    if (!editTarget) return
    try {
      await updateRoom.mutateAsync({
        id: editTarget.id, ...roomForm,
        restrictedDepartmentIds: collegeIdsToDeptIds(editRoomCollegeIds),
        restrictedProgramIds: editRoomProgramIds,
      })
      setEditOpen(false)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handleCreateBuilding() {
    if (!newBuildingName) return toast.error("Building name is required")
    try {
      await createBuilding.mutateAsync({
        name: newBuildingName,
        code: newBuildingCode || undefined,
        restrictedDepartmentIds: collegeIdsToDeptIds(newBuildingCollegeIds),
      })
      setAddBuildingOpen(false)
      setNewBuildingName("")
      setNewBuildingCode("")
      setNewBuildingCollegeIds([])
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  function openEditBuilding(b: any) {
    setEditBuildingTarget(b)
    setEditBuildingName(b.name)
    setEditBuildingCode(b.code ?? "")
    setEditBuildingCollegeIds(deptIdsToCollegeIds((b.departments ?? []).map((d: any) => d.departmentId)))
    setEditBuildingOpen(true)
  }

  async function handleUpdateBuilding() {
    if (!editBuildingTarget) return
    if (!editBuildingName.trim()) return toast.error("Building name is required")
    try {
      await updateBuilding.mutateAsync({
        id: editBuildingTarget.id,
        name: editBuildingName.trim(),
        code: editBuildingCode.trim() || undefined,
        restrictedDepartmentIds: collegeIdsToDeptIds(editBuildingCollegeIds),
      })
      toast.success("Building updated")
      setEditBuildingOpen(false)
      setEditBuildingTarget(null)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "ADMIN"]}>
    <div className="space-y-6">
      <PageHeader
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button variant="outline" onClick={() => setAddBuildingOpen(true)} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />Add Building
            </Button>
            <Button onClick={() => { setRoomForm(INITIAL_ROOM_FORM); setAddRoomOpen(true) }} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />Add Room
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="buildings">
        <TabsList>
          <TabsTrigger value="buildings" className="gap-2">
            <Building2 className="h-4 w-4" />Buildings
          </TabsTrigger>
          <TabsTrigger value="labs" className="gap-2">
            <FlaskConical className="h-4 w-4" />Lab Inventory
          </TabsTrigger>
        </TabsList>

        {/* ── Labs Tab ── */}
        <TabsContent value="labs" className="mt-4">
          <LabInventory collegeId={selectedCollegeId} />
        </TabsContent>

        {/* ── Buildings Tab ── */}
        <TabsContent value="buildings" className="mt-4">
          <div className="space-y-4">

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search buildings or rooms..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            {/* Building status filter */}
            <div className="flex w-full overflow-hidden rounded-lg border border-input text-sm sm:w-auto">
              {(["active", "inactive", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setBuildingStatusFilter(f)}
                  className={`flex-1 px-3 py-1.5 capitalize transition-colors border-r last:border-r-0 border-input sm:flex-initial ${
                    buildingStatusFilter === f
                      ? "bg-[#1B4332] text-white"
                      : "bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

      {isLoading ? (
        <div className="flex h-24 items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...
        </div>
      ) : buildingsWithRooms.length === 0 ? (
        <EmptyState icon={Building2} title="No buildings found" description={search ? "No buildings or rooms match your search." : "No buildings have been added yet."} />
      ) : (
        <div className="space-y-3">
          {buildingsWithRooms.map((building: any) => {
            const isExpanded = expandedBuildings.has(building.id)
            return (
              <Card key={building.id}>
                <CardHeader
                  className="cursor-pointer hover:bg-muted/30 transition-colors py-4"
                  onClick={() => toggleBuilding(building.id)}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <Building2 className={`h-5 w-5 shrink-0 ${building.isActive !== false ? "text-[#1B4332]" : "text-muted-foreground"}`} />
                      <div className="text-left min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-sm font-semibold truncate">{building.name}</CardTitle>
                          {building.isActive === false && (
                            <Badge variant="secondary" className="text-[10px] shrink-0">Inactive</Badge>
                          )}
                          {building.departments?.length > 0 && (
                            <Badge variant="outline" className="text-[10px] shrink-0 gap-0.5 font-normal">
                              <Lock className="h-2.5 w-2.5" />
                              {deptIdsToCollegeAbbrs(building.departments)} only
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {building.code && <span className="font-mono mr-2">{building.code}</span>}
                          {building.totalRooms} room{building.totalRooms !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex w-full items-center justify-end gap-2 flex-wrap sm:w-auto sm:justify-start sm:shrink-0">
                      {/* Active/Inactive toggle */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 px-2 text-xs ${building.isActive === false ? "text-muted-foreground" : "text-[#1B4332]"}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          updateBuilding.mutate({ id: building.id, isActive: building.isActive === false })
                        }}
                        title={building.isActive === false ? "Mark as Active" : "Mark as Inactive"}
                      >
                        {building.isActive === false ? "Set Active" : "Set Inactive"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); openAddRoom(building.id) }}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />Add Room
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }>
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditBuilding(building) }}>
                            <Pencil className="mr-2 h-4 w-4" />Edit Building
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="pt-0 pb-4">
                    {building.filteredRooms.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        No rooms in this building yet.
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        {building.filteredRooms.map((room: any) => (
                          <div
                            key={room.id}
                            className="flex flex-col gap-2 rounded-lg border px-4 py-3 hover:bg-muted/30 transition-colors sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <DoorOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium break-words">{room.name}</p>
                                <p className="text-xs text-muted-foreground font-mono">{room.code}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end">
                              <Badge variant="secondary" className={ROOM_TYPE_COLORS[room.type] ?? ""}>
                                {ROOM_TYPE_LABELS[room.type] ?? room.type}
                              </Badge>
                              {room.departments?.length > 0 && (
                                <Badge variant="outline" className="gap-1 text-xs border-amber-400 text-amber-700 bg-amber-50">
                                  <Lock className="h-3 w-3" />
                                  {deptIdsToCollegeAbbrs(room.departments)}
                                </Badge>
                              )}
                              {room.programs?.length > 0 && (
                                <Badge variant="outline" className="gap-1 text-xs border-blue-400 text-blue-700 bg-blue-50">
                                  <Lock className="h-3 w-3" />
                                  {programAbbrs(room.programs)}
                                </Badge>
                              )}
                              <Badge variant={room.isActive ? "default" : "secondary"}>
                                {room.isActive ? "Active" : "Inactive"}
                              </Badge>
                              <DropdownMenu>
                                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEdit(room)}>
                                    <Monitor className="mr-2 h-4 w-4" />Edit
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
          </div>{/* end space-y-4 */}
        </TabsContent>
      </Tabs>

      {/* Add Building Dialog */}
      <Dialog open={addBuildingOpen} onOpenChange={setAddBuildingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Building</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Building Name</Label>
              <Input placeholder="e.g. CCS Building" value={newBuildingName} onChange={(e) => setNewBuildingName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>
                Building Code{" "}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input placeholder="e.g. CCS" value={newBuildingCode} onChange={(e) => setNewBuildingCode(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>
                Department Access{" "}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <p className="text-[11px] text-muted-foreground -mt-1 leading-snug">
                Leave empty to allow all departments. Select one or more to restrict this building.
              </p>
              <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
                {collegeOptions.map((college: any) => (
                  <label key={college.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#1B4332]"
                      checked={newBuildingCollegeIds.includes(college.id)}
                      onChange={(e) =>
                        setNewBuildingCollegeIds((prev) =>
                          e.target.checked ? [...prev, college.id] : prev.filter((id) => id !== college.id)
                        )
                      }
                    />
                    <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{college.abbreviation}</span>
                    <span className="truncate">{college.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddBuildingOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateBuilding} disabled={createBuilding.isPending}>
              {createBuilding.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Building
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Room Dialog */}
      <Dialog open={addRoomOpen} onOpenChange={setAddRoomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Room</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Room Name</Label>
                <Input placeholder="e.g. Room 101" value={roomForm.name} onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Room Code</Label>
                <Input placeholder="e.g. CCS-101" value={roomForm.code} onChange={(e) => setRoomForm((f) => ({ ...f, code: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Building</Label>
              <select
                value={roomForm.buildingId}
                onChange={(e) => setRoomForm((f) => ({ ...f, buildingId: e.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select building</option>
                {buildings.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Room Type</Label>
              <select
                value={roomForm.type}
                onChange={(e) => setRoomForm((f) => ({ ...f, type: e.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select type</option>
                <option value="LECTURE_ROOM">Lecture Room</option>
                <option value="LABORATORY">Laboratory</option>
                <option value="COMPUTER_LAB">Computer Lab</option>
                <option value="LECTURE_LAB">Lecture + Lab</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>
                College Access{" "}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <p className="text-[11px] text-muted-foreground -mt-1 leading-snug">
                Leave empty to allow all colleges. Select one or more to restrict this room.
              </p>
              <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
                {collegeOptions.map((college: any) => (
                  <label key={college.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#1B4332]"
                      checked={addRoomCollegeIds.includes(college.id)}
                      onChange={(e) =>
                        setAddRoomCollegeIds((prev) =>
                          e.target.checked ? [...prev, college.id] : prev.filter((id) => id !== college.id)
                        )
                      }
                    />
                    <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{college.abbreviation}</span>
                    <span className="truncate">{college.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>
                Program (Course) Access{" "}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <p className="text-[11px] text-muted-foreground -mt-1 leading-snug">
                Restrict this room to specific programs. Works together with college access — a
                section may use the room if its college OR its program is selected.
              </p>
              <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
                {programOptions.map((prog: any) => (
                  <label key={prog.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#1B4332]"
                      checked={addRoomProgramIds.includes(prog.id)}
                      onChange={(e) =>
                        setAddRoomProgramIds((prev) =>
                          e.target.checked ? [...prev, prog.id] : prev.filter((id) => id !== prog.id)
                        )
                      }
                    />
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{prog.abbreviation}</span>
                    <span className="truncate">{prog.name}</span>
                    {prog.collegeAbbr && (
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{prog.collegeAbbr}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddRoomOpen(false); setRoomForm(INITIAL_ROOM_FORM); setAddRoomCollegeIds([]); setAddRoomProgramIds([]) }}>Cancel</Button>
            <Button onClick={handleCreateRoom} disabled={createRoom.isPending}>
              {createRoom.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Building Dialog */}
      <Dialog open={editBuildingOpen} onOpenChange={setEditBuildingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Building</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Building Name</Label>
              <Input value={editBuildingName} onChange={(e) => setEditBuildingName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>
                Building Code{" "}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input value={editBuildingCode} onChange={(e) => setEditBuildingCode(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>
                Department Access{" "}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <p className="text-[11px] text-muted-foreground -mt-1 leading-snug">
                Leave empty to allow all departments. Select one or more to restrict this building.
              </p>
              <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
                {collegeOptions.map((college: any) => (
                  <label key={college.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#1B4332]"
                      checked={editBuildingCollegeIds.includes(college.id)}
                      onChange={(e) =>
                        setEditBuildingCollegeIds((prev) =>
                          e.target.checked ? [...prev, college.id] : prev.filter((id) => id !== college.id)
                        )
                      }
                    />
                    <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{college.abbreviation}</span>
                    <span className="truncate">{college.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBuildingOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateBuilding} disabled={updateBuilding.isPending}>
              {updateBuilding.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Room Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit Room — {editTarget?.code}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Room Name</Label>
              <Input value={roomForm.name} onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Room Code</Label>
              <Input value={roomForm.code} onChange={(e) => setRoomForm((f) => ({ ...f, code: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Building</Label>
              <select
                value={roomForm.buildingId}
                onChange={(e) => setRoomForm((f) => ({ ...f, buildingId: e.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select building</option>
                {buildings.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <select
                value={roomForm.type}
                onChange={(e) => setRoomForm((f) => ({ ...f, type: e.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select type</option>
                <option value="LECTURE_ROOM">Lecture Room</option>
                <option value="LABORATORY">Laboratory</option>
                <option value="COMPUTER_LAB">Computer Lab</option>
                <option value="LECTURE_LAB">Lecture + Lab</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>
                College Access{" "}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <p className="text-[11px] text-muted-foreground -mt-1 leading-snug">
                Leave empty to allow all colleges. Select one or more to restrict this room.
              </p>
              <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
                {collegeOptions.map((college: any) => (
                  <label key={college.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#1B4332]"
                      checked={editRoomCollegeIds.includes(college.id)}
                      onChange={(e) =>
                        setEditRoomCollegeIds((prev) =>
                          e.target.checked ? [...prev, college.id] : prev.filter((id) => id !== college.id)
                        )
                      }
                    />
                    <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{college.abbreviation}</span>
                    <span className="truncate">{college.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>
                Program (Course) Access{" "}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <p className="text-[11px] text-muted-foreground -mt-1 leading-snug">
                Restrict this room to specific programs. Works together with college access — a
                section may use the room if its college OR its program is selected.
              </p>
              <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
                {programOptions.map((prog: any) => (
                  <label key={prog.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#1B4332]"
                      checked={editRoomProgramIds.includes(prog.id)}
                      onChange={(e) =>
                        setEditRoomProgramIds((prev) =>
                          e.target.checked ? [...prev, prog.id] : prev.filter((id) => id !== prog.id)
                        )
                      }
                    />
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{prog.abbreviation}</span>
                    <span className="truncate">{prog.name}</span>
                    {prog.collegeAbbr && (
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{prog.collegeAbbr}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateRoom} disabled={updateRoom.isPending}>
              {updateRoom.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </RoleGuard>
  )
}
