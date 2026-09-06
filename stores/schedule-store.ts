import { create } from "zustand"

interface ScheduleEntry {
  id: string
  subjectId: string
  facultyId: string
  roomId: string
  sectionId: string
  day: string
  startTime: string
  endTime: string
}

type SaveStatus = "idle" | "saving" | "saved" | "error"

interface ScheduleStore {
  // State
  selectedEntryId: string | null
  pendingChanges: Map<string, Partial<ScheduleEntry>>
  isDirty: boolean
  isGenerating: boolean
  currentScheduleId: string | null
  currentSemesterId: string | null
  viewMode: "calendar" | "list"
  saveStatus: SaveStatus
  lastSavedAt: Date | null

  // Actions
  selectEntry: (id: string | null) => void
  updateEntry: (id: string, changes: Partial<ScheduleEntry>) => void
  resetChanges: () => void
  setGenerating: (isGenerating: boolean) => void
  setCurrentSchedule: (scheduleId: string | null) => void
  setCurrentSemester: (semesterId: string | null) => void
  setViewMode: (mode: "calendar" | "list") => void
  setSaveStatus: (status: SaveStatus) => void
  markSaved: () => void
}

export const useScheduleStore = create<ScheduleStore>((set) => ({
  selectedEntryId: null,
  pendingChanges: new Map(),
  isDirty: false,
  isGenerating: false,
  currentScheduleId: null,
  currentSemesterId: null,
  viewMode: "calendar",
  saveStatus: "idle",
  lastSavedAt: null,

  selectEntry: (id) => set({ selectedEntryId: id }),

  updateEntry: (id, changes) =>
    set((state) => {
      const next = new Map(state.pendingChanges)
      next.set(id, { ...(next.get(id) ?? {}), ...changes })
      return { pendingChanges: next, isDirty: true, saveStatus: "idle" }
    }),

  resetChanges: () =>
    set({ pendingChanges: new Map(), isDirty: false, saveStatus: "idle" }),

  setGenerating: (isGenerating) => set({ isGenerating }),

  setCurrentSchedule: (scheduleId) =>
    set({ currentScheduleId: scheduleId }),

  setCurrentSemester: (semesterId) =>
    set({ currentSemesterId: semesterId }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setSaveStatus: (status) => set({ saveStatus: status }),

  markSaved: () =>
    set({
      pendingChanges: new Map(),
      isDirty: false,
      saveStatus: "saved",
      lastSavedAt: new Date(),
    }),
}))
