# iSched — Web-Based Scheduling Management System
## Comprehensive Integrated System Development Plan

> **Institution:** Southern Luzon State University — Lucban Campus
> **System:** iSched — Constraint-Based Scheduling with Backtracking Algorithm
> **Stack:** Next.js 15 · TypeScript · PostgreSQL · Prisma · Supabase Auth · Tailwind CSS · Shadcn/UI · FullCalendar
> **Methodology:** Agile Scrum · ISO 25010:2023 Evaluation

---

## Table of Contents

1. [Design System & Branding](#1-design-system--branding)
2. [System Architecture](#2-system-architecture)
3. [Project Structure](#3-project-structure)
4. [Database Schema](#4-database-schema)
5. [Authentication & RBAC](#5-authentication--rbac)
6. [Development Phases](#6-development-phases)
   - [Phase 1: Database Engineering & Data Migration](#phase-1-database-engineering--data-migration)
   - [Phase 2: Access Control & Centralized Dashboards](#phase-2-access-control--centralized-dashboards)
   - [Phase 3: Core Scheduling Engine & Conflict Detection](#phase-3-core-scheduling-engine--conflict-detection)
   - [Phase 4: Analytics & Constraint Optimization](#phase-4-analytics--constraint-optimization)
   - [Phase 5: Dynamic QR Code Infrastructure](#phase-5-dynamic-qr-code-infrastructure)
   - [Phase 6: Quality Evaluation & Deployment](#phase-6-quality-evaluation--deployment)
7. [UI/UX Design Guidelines](#7-uiux-design-guidelines)
8. [API Design](#8-api-design)
9. [Scheduling Algorithm Design](#9-scheduling-algorithm-design)
10. [Quality Evaluation Plan](#10-quality-evaluation-plan)
11. [Recommended Enhancements](#11-recommended-enhancements)
12. [Sprint Breakdown](#12-sprint-breakdown)

---

## 1. Design System & Branding

### 1.1 Color Palette

| Token | Hex | Usage |
|---|---|---|
| `--color-primary` | `#1B4332` | Primary actions, sidebar, headers, active states |
| `--color-primary-dark` | `#0D2B1F` | Hover/pressed states, deep backgrounds |
| `--color-primary-light` | `#2D6A4F` | Secondary buttons, hover backgrounds |
| `--color-primary-muted` | `#52B788` | Success indicators, active badges |
| `--color-accent` | `#D4AF37` | Accent highlights, badges, gold indicators, callouts |
| `--color-accent-light` | `#F0D060` | Accent hover, soft highlights |
| `--color-surface` | `#F8F9FA` | Page backgrounds |
| `--color-surface-card` | `#FFFFFF` | Card/panel backgrounds |
| `--color-border` | `#E2E8F0` | Borders, dividers |
| `--color-text-primary` | `#0F172A` | Body text |
| `--color-text-secondary` | `#64748B` | Muted/descriptive text |
| `--color-text-inverse` | `#FFFFFF` | Text on dark backgrounds |
| `--color-error` | `#DC2626` | Errors, conflicts, alerts |
| `--color-warning` | `#F59E0B` | Warnings, near-conflict states |
| `--color-info` | `#3B82F6` | Informational badges |

### 1.2 Typography

```css
/* Font Stack */
--font-sans: 'Inter', 'system-ui', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;

/* Scale */
--text-xs:   0.75rem  / 1rem;
--text-sm:   0.875rem / 1.25rem;
--text-base: 1rem     / 1.5rem;
--text-lg:   1.125rem / 1.75rem;
--text-xl:   1.25rem  / 1.75rem;
--text-2xl:  1.5rem   / 2rem;
--text-3xl:  1.875rem / 2.25rem;
--text-4xl:  2.25rem  / 2.5rem;

/* Weights */
--font-normal:   400;
--font-medium:   500;
--font-semibold: 600;
--font-bold:     700;
```

### 1.3 Spacing & Radius

```css
/* Spacing uses Tailwind's 4px base scale */
/* Key values: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px */

--radius-sm: 0.25rem;   /* 4px  — tags, badges */
--radius-md: 0.5rem;    /* 8px  — inputs, buttons */
--radius-lg: 0.75rem;   /* 12px — cards, panels */
--radius-xl: 1rem;      /* 16px — modals, sheets */
--radius-2xl: 1.5rem;   /* 24px — featured cards */
```

### 1.4 Icon System

Use **Lucide React** as the primary icon library. It is already a Shadcn/UI dependency, provides tree-shakeable SVG icons, and maintains consistent stroke widths.

```tsx
// Icon usage convention
import { Calendar, Users, BookOpen, Settings, Bell, QrCode } from 'lucide-react'

// Always use size and strokeWidth props for consistency
<Calendar size={20} strokeWidth={1.75} className="text-primary" />
```

**Key icon assignments:**

| Feature | Icon |
|---|---|
| Schedule / Calendar | `Calendar`, `CalendarDays`, `CalendarRange` |
| Rooms | `DoorOpen`, `Building2` |
| Faculty | `Users`, `UserCheck` |
| Subjects | `BookOpen`, `GraduationCap` |
| Departments | `Layers`, `Briefcase` |
| Conflicts | `AlertTriangle`, `ShieldAlert` |
| QR Code | `QrCode`, `Scan` |
| Analytics | `BarChart3`, `TrendingUp`, `PieChart` |
| Settings | `Settings`, `SlidersHorizontal` |
| Notifications | `Bell`, `BellRing` |
| Export | `Download`, `FileDown` |
| Status OK | `CheckCircle2` |
| Status Error | `XCircle` |
| Status Warning | `AlertCircle` |

### 1.5 Shadow & Elevation

```css
--shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
```

### 1.6 Component Themes (Tailwind + Shadcn)

```ts
// tailwind.config.ts
const config: Config = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1B4332',
          dark:    '#0D2B1F',
          light:   '#2D6A4F',
          muted:   '#52B788',
        },
        accent: {
          DEFAULT: '#D4AF37',
          light:   '#F0D060',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
}
```

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  Next.js 15 App Router · React 19 · TypeScript · Tailwind CSS  │
│  Shadcn/UI Components · FullCalendar · Lucide Icons            │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTPS / Server Actions / API Routes
┌──────────────────────────▼──────────────────────────────────────┐
│                     APPLICATION LAYER                           │
│  Next.js API Routes (Route Handlers)                            │
│  Supabase Auth Middleware (Auth + RBAC)                        │
│  Server Actions (Form submissions, mutations)                   │
│  Zod Validation Layer                                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      BUSINESS LOGIC LAYER                       │
│  Scheduling Engine (Backtracking Algorithm + CSP)              │
│  Conflict Detection Service                                     │
│  Notification Service                                           │
│  Analytics/Reporting Service                                    │
│  QR Code Generation Service                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                       DATA LAYER                                │
│  Prisma ORM (Type-safe DB Client)                               │
│  PostgreSQL (Primary Database)                                  │
│  Prisma Accelerate (Connection Pooling) [recommended]          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                            │
│  Supabase (Auth, User Management, RBAC, PostgreSQL)            │
│  Vercel (Hosting, Edge Network) [recommended]                  │
│  Uploadthing (File uploads — optional)                          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Next.js 15 App Router Routing Strategy

```
app/
├── (auth)/                    # Supabase sign-in/sign-up
│   ├── sign-in/[[...sign-in]]/
│   └── sign-up/[[...sign-up]]/
├── (dashboard)/               # Protected layout group
│   ├── layout.tsx             # Auth-gated shell with sidebar
│   ├── page.tsx               # Root → redirects by role
│   ├── super-admin/           # Super Admin routes
│   ├── department-chair/      # Department Chair routes
│   ├── program-head/          # Program Head routes
│   ├── faculty/               # Faculty routes
│   └── student/               # Student (view-only) routes
├── room/[roomId]/             # Public QR Code room view
│   └── page.tsx               # Permanent public URL
├── api/
│   ├── webhooks/supabase/     # Supabase webhook sync
│   ├── schedules/             # Schedule CRUD
│   ├── generate/              # Algorithm endpoint
│   ├── rooms/                 # Room management
│   ├── faculty/               # Faculty management
│   └── analytics/             # Analytics endpoints
└── layout.tsx                 # Root layout (fonts, providers)
```

---

## 3. Project Structure

```
C:\iSched\
├── app/                       # Next.js App Router
├── components/
│   ├── ui/                    # Shadcn/UI base components
│   ├── layout/                # Sidebar, Header, Shell
│   ├── schedule/              # Calendar, schedule cards
│   ├── forms/                 # All form components
│   ├── analytics/             # Chart + KPI widgets
│   ├── qr/                    # QR display components
│   └── shared/                # Badges, Status, Loaders
├── lib/
│   ├── db.ts                  # Prisma client singleton
│   ├── auth.ts                # Supabase helper utilities
│   ├── validations/           # Zod schemas
│   ├── services/              # Business logic services
│   │   ├── scheduler.ts       # Backtracking engine
│   │   ├── conflicts.ts       # Conflict detection
│   │   ├── analytics.ts       # Analytics queries
│   │   └── qr.ts              # QR generation
│   └── utils/                 # General helpers
├── hooks/                     # Custom React hooks
├── stores/                    # Zustand state stores
├── types/                     # Global TypeScript types
├── prisma/
│   ├── schema.prisma          # Database schema
│   ├── migrations/            # Migration history
│   └── seed.ts                # Seed data
├── public/
│   ├── logo/                  # SLSU branding assets
│   └── icons/                 # Static SVG icons
├── styles/
│   └── globals.css            # Global CSS + design tokens
├── middleware.ts              # Supabase auth middleware
├── next.config.ts
├── tailwind.config.ts
├── package.json
└── .env.local
```

---

## 4. Database Schema

### 4.1 Core Schema (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── ENUMS ──────────────────────────────────────────────────────

enum UserRole {
  SUPER_ADMIN
  DEPARTMENT_CHAIR
  PROGRAM_HEAD
  FACULTY
  STUDENT
}

enum SubjectType {
  LECTURE
  LABORATORY
  HYBRID
}

enum RoomType {
  LECTURE_ROOM
  LABORATORY
  COMPUTER_LAB
  LECTURE_LAB   // dual-purpose
}

enum DayOfWeek {
  MONDAY
  TUESDAY
  WEDNESDAY
  THURSDAY
  FRIDAY
  SATURDAY
}

enum ScheduleStatus {
  DRAFT
  PENDING_APPROVAL
  PUBLISHED
  ARCHIVED
}

enum SemesterType {
  FIRST
  SECOND
  SUMMER
}

// ─── USERS & ROLES ───────────────────────────────────────────────

model User {
  id         String   @id @default(cuid())
  supabaseId    String   @unique
  email      String   @unique
  firstName  String
  lastName   String
  role       UserRole
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  // Relations
  faculty          Faculty?
  departmentChair  DepartmentChair?
  programHead      ProgramHead?

  @@index([supabaseId])
  @@index([role])
}

// ─── ORGANIZATIONAL STRUCTURE ────────────────────────────────────

model College {
  id          String       @id @default(cuid())
  name        String       @unique
  abbreviation String      @unique
  createdAt   DateTime     @default(now())
  departments Department[]
}

model Department {
  id           String   @id @default(cuid())
  name         String
  abbreviation String
  collegeId    String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  college     College          @relation(fields: [collegeId], references: [id])
  chair       DepartmentChair?
  programs    Program[]
  faculty     Faculty[]
  subjects    Subject[]

  @@unique([abbreviation, collegeId])
  @@index([collegeId])
}

model DepartmentChair {
  id           String   @id @default(cuid())
  userId       String   @unique
  departmentId String   @unique
  assignedAt   DateTime @default(now())

  user       User       @relation(fields: [userId], references: [id])
  department Department @relation(fields: [departmentId], references: [id])
}

model Program {
  id           String   @id @default(cuid())
  name         String
  abbreviation String
  departmentId String
  createdAt    DateTime @default(now())

  department  Department   @relation(fields: [departmentId], references: [id])
  head        ProgramHead?
  yearLevels  YearLevel[]

  @@index([departmentId])
}

model ProgramHead {
  id         String   @id @default(cuid())
  userId     String   @unique
  programId  String   @unique
  assignedAt DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id])
  program Program @relation(fields: [programId], references: [id])
}

model YearLevel {
  id        String @id @default(cuid())
  level     Int    // 1-4
  programId String
  sections  Section[]
  program   Program @relation(fields: [programId], references: [id])

  @@unique([level, programId])
}

model Section {
  id          String @id @default(cuid())
  name        String // e.g. "BSIT 3-A"
  yearLevelId String
  capacity    Int    @default(40)

  yearLevel   YearLevel     @relation(fields: [yearLevelId], references: [id])
  assignments ScheduleEntry[]

  @@index([yearLevelId])
}

// ─── FACULTY ────────────────────────────────────────────────────

model Faculty {
  id               String   @id @default(cuid())
  userId           String   @unique
  departmentId     String
  employeeId       String   @unique
  specializations  String[]
  maxUnitsPerWeek  Int      @default(21)
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user            User               @relation(fields: [userId], references: [id])
  department      Department         @relation(fields: [departmentId], references: [id])
  availability    FacultyAvailability[]
  scheduleEntries ScheduleEntry[]
  teachingLoads   TeachingLoad[]

  @@index([departmentId])
}

model FacultyAvailability {
  id        String    @id @default(cuid())
  facultyId String
  day       DayOfWeek
  startTime String    // "HH:MM" 24h format
  endTime   String
  semesterId String

  faculty  Faculty  @relation(fields: [facultyId], references: [id], onDelete: Cascade)
  semester Semester @relation(fields: [semesterId], references: [id])

  @@unique([facultyId, day, startTime, semesterId])
  @@index([facultyId, semesterId])
}

// ─── ROOMS ──────────────────────────────────────────────────────

model Building {
  id    String @id @default(cuid())
  name  String @unique
  code  String @unique
  rooms Room[]
}

model Room {
  id         String   @id @default(cuid())
  name       String
  code       String   @unique  // permanent identifier for QR URL
  buildingId String
  type       RoomType
  capacity   Int
  equipment  String[] // ["projector", "aircon", "computer"]
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())

  building        Building        @relation(fields: [buildingId], references: [id])
  scheduleEntries ScheduleEntry[]
  qrCode          RoomQRCode?

  @@index([buildingId])
  @@index([type])
}

model RoomQRCode {
  id          String   @id @default(cuid())
  roomId      String   @unique
  permanentUrl String  @unique // /room/{roomId}
  qrImageData String   // base64 SVG or URL
  generatedAt DateTime @default(now())

  room Room @relation(fields: [roomId], references: [id])
}

// ─── ACADEMIC CALENDAR ──────────────────────────────────────────

model AcademicYear {
  id        String   @id @default(cuid())
  label     String   @unique  // "2025-2026"
  startYear Int
  endYear   Int
  isCurrent Boolean  @default(false)
  semesters Semester[]

  @@index([isCurrent])
}

model Semester {
  id             String       @id @default(cuid())
  type           SemesterType
  academicYearId String
  startDate      DateTime
  endDate        DateTime
  isActive       Boolean      @default(false)
  createdAt      DateTime     @default(now())

  academicYear   AcademicYear          @relation(fields: [academicYearId], references: [id])
  schedules      Schedule[]
  availability   FacultyAvailability[]
  teachingLoads  TeachingLoad[]

  @@unique([type, academicYearId])
  @@index([isActive])
}

// ─── SUBJECTS ───────────────────────────────────────────────────

model Subject {
  id             String      @id @default(cuid())
  code           String      @unique
  title          String
  units          Int
  hoursPerWeek   Int
  type           SubjectType
  departmentId   String
  requiredRoomType RoomType[]
  createdAt      DateTime    @default(now())

  department    Department     @relation(fields: [departmentId], references: [id])
  scheduleEntries ScheduleEntry[]
  teachingLoads   TeachingLoad[]

  @@index([departmentId])
  @@index([type])
}

// ─── TEACHING LOADS ─────────────────────────────────────────────

model TeachingLoad {
  id         String   @id @default(cuid())
  facultyId  String
  subjectId  String
  semesterId String
  units      Int
  assignedAt DateTime @default(now())

  faculty  Faculty  @relation(fields: [facultyId], references: [id])
  subject  Subject  @relation(fields: [subjectId], references: [id])
  semester Semester @relation(fields: [semesterId], references: [id])

  @@unique([facultyId, subjectId, semesterId])
}

// ─── SCHEDULES ──────────────────────────────────────────────────

model Schedule {
  id         String         @id @default(cuid())
  semesterId String
  status     ScheduleStatus @default(DRAFT)
  generatedAt DateTime?
  publishedAt DateTime?
  createdBy  String
  createdAt  DateTime       @default(now())
  updatedAt  DateTime       @updatedAt

  semester Semester        @relation(fields: [semesterId], references: [id])
  entries  ScheduleEntry[]
  conflicts ConflictLog[]

  @@index([semesterId, status])
}

model ScheduleEntry {
  id         String    @id @default(cuid())
  scheduleId String
  subjectId  String
  facultyId  String
  roomId     String
  sectionId  String
  day        DayOfWeek
  startTime  String    // "HH:MM"
  endTime    String    // "HH:MM"
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  schedule Schedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  subject  Subject  @relation(fields: [subjectId], references: [id])
  faculty  Faculty  @relation(fields: [facultyId], references: [id])
  room     Room     @relation(fields: [roomId], references: [id])
  section  Section  @relation(fields: [sectionId], references: [id])

  @@index([scheduleId])
  @@index([facultyId, day])
  @@index([roomId, day])
  @@index([sectionId, day])
}

model ConflictLog {
  id          String   @id @default(cuid())
  scheduleId  String
  type        String   // "FACULTY_OVERLAP" | "ROOM_OVERLAP" | "SECTION_OVERLAP" | "LOAD_EXCEEDED"
  description String
  entityIds   String[] // IDs of conflicting entries
  resolved    Boolean  @default(false)
  createdAt   DateTime @default(now())

  schedule Schedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)

  @@index([scheduleId, resolved])
}

// ─── NOTIFICATIONS ──────────────────────────────────────────────

model Notification {
  id        String   @id @default(cuid())
  userId    String
  title     String
  message   String
  type      String   // "INFO" | "WARNING" | "SUCCESS" | "ERROR"
  read      Boolean  @default(false)
  link      String?
  createdAt DateTime @default(now())

  @@index([userId, read])
  @@index([createdAt])
}
```

---

## 5. Authentication & RBAC

### 5.1 Supabase Auth Configuration

```typescript
// middleware.ts
import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### 5.2 Role-Based Route Protection

```typescript
// lib/auth.ts
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'

export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  return db.user.findUnique({
    where: { supabaseId: user.id },
    include: {
      faculty: { include: { department: true } },
      departmentChair: { include: { department: true } },
      programHead: { include: { program: true } },
    },
  })
}
  const { userId } = await auth()
  if (!userId) return null

  return db.user.findUnique({
    where: { supabaseId: user.id },
    include: {
      faculty: { include: { department: true } },
      departmentChair: { include: { department: true } },
      programHead: { include: { program: true } },
    },
  })
}

export async function requireRole(...roles: UserRole[]) {
  const user = await getCurrentUser()
  if (!user || !roles.includes(user.role)) {
    throw new Error('UNAUTHORIZED')
  }
  return user
}

// Role hierarchy check
export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ['*'],
  DEPARTMENT_CHAIR: [
    'schedule:read', 'schedule:create', 'schedule:publish',
    'faculty:read', 'faculty:assign',
    'room:read', 'subject:read',
    'analytics:read',
  ],
  PROGRAM_HEAD: [
    'schedule:read', 'schedule:create',
    'faculty:read', 'room:read', 'subject:read',
  ],
  FACULTY: ['schedule:read:own', 'availability:write:own'],
  STUDENT: ['schedule:read:public'],
} as const
```

### 5.3 Supabase User Synchronization

Supabase Auth automatically handles user creation and authentication. User profile data is synchronized to the database on first login via the `ensureDbUser` function in `lib/auth.ts`. No webhooks are required for basic user management.

```typescript
// lib/auth.ts - ensureDbUser function
export async function ensureDbUser(supabaseUser: SupabaseUser) {
  const existing = await db.user.findUnique({
    where: { supabaseId: supabaseUser.id },
    include: { /* relations */ },
  })

  if (existing) return existing

  return db.user.create({
    data: {
      supabaseId: supabaseUser.id,
      email: supabaseUser.email ?? '',
      firstName: supabaseUser.user_metadata?.first_name ?? '',
      lastName: supabaseUser.user_metadata?.last_name ?? '',
      role: 'STUDENT',
    },
    include: { /* relations */ },
  })
}
```
      },
      update: {
        email:     user.email_addresses[0].email_address,
        firstName: user.first_name ?? '',
        lastName:  user.last_name ?? '',
        role:      (user.public_metadata?.role as string ?? 'STUDENT') as any,
      },
    })
}
```

---

## 6. Development Phases

---

### Phase 1: Database Engineering & Data Migration

**Duration:** Sprint 1–2 (2 weeks)
**Goal:** Establish a production-ready, fully normalized PostgreSQL schema with seed data and migration tooling.

#### Deliverables

- [ ] PostgreSQL database provisioned (local + staging)
- [ ] Complete Prisma schema (all models above)
- [ ] Migrations committed and tested
- [ ] Seed script with realistic SLSU data
- [ ] Prisma Studio access configured for dev
- [ ] Database connection pooling configured (Prisma Accelerate or PgBouncer)
- [ ] `.env.local` template with all required variables

#### Key Environment Variables

```env
# .env.local
DATABASE_URL="postgresql://user:password@localhost:5432/ischeddb"

# Supabase
NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""

NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

#### Seed Script Structure

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  // 1. College → Departments → Programs
  const college = await db.college.create({ data: { name: 'SLSU Lucban', abbreviation: 'SLSU' } })

  const ccs = await db.department.create({
    data: { name: 'College of Computing Studies', abbreviation: 'CCS', collegeId: college.id }
  })

  // 2. Buildings → Rooms
  const mainBuilding = await db.building.create({ data: { name: 'CCS Building', code: 'CCS-BLDG' } })

  const rooms = await db.room.createMany({
    data: [
      { name: 'Room 101', code: 'CCS-101', buildingId: mainBuilding.id, type: 'LECTURE_ROOM', capacity: 40 },
      { name: 'Lab 201', code: 'CCS-LAB-201', buildingId: mainBuilding.id, type: 'COMPUTER_LAB', capacity: 35 },
    ]
  })

  // 3. Academic Year → Semester
  const ay = await db.academicYear.create({
    data: { label: '2025-2026', startYear: 2025, endYear: 2026, isCurrent: true }
  })

  await db.semester.create({
    data: {
      type: 'FIRST', academicYearId: ay.id,
      startDate: new Date('2025-08-01'), endDate: new Date('2025-12-15'),
      isActive: true
    }
  })

  console.log('Seed complete')
}

main().catch(console.error).finally(() => db.$disconnect())
```

---

### Phase 2: Access Control & Centralized Dashboards

**Duration:** Sprint 3–4 (2 weeks)
**Goal:** Role-specific dashboards with Supabase Auth integration, sidebar navigation, and shared layout components.

#### Deliverables

- [ ] Authentication flow (Supabase sign-in/sign-up pages, SLSU-branded)
- [ ] Supabase user sync on login
- [ ] Role-aware dashboard layouts
- [ ] Sidebar navigation (role-filtered)
- [ ] Top-bar with notifications bell + user profile dropdown
- [ ] Dashboard overview cards (KPI summary per role)
- [ ] User management UI (Super Admin)
- [ ] Faculty profile page

#### Layout Architecture

```tsx
// components/layout/DashboardShell.tsx
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

interface DashboardShellProps {
  children: React.ReactNode
}

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
```

#### Sidebar Design Spec

```
┌────────────────────┐
│  [SLSU Logo]       │  ← 56px tall header, white logo on #1B4332
│  iSched            │
├────────────────────┤
│  [Nav Group]       │
│  ▸ Dashboard       │  ← Lucide: LayoutDashboard
│  ▸ Schedules       │  ← Lucide: CalendarDays
│  ▸ Faculty         │  ← Lucide: Users
│  ▸ Rooms           │  ← Lucide: DoorOpen
│  ▸ Subjects        │  ← Lucide: BookOpen
│  ▸ Analytics       │  ← Lucide: BarChart3
├────────────────────┤
│  [Admin Group]     │
│  ▸ Users           │  ← Lucide: UserCog
│  ▸ Settings        │  ← Lucide: Settings
└────────────────────┘
│  [User Profile]    │  ← Avatar, name, role badge
└────────────────────┘
```

```tsx
// Sidebar nav item active state
<Link
  href={href}
  className={cn(
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
    isActive
      ? 'bg-accent/15 text-accent border border-accent/20'  // gold active state
      : 'text-white/70 hover:bg-white/10 hover:text-white'
  )}
>
  <Icon size={18} strokeWidth={isActive ? 2 : 1.75} />
  {label}
</Link>
```

#### Role-Based Dashboard KPIs

| Role | KPI Cards |
|---|---|
| Super Admin | Total Users, Active Schedules, Conflicts Detected, System Status |
| Department Chair | Faculty Count, Pending Schedules, Conflict Alerts, Room Utilization % |
| Program Head | Sections Count, Unscheduled Subjects, Faculty Load Summary |
| Faculty | My Schedule (this week), Total Units This Sem, Availability Set |
| Student | Today's Classes, Weekly Schedule View |

---

### Phase 3: Core Scheduling Engine & Conflict Detection

**Duration:** Sprint 5–8 (4 weeks)
**Goal:** The central feature — automated schedule generation using a backtracking CSP algorithm, manual override, and FullCalendar integration.

#### Deliverables

- [ ] Backtracking scheduling algorithm service
- [ ] Constraint validation engine
- [ ] FullCalendar integration (week/day view)
- [ ] Manual drag-and-drop schedule adjustment
- [ ] Conflict detection and visualization
- [ ] Schedule approval workflow (Draft → Pending → Published)
- [ ] Schedule export (PDF, Excel)
- [ ] Faculty availability input UI

#### Scheduling Algorithm

```typescript
// lib/services/scheduler.ts

export interface ScheduleConstraints {
  noFacultyOverlap:    boolean  // same faculty, same timeslot
  noRoomOverlap:       boolean  // same room, same timeslot
  noSectionOverlap:    boolean  // same section, same timeslot
  respectFacultyAvail: boolean  // faculty availability windows
  respectRoomType:     boolean  // subject requires specific room type
  maxDailyLoad:        number   // max hours per faculty per day
  maxWeeklyUnits:      number   // max units per faculty per week
  noBackToBackLab:     boolean  // labs should not be consecutive
  preferMorningSlots?: boolean  // soft constraint
}

interface Assignment {
  subjectId: string
  facultyId: string
  roomId:    string
  sectionId: string
  day:       DayOfWeek
  startTime: string
  endTime:   string
}

export class SchedulingEngine {
  private assignments: Assignment[] = []
  private constraints: ScheduleConstraints
  private domains: Map<string, Assignment[]>  // subjectId → possible assignments

  constructor(
    private subjects:      SubjectWithDetails[],
    private faculty:       FacultyWithAvailability[],
    private rooms:         Room[],
    private sections:      Section[],
    constraints:           Partial<ScheduleConstraints> = {}
  ) {
    this.constraints = { ...DEFAULT_CONSTRAINTS, ...constraints }
    this.domains = this.initializeDomains()
  }

  // Entry point: returns complete schedule or throws if unsolvable
  async generate(): Promise<Assignment[]> {
    this.assignments = []
    const orderedSubjects = this.applyMRV(this.subjects) // Minimum Remaining Values heuristic
    const success = this.backtrack(orderedSubjects, 0)

    if (!success) {
      throw new SchedulingConflictError('Unable to generate a valid schedule with current constraints')
    }
    return this.assignments
  }

  // Backtracking with forward checking
  private backtrack(subjects: SubjectWithDetails[], index: number): boolean {
    if (index === subjects.length) return true  // all assigned

    const subject = subjects[index]
    const domain  = this.domains.get(subject.id) ?? []
    const ordered = this.applyLCV(domain, subject)  // Least Constraining Value heuristic

    for (const candidate of ordered) {
      if (this.isConsistent(candidate)) {
        this.assignments.push(candidate)
        this.propagateConstraints(candidate)  // Forward checking: prune domains

        if (this.backtrack(subjects, index + 1)) return true

        // Backtrack
        this.assignments.pop()
        this.restoreDomains(candidate)
      }
    }

    return false  // trigger backtrack
  }

  // Constraint checker
  private isConsistent(candidate: Assignment): boolean {
    return (
      !this.hasFacultyConflict(candidate)   &&
      !this.hasRoomConflict(candidate)      &&
      !this.hasSectionConflict(candidate)   &&
      this.isFacultyAvailable(candidate)    &&
      this.isRoomTypeCompatible(candidate)  &&
      !this.exceedsDailyLoad(candidate)     &&
      !this.exceedsWeeklyUnits(candidate)
    )
  }

  private hasFacultyConflict(candidate: Assignment): boolean {
    return this.assignments.some(a =>
      a.facultyId === candidate.facultyId &&
      a.day === candidate.day &&
      this.timesOverlap(a.startTime, a.endTime, candidate.startTime, candidate.endTime)
    )
  }

  private hasRoomConflict(candidate: Assignment): boolean {
    return this.assignments.some(a =>
      a.roomId === candidate.roomId &&
      a.day === candidate.day &&
      this.timesOverlap(a.startTime, a.endTime, candidate.startTime, candidate.endTime)
    )
  }

  private hasSectionConflict(candidate: Assignment): boolean {
    return this.assignments.some(a =>
      a.sectionId === candidate.sectionId &&
      a.day === candidate.day &&
      this.timesOverlap(a.startTime, a.endTime, candidate.startTime, candidate.endTime)
    )
  }

  private timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
    const [start1, end1] = [this.toMinutes(s1), this.toMinutes(e1)]
    const [start2, end2] = [this.toMinutes(s2), this.toMinutes(e2)]
    return start1 < end2 && start2 < end1
  }

  private toMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }

  // MRV: order subjects with fewest remaining options first (harder to schedule first)
  private applyMRV(subjects: SubjectWithDetails[]): SubjectWithDetails[] {
    return [...subjects].sort((a, b) => {
      const domainA = this.domains.get(a.id)?.length ?? 0
      const domainB = this.domains.get(b.id)?.length ?? 0
      return domainA - domainB
    })
  }

  // LCV: try assignments that remove fewest options from other subjects first
  private applyLCV(domain: Assignment[], subject: SubjectWithDetails): Assignment[] {
    return domain.map(candidate => ({
      candidate,
      conflicts: this.countConstraintsRemoved(candidate)
    }))
    .sort((a, b) => a.conflicts - b.conflicts)
    .map(({ candidate }) => candidate)
  }

  private countConstraintsRemoved(candidate: Assignment): number {
    let count = 0
    for (const [subjectId, domain] of this.domains) {
      count += domain.filter(a =>
        (a.facultyId === candidate.facultyId && a.day === candidate.day &&
          this.timesOverlap(a.startTime, a.endTime, candidate.startTime, candidate.endTime)) ||
        (a.roomId === candidate.roomId && a.day === candidate.day &&
          this.timesOverlap(a.startTime, a.endTime, candidate.startTime, candidate.endTime))
      ).length
    }
    return count
  }

  private initializeDomains(): Map<string, Assignment[]> {
    const domains = new Map<string, Assignment[]>()
    const timeslots = this.generateTimeslots()
    const days: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']

    for (const subject of this.subjects) {
      const possible: Assignment[] = []

      for (const faculty of this.getEligibleFaculty(subject)) {
        for (const room of this.getCompatibleRooms(subject)) {
          for (const section of this.sections) {
            for (const day of days) {
              for (const slot of timeslots) {
                possible.push({
                  subjectId: subject.id,
                  facultyId: faculty.id,
                  roomId:    room.id,
                  sectionId: section.id,
                  day,
                  startTime: slot.start,
                  endTime:   this.calculateEndTime(slot.start, subject.hoursPerWeek),
                })
              }
            }
          }
        }
      }

      domains.set(subject.id, possible)
    }

    return domains
  }

  private generateTimeslots(): { start: string }[] {
    const slots = []
    for (let h = 7; h <= 19; h++) {
      slots.push({ start: `${h.toString().padStart(2, '0')}:00` })
      slots.push({ start: `${h.toString().padStart(2, '0')}:30` })
    }
    return slots
  }
}
```

#### Conflict Detection Service

```typescript
// lib/services/conflicts.ts

export type ConflictType =
  | 'FACULTY_OVERLAP'
  | 'ROOM_OVERLAP'
  | 'SECTION_OVERLAP'
  | 'LOAD_EXCEEDED'
  | 'AVAILABILITY_VIOLATION'
  | 'ROOM_CAPACITY_EXCEEDED'

export interface Conflict {
  type:        ConflictType
  severity:    'ERROR' | 'WARNING'
  description: string
  entryIds:    string[]
}

export async function detectConflicts(scheduleId: string): Promise<Conflict[]> {
  const entries = await db.scheduleEntry.findMany({
    where: { scheduleId },
    include: { faculty: true, room: true, section: true, subject: true },
  })

  const conflicts: Conflict[] = []

  // 1. Faculty double-booking
  const byFacultyDay = groupBy(entries, e => `${e.facultyId}-${e.day}`)
  for (const [, dayEntries] of Object.entries(byFacultyDay)) {
    const overlaps = findTimeOverlaps(dayEntries as typeof entries)
    for (const [a, b] of overlaps) {
      conflicts.push({
        type: 'FACULTY_OVERLAP',
        severity: 'ERROR',
        description: `${a.faculty.firstName} ${a.faculty.lastName} has overlapping classes on ${a.day}`,
        entryIds: [a.id, b.id],
      })
    }
  }

  // 2. Room double-booking
  const byRoomDay = groupBy(entries, e => `${e.roomId}-${e.day}`)
  for (const [, dayEntries] of Object.entries(byRoomDay)) {
    const overlaps = findTimeOverlaps(dayEntries as typeof entries)
    for (const [a, b] of overlaps) {
      conflicts.push({
        type: 'ROOM_OVERLAP',
        severity: 'ERROR',
        description: `${a.room.name} is double-booked on ${a.day}`,
        entryIds: [a.id, b.id],
      })
    }
  }

  // 3. Section double-booking
  const bySectionDay = groupBy(entries, e => `${e.sectionId}-${e.day}`)
  for (const [, dayEntries] of Object.entries(bySectionDay)) {
    const overlaps = findTimeOverlaps(dayEntries as typeof entries)
    for (const [a, b] of overlaps) {
      conflicts.push({
        type: 'SECTION_OVERLAP',
        severity: 'ERROR',
        description: `Section ${a.section.name} has overlapping classes on ${a.day}`,
        entryIds: [a.id, b.id],
      })
    }
  }

  return conflicts
}
```

#### FullCalendar Integration

```tsx
// components/schedule/ScheduleCalendar.tsx
'use client'

import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventInput, EventClickArg, EventDropArg } from '@fullcalendar/core'

const CONFLICT_COLOR     = '#DC2626'
const DEFAULT_EVENT_COLOR = '#1B4332'
const PENDING_EVENT_COLOR = '#52B788'

export function ScheduleCalendar({ entries, onEntryClick, onEntryDrop, editable = false }) {
  const events: EventInput[] = entries.map(entry => ({
    id:              entry.id,
    title:           `${entry.subject.code} — ${entry.room.code}`,
    daysOfWeek:      [DAY_TO_FC_INDEX[entry.day]],
    startTime:       entry.startTime,
    endTime:         entry.endTime,
    backgroundColor: entry.hasConflict ? CONFLICT_COLOR : DEFAULT_EVENT_COLOR,
    borderColor:     entry.hasConflict ? CONFLICT_COLOR : DEFAULT_EVENT_COLOR,
    extendedProps:   { entry },
  }))

  return (
    <div className="rounded-xl border border-border bg-surface-card shadow-sm overflow-hidden">
      <FullCalendar
        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left:   'prev,next today',
          center: 'title',
          right:  'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        slotMinTime="07:00:00"
        slotMaxTime="21:00:00"
        slotDuration="00:30:00"
        allDaySlot={false}
        events={events}
        editable={editable}
        eventClick={onEntryClick}
        eventDrop={onEntryDrop}
        height="auto"
        eventContent={renderEventContent}
        // SLSU brand colors
        eventColor={DEFAULT_EVENT_COLOR}
        nowIndicatorClassNames="bg-accent"
      />
    </div>
  )
}

function renderEventContent(eventInfo) {
  return (
    <div className="px-1.5 py-1 text-xs font-medium text-white overflow-hidden">
      <div className="font-semibold truncate">{eventInfo.event.extendedProps.entry.subject.code}</div>
      <div className="text-white/80 truncate">{eventInfo.event.extendedProps.entry.faculty.lastName}</div>
      <div className="text-white/70 truncate">{eventInfo.event.extendedProps.entry.room.code}</div>
    </div>
  )
}

const DAY_TO_FC_INDEX: Record<string, number> = {
  MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6
}
```

---

### Phase 4: Analytics & Constraint Optimization

**Duration:** Sprint 9–10 (2 weeks)
**Goal:** Data-driven insights for department chairs and super admin via visual dashboards.

#### Deliverables

- [ ] KPI metrics cards (utilization, load distribution, conflict rate)
- [ ] Room utilization heatmap
- [ ] Faculty load distribution chart
- [ ] Schedule coverage by department/program
- [ ] Exportable analytics report (PDF)
- [ ] Constraint optimization suggestions UI

#### Recommended Chart Library: **Recharts**

Recharts is lightweight, composable, React-native, and integrates naturally with Tailwind-styled containers. It supports responsive containers out of the box.

```tsx
// components/analytics/RoomUtilizationChart.tsx
'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts'

interface RoomUtilizationData {
  roomCode:    string
  utilization: number  // 0–100
}

export function RoomUtilizationChart({ data }: { data: RoomUtilizationData[] }) {
  return (
    <div className="bg-surface-card rounded-xl border border-border p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Room Utilization</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="roomCode" tick={{ fontSize: 12, fill: '#64748B' }} />
          <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 12, fill: '#64748B' }} domain={[0, 100]} />
          <Tooltip
            formatter={(value: number) => [`${value.toFixed(1)}%`, 'Utilization']}
            contentStyle={{
              background: '#fff', border: '1px solid #E2E8F0',
              borderRadius: '8px', fontSize: '12px'
            }}
          />
          <Bar dataKey="utilization" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.utilization >= 80 ? '#1B4332' : entry.utilization >= 50 ? '#52B788' : '#E2E8F0'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

#### KPI Card Component

```tsx
// components/analytics/KPICard.tsx
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KPICardProps {
  title:   string
  value:   string | number
  change?: { value: number; label: string }
  icon:    LucideIcon
  variant?: 'default' | 'accent' | 'success' | 'error'
}

export function KPICard({ title, value, change, icon: Icon, variant = 'default' }: KPICardProps) {
  const variantStyles = {
    default: 'bg-primary text-white',
    accent:  'bg-accent text-primary-dark',
    success: 'bg-primary-muted/10 text-primary-muted border border-primary-muted/20',
    error:   'bg-error/10 text-error border border-error/20',
  }

  return (
    <div className="bg-surface-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-text-secondary">{title}</p>
          <p className="mt-1 text-2xl font-bold text-text-primary">{value}</p>
          {change && (
            <p className={cn('mt-1 text-xs font-medium', change.value >= 0 ? 'text-primary-muted' : 'text-error')}>
              {change.value >= 0 ? '+' : ''}{change.value}% {change.label}
            </p>
          )}
        </div>
        <div className={cn('p-2.5 rounded-lg', variantStyles[variant])}>
          <Icon size={20} strokeWidth={1.75} />
        </div>
      </div>
    </div>
  )
}
```

---

### Phase 5: Dynamic QR Code Infrastructure

**Duration:** Sprint 11–12 (2 weeks)
**Goal:** Each physical room gets a permanent, scannable QR code that shows the real-time daily schedule for that room.

#### Deliverables

- [ ] Permanent room URLs (`/room/[roomCode]`)
- [ ] QR code generation (per-room, printable)
- [ ] Real-time room schedule page (mobile-optimized, no auth required)
- [ ] QR code management UI (print, download, regenerate)
- [ ] Room schedule display with current/next class indicator

#### Public Room Page

```tsx
// app/room/[roomCode]/page.tsx
import { db } from '@/lib/db'
import { getTodaySchedule } from '@/lib/services/rooms'
import { RoomScheduleView } from '@/components/qr/RoomScheduleView'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ roomCode: string }>
}

// Revalidate every 5 minutes
export const revalidate = 300

export default async function RoomPage({ params }: Props) {
  const { roomCode } = await params

  const room = await db.room.findUnique({
    where: { code: roomCode },
    include: { building: true },
  })

  if (!room || !room.isActive) notFound()

  const todayEntries = await getTodaySchedule(room.id)

  return (
    <div className="min-h-screen bg-surface">
      {/* SLSU branded header */}
      <header className="bg-primary px-4 py-4 flex items-center gap-3">
        <img src="/logo/slsu-logo-white.svg" alt="SLSU" className="h-10 w-10" />
        <div>
          <p className="text-white/70 text-xs font-medium">iSched · SLSU Lucban</p>
          <h1 className="text-white text-lg font-bold">{room.name}</h1>
          <p className="text-accent text-sm">{room.building.name} · Capacity: {room.capacity}</p>
        </div>
      </header>

      <RoomScheduleView room={room} entries={todayEntries} />
    </div>
  )
}
```

#### QR Code Generation

```typescript
// lib/services/qr.ts
import QRCode from 'qrcode'

export async function generateRoomQRCode(roomId: string, roomCode: string): Promise<string> {
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/room/${roomCode}`

  const qrSvg = await QRCode.toString(url, {
    type:          'svg',
    color:         { dark: '#1B4332', light: '#FFFFFF' },
    margin:        2,
    errorCorrectionLevel: 'H',
  })

  // Persist to DB
  await db.roomQRCode.upsert({
    where: { roomId },
    create: { roomId, permanentUrl: url, qrImageData: qrSvg },
    update: { qrImageData: qrSvg, generatedAt: new Date() },
  })

  return qrSvg
}

export async function generateAllRoomQRCodes(): Promise<void> {
  const rooms = await db.room.findMany({ where: { isActive: true } })
  await Promise.all(rooms.map(r => generateRoomQRCode(r.id, r.code)))
}
```

---

### Phase 6: Quality Evaluation & Deployment

**Duration:** Sprint 13–14 (2 weeks)
**Goal:** Comprehensive ISO 25010:2023 evaluation, stakeholder testing, bug fixing, and production deployment.

#### Deliverables

- [ ] ISO 25010:2023 evaluation instruments (surveys, test cases)
- [ ] User Acceptance Testing (UAT) with SLSU stakeholders
- [ ] Performance testing (Lighthouse, load testing)
- [ ] Security audit (OWASP checklist, Supabase security)
- [ ] Production deployment (Vercel + managed PostgreSQL)
- [ ] Documentation (user manual, API docs)
- [ ] Final bug fixes from evaluation feedback

---

## 7. UI/UX Design Guidelines

### 7.1 Page Layout Principles

1. **Content-first**: Maximum 1200px content width within a full-width container
2. **Consistent spacing**: Use 24px (`p-6`) as the standard page padding
3. **Card-based sections**: Group related content in `rounded-xl border border-border bg-surface-card shadow-sm` cards
4. **Visual hierarchy**: H1 (page title) → H2 (section headers) → H3 (card titles) → body text
5. **Empty states**: Always provide helpful empty state illustrations with clear CTAs

### 7.2 Interaction Patterns

| Pattern | Implementation |
|---|---|
| Data tables | Shadcn `DataTable` with TanStack Table v8, sortable columns, search/filter |
| Forms | React Hook Form + Zod validation, inline error messages, clear labels |
| Modals | Shadcn `Dialog` for confirmations; `Sheet` (side-panel) for creation forms |
| Toasts | Shadcn `Sonner` for success/error/info notifications |
| Loading states | Skeleton loaders matching the actual content shape |
| Empty states | SVG illustration + descriptive text + primary CTA button |
| Confirmations | Dialog with clear primary action in `bg-error` for destructive actions |

### 7.3 Calendar Color Coding

| Category | Color | Example |
|---|---|---|
| Lecture class | `#1B4332` (primary green) | Regular subjects |
| Laboratory class | `#2D6A4F` (primary light) | Lab sessions |
| Conflict entry | `#DC2626` (error red) | Overlapping entries |
| Draft/pending | `#94A3B8` (slate) | Unapproved entries |
| Selected entry | `#D4AF37` (accent gold) | Focused/selected item |

### 7.4 Responsive Breakpoints

```css
/* Tailwind breakpoints (mobile-first) */
sm:  640px  → Single column → 2 column layout
md:  768px  → Sidebar collapses to icon rail
lg:  1024px → Full sidebar visible
xl:  1280px → Wide content areas, side-by-side panels
2xl: 1536px → Maximum content width applied
```

### 7.5 Accessibility

- All interactive elements have `focus-visible:ring-2 ring-accent ring-offset-2`
- Color contrast ratio ≥ 4.5:1 for all text (WCAG AA)
- Icons always paired with accessible text (`aria-label` or visible label)
- Form inputs always have associated `<label>` elements
- Loading states use `aria-busy` and `role="status"`

---

## 8. API Design

### 8.1 Route Handler Conventions

```
GET    /api/schedules                    → List schedules (with filters)
POST   /api/schedules                    → Create schedule
GET    /api/schedules/[id]               → Get schedule details
PATCH  /api/schedules/[id]               → Update schedule
DELETE /api/schedules/[id]               → Delete schedule
POST   /api/schedules/[id]/generate      → Run backtracking algorithm
POST   /api/schedules/[id]/publish       → Publish schedule
GET    /api/schedules/[id]/conflicts     → Get conflicts for schedule
GET    /api/schedules/[id]/entries       → Get all entries
POST   /api/schedules/[id]/entries       → Add single entry
PATCH  /api/schedules/[id]/entries/[eid] → Update entry (drag/drop)
DELETE /api/schedules/[id]/entries/[eid] → Remove entry

GET    /api/faculty                      → List faculty
POST   /api/faculty                      → Create faculty profile
GET    /api/faculty/[id]/availability    → Get availability
PUT    /api/faculty/[id]/availability    → Set availability (bulk replace)

GET    /api/rooms                        → List rooms (filter: type, building)
GET    /api/rooms/[id]/schedule          → Today's schedule for room
POST   /api/rooms/[id]/qr               → Generate/regenerate QR

GET    /api/analytics/utilization        → Room utilization stats
GET    /api/analytics/faculty-loads      → Faculty load summary
GET    /api/analytics/coverage           → Schedule coverage by dept
```

### 8.2 Standard Response Format

```typescript
// Consistent API response envelope
interface ApiResponse<T> {
  data:    T | null
  error:   string | null
  meta?:   { total?: number; page?: number; perPage?: number }
}

// Helper
export function apiResponse<T>(data: T, meta?: ApiResponse<T>['meta']): ApiResponse<T> {
  return { data, error: null, meta }
}

export function apiError(message: string): ApiResponse<null> {
  return { data: null, error: message }
}
```

### 8.3 Zod Validation Schemas

```typescript
// lib/validations/schedule.ts
import { z } from 'zod'

export const CreateScheduleSchema = z.object({
  semesterId: z.string().cuid(),
})

export const CreateScheduleEntrySchema = z.object({
  subjectId:  z.string().cuid(),
  facultyId:  z.string().cuid(),
  roomId:     z.string().cuid(),
  sectionId:  z.string().cuid(),
  day:        z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']),
  startTime:  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime:    z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).refine(data => data.startTime < data.endTime, {
  message: 'Start time must be before end time',
  path: ['startTime'],
})

export const GenerateScheduleSchema = z.object({
  semesterId: z.string().cuid(),
  constraints: z.object({
    maxDailyHours:   z.number().min(1).max(12).default(8),
    maxWeeklyUnits:  z.number().min(1).max(30).default(21),
    preferMorning:   z.boolean().default(false),
    noBackToBackLab: z.boolean().default(true),
  }).optional(),
})
```

---

## 9. Scheduling Algorithm Design

### 9.1 Constraint Categories

**Hard Constraints** (must not be violated):
- No faculty double-booking (same faculty, overlapping timeslot)
- No room double-booking (same room, overlapping timeslot)
- No section double-booking (same section, overlapping timeslot)
- Faculty availability windows must be respected
- Room type must match subject requirement (lab for lab subjects)
- Room capacity must accommodate section size

**Soft Constraints** (minimize violations):
- Prefer morning-to-noon schedule distribution
- Avoid back-to-back laboratory sessions
- Distribute faculty load evenly across days
- Minimize gaps in student daily schedules
- Prefer contiguous lab time blocks

### 9.2 Algorithm Flow

```
1. Data Preparation
   ├── Load: subjects, faculty, rooms, sections, availability
   ├── Sort subjects by: lab first (harder to place), then by units DESC
   └── Generate: all (subject × faculty × room × section × day × timeslot) candidates

2. Domain Initialization (per subject)
   ├── Filter by faculty eligibility (specialization match)
   ├── Filter by room type compatibility
   ├── Filter by faculty availability
   └── Filter by room capacity ≥ section capacity

3. MRV Ordering
   └── Re-order subjects: smallest domain first

4. Backtracking Loop
   ├── For current unassigned subject:
   │   ├── Apply LCV to order candidates
   │   ├── For each candidate:
   │   │   ├── Check hard constraints (isConsistent)
   │   │   ├── If consistent: assign + forward-check (prune domains)
   │   │   ├── Recurse to next subject
   │   │   └── If failure: unassign + restore domains
   │   └── If no candidate works: return failure (trigger backtrack)
   └── If all assigned: return complete schedule

5. Result Persistence
   ├── Bulk-insert ScheduleEntry records
   ├── Log to ConflictLog (any soft constraint violations)
   └── Set schedule status = DRAFT
```

### 9.3 Time Slot Grid

| Period | Timeslot | Duration |
|---|---|---|
| Morning 1 | 07:00–08:00 | 1 hr |
| Morning 2 | 08:00–09:00 | 1 hr |
| Morning 3 | 09:00–10:00 | 1 hr |
| Morning 4 | 10:00–11:00 | 1 hr |
| Morning 5 | 11:00–12:00 | 1 hr |
| Noon | 12:00–13:00 | 1 hr (break) |
| Afternoon 1 | 13:00–14:00 | 1 hr |
| Afternoon 2 | 14:00–15:00 | 1 hr |
| Afternoon 3 | 15:00–16:00 | 1 hr |
| Afternoon 4 | 16:00–17:00 | 1 hr |
| Evening 1 | 17:00–18:00 | 1 hr |
| Evening 2 | 18:00–19:00 | 1 hr |
| Evening 3 | 19:00–20:00 | 1 hr |

---

## 10. Quality Evaluation Plan

### 10.1 ISO 25010:2023 Quality Characteristics

| Characteristic | Sub-characteristics | Evaluation Method |
|---|---|---|
| **Functional Suitability** | Completeness, Correctness, Appropriateness | Test cases, Stakeholder UAT |
| **Performance Efficiency** | Time behavior, Resource utilization, Capacity | Lighthouse, k6 load testing |
| **Compatibility** | Coexistence, Interoperability | Cross-browser testing (Chrome, Firefox, Edge, Safari) |
| **Interaction Capability** | Appropriateness, Learnability, Operability, Error protection, Accessibility, User engagement | SUS survey, task completion tests |
| **Reliability** | Faultlessness, Availability, Fault tolerance, Recoverability | Uptime monitoring, chaos testing |
| **Security** | Confidentiality, Integrity, Non-repudiation, Accountability, Authenticity, Resistance | OWASP checklist, Supabase audit logs |
| **Maintainability** | Modularity, Reusability, Analysability, Modifiability, Testability | Code coverage, cyclomatic complexity |
| **Flexibility** | Adaptability, Scalability, Installability, Replaceability | Load testing, config-change testing |

### 10.2 Evaluation Instruments

**Quantitative (Performance)**
- Google Lighthouse: target ≥ 90 for all scores
- First Contentful Paint: ≤ 1.5s
- Time to Interactive: ≤ 3.5s
- Schedule generation time: ≤ 30s for full semester

**Qualitative (Usability)**
- System Usability Scale (SUS) questionnaire
- Target: SUS score ≥ 75 (Good)
- Respondents: Department Chairs, Program Heads, Faculty, Students (n ≥ 30)

**Functional Testing**
- Test case matrix covering all CRUD operations
- Algorithm correctness: verify no hard constraint violations in output
- Conflict detection accuracy: 100% detection rate

### 10.3 Testing Strategy

```
Unit Tests        → Jest + Testing Library (individual services, utilities)
Integration Tests → Jest + Prisma test DB (API routes, DB queries)
E2E Tests         → Playwright (critical user flows per role)
Load Tests        → k6 (concurrent users: target 50+ simultaneous)
Security          → Manual OWASP Top 10 review + npm audit
```

---

## 11. Recommended Enhancements

The following enhancements are recommended beyond the original development plan:

### 11.1 State Management — Zustand

Add lightweight client-side state management for schedule editing:

```bash
npm install zustand
```

```typescript
// stores/schedule.store.ts
import { create } from 'zustand'

interface ScheduleStore {
  selectedEntryId: string | null
  pendingChanges:  Map<string, Partial<ScheduleEntry>>
  isDirty:         boolean
  selectEntry:     (id: string | null) => void
  updateEntry:     (id: string, changes: Partial<ScheduleEntry>) => void
  resetChanges:    () => void
}

export const useScheduleStore = create<ScheduleStore>((set) => ({
  selectedEntryId: null,
  pendingChanges:  new Map(),
  isDirty:         false,
  selectEntry:     (id) => set({ selectedEntryId: id }),
  updateEntry:     (id, changes) => set(state => {
    const next = new Map(state.pendingChanges)
    next.set(id, { ...(next.get(id) ?? {}), ...changes })
    return { pendingChanges: next, isDirty: true }
  }),
  resetChanges: () => set({ pendingChanges: new Map(), isDirty: false }),
}))
```

### 11.2 Data Fetching — TanStack Query

Replace manual `useEffect` fetching with TanStack Query for caching, refetching, and loading states:

```bash
npm install @tanstack/react-query
```

```tsx
// hooks/useSchedule.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useSchedule(scheduleId: string) {
  return useQuery({
    queryKey:    ['schedules', scheduleId],
    queryFn:     () => fetch(`/api/schedules/${scheduleId}`).then(r => r.json()),
    staleTime:   1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: false,
  })
}

export function useGenerateSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId: string) =>
      fetch(`/api/schedules/${scheduleId}/generate`, { method: 'POST' }).then(r => r.json()),
    onSuccess: (data, scheduleId) => {
      queryClient.invalidateQueries({ queryKey: ['schedules', scheduleId] })
    },
  })
}
```

### 11.3 Form Management — React Hook Form + Zod

```bash
npm install react-hook-form @hookform/resolvers zod
```

All forms use this pattern:

```tsx
const form = useForm<z.infer<typeof CreateScheduleEntrySchema>>({
  resolver: zodResolver(CreateScheduleEntrySchema),
  defaultValues: { day: 'MONDAY', startTime: '07:00', endTime: '09:00' },
})
```

### 11.4 Export Functionality — React PDF

For schedule PDF export:

```bash
npm install @react-pdf/renderer
```

### 11.5 Notifications — Real-time with SSE

Use Next.js Server-Sent Events for live conflict notifications without WebSockets:

```typescript
// app/api/notifications/stream/route.ts
export async function GET(req: Request) {
  const stream = new ReadableStream({
    start(controller) {
      const interval = setInterval(async () => {
        const notifications = await fetchUnreadNotifications(userId)
        if (notifications.length > 0) {
          controller.enqueue(`data: ${JSON.stringify(notifications)}\n\n`)
        }
      }, 10000) // poll every 10s

      req.signal.addEventListener('abort', () => clearInterval(interval))
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':   'keep-alive',
    }
  })
}
```

### 11.6 Database Performance

Add these indexes beyond what's in the schema:

```prisma
// Additional composite indexes for common queries
@@index([day, startTime, endTime])       // ScheduleEntry — time-range queries
@@index([scheduleId, status])             // Schedule — dashboard filtering
@@index([facultyId, semesterId])          // TeachingLoad — load calculation
```

---

## 12. Sprint Breakdown

| Sprint | Phase | Focus | Weeks |
|---|---|---|---|
| Sprint 1 | Phase 1 | DB schema, Prisma setup, migrations, seed | 1–2 |
| Sprint 2 | Phase 1 | Data migration tooling, Prisma Studio, env setup | 3–4 |
| Sprint 3 | Phase 2 | Clerk integration, webhook sync, auth flow | 5–6 |
| Sprint 4 | Phase 2 | Role dashboards, sidebar, layout, KPI cards | 7–8 |
| Sprint 5 | Phase 3 | FullCalendar setup, entry display, faculty availability | 9–10 |
| Sprint 6 | Phase 3 | Backtracking algorithm core implementation | 11–12 |
| Sprint 7 | Phase 3 | Conflict detection, manual override, drag-drop | 13–14 |
| Sprint 8 | Phase 3 | Approval workflow, export (PDF/Excel) | 15–16 |
| Sprint 9 | Phase 4 | Room utilization analytics, Recharts setup | 17–18 |
| Sprint 10 | Phase 4 | Faculty load charts, coverage reports, export | 19–20 |
| Sprint 11 | Phase 5 | QR code generation, permanent room URLs | 21–22 |
| Sprint 12 | Phase 5 | Mobile-optimized room view, QR print/download | 23–24 |
| Sprint 13 | Phase 6 | UAT, ISO 25010:2023 evaluation, load testing | 25–26 |
| Sprint 14 | Phase 6 | Bug fixes from evaluation, deployment, documentation | 27–28 |

---

## Package Reference

```json
{
  "dependencies": {
    "next":                        "^15.0.0",
    "react":                       "^19.0.0",
    "typescript":                  "^5.6.0",
    "@prisma/client":              "^5.22.0",
    "@supabase/supabase-js":      "^2.99.2",
    "@supabase/ssr":              "^0.9.0",
    "tailwindcss":                 "^3.4.0",
    "@shadcn/ui":                  "latest",
    "lucide-react":                "^0.460.0",
    "@fullcalendar/react":         "^6.1.0",
    "@fullcalendar/timegrid":      "^6.1.0",
    "@fullcalendar/daygrid":       "^6.1.0",
    "@fullcalendar/interaction":   "^6.1.0",
    "recharts":                    "^2.13.0",
    "react-hook-form":             "^7.53.0",
    "@hookform/resolvers":         "^3.9.0",
    "zod":                         "^3.23.0",
    "zustand":                     "^5.0.0",
    "@tanstack/react-query":       "^5.62.0",
    "qrcode":                      "^1.5.4",
    "@react-pdf/renderer":         "^4.0.0",
    "svix":                        "^1.40.0",
    "date-fns":                    "^4.1.0",
    "clsx":                        "^2.1.0",
    "tailwind-merge":              "^2.5.0"
  },
  "devDependencies": {
    "prisma":                      "^5.22.0",
    "@types/qrcode":               "^1.5.0",
    "jest":                        "^29.7.0",
    "@testing-library/react":      "^16.0.0",
    "@playwright/test":            "^1.49.0"
  }
}
```

---

*iSched — Southern Luzon State University Lucban Campus*
*System Plan v1.0 · Generated: 2026-03-12*
