// UserRole mirrors the Prisma enum exactly.
// SUPER_ADMIN = Department/College Chairperson (final approval, algorithm execution)
// ADMIN       = Program Chairperson (data submission for their program)
// FACULTY     = End user (view own schedule, log availability)
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'FACULTY'

export type ScheduleStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'ARCHIVED'
export type SubjectType = 'LECTURE' | 'LABORATORY'
export type RoomType = 'LECTURE_ROOM' | 'LABORATORY' | 'COMPUTER_LAB' | 'LECTURE_LAB'
export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY'
export type SemesterType = 'FIRST' | 'SECOND' | 'SUMMER'
export type ConflictType =
  | 'FACULTY_OVERLAP'
  | 'ROOM_OVERLAP'
  | 'SECTION_OVERLAP'
  | 'LOAD_EXCEEDED'
  | 'AVAILABILITY_VIOLATION'
  | 'BUILDING_VIOLATION'
  | 'LAB_SPECIALIZATION_MISMATCH'

// Specialization categories for laboratory rooms.
// Kept in sync with the LabSpecialization Prisma enum.
export type LabSpecialization =
  | 'CISCO_NETWORKING'
  | 'MULTIMEDIA_DESIGN'
  | 'SOFTWARE_DEVELOPMENT'
  | 'GENERAL_COMPUTING'
  | 'ELECTRONICS'
  | 'NETWORK_SECURITY'
  | 'DATABASE_ADMINISTRATION'
  | 'WEB_DEVELOPMENT'

// Sequential approval lifecycle for a department/semester pair.
// Mirrors the DepartmentWorkflowStatus Prisma enum.
export type DepartmentWorkflowStatus =
  | 'DRAFT'
  | 'SUBMITTED_TO_CHAIR'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'

export interface NavItem {
  title: string
  href: string
  icon: string
  roles: UserRole[]
  badge?: number
}

export interface KPIData {
  title: string
  value: string | number
  change?: { value: number; label: string }
  icon: string
  variant?: 'default' | 'accent' | 'success' | 'error'
}

export interface ApiResponse<T> {
  data: T | null
  error: string | null
  meta?: { total?: number; page?: number; perPage?: number }
}

export interface Conflict {
  type: ConflictType
  severity: 'ERROR' | 'WARNING'
  description: string
  entryIds: string[]
}

export interface ScheduleConstraints {
  noFacultyOverlap: boolean
  noRoomOverlap: boolean
  noSectionOverlap: boolean
  respectFacultyAvail: boolean
  respectRoomType: boolean
  // Hard Constraint: faculty cannot be assigned to a building they haven't
  // marked as available for the current semester.
  enforceBuildingAvailability: boolean
  // Hard Constraint: subjects with a requiredLabSpecialization can only be
  // placed in rooms whose labSpecialization matches exactly.
  enforceLabSpecialization: boolean
  maxDailyLoad: number
  maxWeeklyUnits: number
  noBackToBackLab: boolean
  preferMorningSlots?: boolean
}

export interface DepartmentWorkflowStateDto {
  id: string
  departmentId: string
  semesterId: string
  status: DepartmentWorkflowStatus
  submittedBy: string | null
  submittedAt: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNote: string | null
  updatedAt: string
}
