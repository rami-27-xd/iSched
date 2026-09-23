export const APP_NAME = 'iSched'
export const APP_DESCRIPTION = 'Web-Based Scheduling Management System'
export const INSTITUTION = 'Southern Luzon State University — Lucban Campus'

// Classes run 7:30 AM–8:00 PM. This is the START-time axis (30-minute steps);
// callers that also need an end-time ceiling should cap against '20:00' directly
// (e.g. schedules/page.tsx's End Time picker) — a start time alone doesn't say
// how long the session is.
export const DAY_START_TIME = '07:30'
export const DAY_END_TIME = '20:00'
export const TIME_SLOTS = Array.from({ length: 26 }, (_, i) => {
  const hour = Math.floor(i / 2) + 7
  const minute = i % 2 === 0 ? '00' : '30'
  return `${hour.toString().padStart(2, '0')}:${minute}`
}).filter(t => t >= DAY_START_TIME && t <= DAY_END_TIME)

export const DAYS_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const

export const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
}

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Department Chair',
  ADMIN: 'Program Chair',
  FACULTY: 'Faculty',
}

export const ROOM_TYPE_LABELS: Record<string, string> = {
  LECTURE_ROOM: 'Lecture Room',
  LABORATORY: 'Laboratory',
  COMPUTER_LAB: 'Computer Lab',
  LECTURE_LAB: 'Lecture/Lab',
}

export const SUBJECT_TYPE_LABELS: Record<string, string> = {
  LECTURE: 'Lecture',
  LABORATORY: 'Laboratory',
}

export const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
}
