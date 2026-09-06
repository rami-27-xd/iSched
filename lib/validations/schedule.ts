import { z } from 'zod'

export const CreateScheduleSchema = z.object({
  semesterId: z.string().min(1, 'Semester is required'),
})

export const CreateScheduleEntrySchema = z.object({
  subjectId: z.string().min(1),
  facultyId: z.string().min(1),
  roomId: z.string().min(1),
  sectionId: z.string().min(1),
  day: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  set: z.enum(['A', 'B']).nullable().optional(),
}).refine(data => data.startTime < data.endTime, {
  message: 'Start time must be before end time',
  path: ['startTime'],
})

export const GenerateScheduleSchema = z.object({
  semesterId: z.string().min(1),
  constraints: z.object({
    maxDailyHours: z.number().min(1).max(12).default(8),
    maxWeeklyUnits: z.number().min(1).max(30).default(21),
    preferMorning: z.boolean().default(false),
    noBackToBackLab: z.boolean().default(true),
  }).optional(),
})

export const CreateFacultySchema = z.object({
  userId: z.string().min(1),
  departmentId: z.string().min(1),
  employeeId: z.string().min(1, 'Employee ID is required'),
  specializations: z.array(z.string()).default([]),
  maxUnitsPerWeek: z.number().min(1).max(30).default(21),
})

export const CreateRoomSchema = z.object({
  name: z.string().min(1, 'Room name is required'),
  code: z.string().min(1, 'Room code is required'),
  buildingId: z.string().min(1),
  type: z.enum(['LECTURE_ROOM', 'LABORATORY', 'COMPUTER_LAB', 'LECTURE_LAB']),
  capacity: z.number().min(1).max(500),
  equipment: z.array(z.string()).default([]),
})

export const CreateSubjectSchema = z.object({
  code: z.string().min(1, 'Subject code is required'),
  title: z.string().min(1, 'Subject title is required'),
  units: z.number().min(1).max(6),
  hoursPerWeek: z.number().min(1).max(12),
  type: z.enum(['LECTURE', 'LABORATORY']),
  departmentId: z.string().min(1),
  requiredRoomType: z.array(z.enum(['LECTURE_ROOM', 'LABORATORY', 'COMPUTER_LAB', 'LECTURE_LAB'])).default([]),
})

export const FacultyAvailabilitySchema = z.object({
  facultyId: z.string().min(1),
  semesterId: z.string().min(1),
  availability: z.array(z.object({
    day: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })),
})
