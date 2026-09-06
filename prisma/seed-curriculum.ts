import 'dotenv/config'
import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

// ─── Department IDs ─────────────────────────────────────────────────────────
const CIT_DEPT_ID = 'cmmzovtuu0008qkvu6u4ayhzs'
const CAS_DEPT_ID = 'cmmzovtv10009qkvur7tude03'

// ─── Year Level IDs per Program ─────────────────────────────────────────────
const YL = {
  // BSIT-Garm (Apparel & Fashion Technology)
  GARM_Y1: 'cmmzovu5u0039qkvuuvp5831k',
  GARM_Y2: 'cmmzovu5x003bqkvuulvnxnuu',
  GARM_Y3: 'cmmzovu62003dqkvuy5ecr7tu',
  // BSIT-Auto (Automotive Technology)
  AUTO_Y1: 'cmmzovu3i0025qkvui9f6jdx0',
  AUTO_Y2: 'cmmzovu3q0027qkvuzksorqjf',
  AUTO_Y3: 'cmmzovu3v0029qkvubx1a1b9o',
  // BSIT-Comp (Computer Technology)
  COMP_Y1: 'cmmzovu45002dqkvu23tfhopn',
  COMP_Y2: 'cmmzovu4a002fqkvuy7lny24g',
  COMP_Y3: 'cmmzovu4e002hqkvuesdmpmdq',
  // BSIT-Food (Culinary Technology)
  FOOD_Y1: 'cmmzovu5f0031qkvuu38pezu9',
  FOOD_Y2: 'cmmzovu5j0033qkvuqs9mylts',
  FOOD_Y3: 'cmmzovu5n0035qkvurjz6fex3',
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface SubjectData {
  code: string
  title: string
  units: number
  type: 'LECTURE' | 'LABORATORY'
  semester: 'FIRST' | 'SECOND'
  year: number
  departmentId: string
  yearLevelId: string | null
}

function lec(
  code: string,
  title: string,
  units: number,
  semester: 'FIRST' | 'SECOND',
  year: number,
  departmentId: string,
  yearLevelId: string | null = null,
): SubjectData {
  return { code, title, units, type: 'LECTURE', semester, year, departmentId, yearLevelId }
}

function lab(
  code: string,
  title: string,
  units: number,
  semester: 'FIRST' | 'SECOND',
  year: number,
  departmentId: string,
  yearLevelId: string | null = null,
): SubjectData {
  return { code, title, units, type: 'LABORATORY', semester, year, departmentId, yearLevelId }
}

// ─── All Curriculum Subjects ────────────────────────────────────────────────

const subjects: SubjectData[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // APPAREL & FASHION TECHNOLOGY (BSIT-Garm) — AFT prefix → CIT dept
  // ═══════════════════════════════════════════════════════════════════════════

  // 1st Year, 1st Sem
  lec('AFT01', 'Occupational Safety and Health', 3, 'FIRST', 1, CIT_DEPT_ID, YL.GARM_Y1),
  lec('AFT02', 'Sewing Machine Operations Maintenance & Basic Apparel', 2, 'FIRST', 1, CIT_DEPT_ID, YL.GARM_Y1),
  lab('AFT02L', 'Sewing Machine Operations Maintenance & Basic Apparel Laboratory', 2, 'FIRST', 1, CIT_DEPT_ID, YL.GARM_Y1),
  lec('AFT03', 'Fundamentals of Apparel Construction', 2, 'FIRST', 1, CIT_DEPT_ID, YL.GARM_Y1),
  lab('AFT03L', 'Fundamentals of Apparel Construction Laboratory', 2, 'FIRST', 1, CIT_DEPT_ID, YL.GARM_Y1),
  // 1st Year, 2nd Sem
  lec('AFT04', 'Introduction to Fashion Designing', 1, 'SECOND', 1, CIT_DEPT_ID, YL.GARM_Y1),
  lab('AFT04L', 'Introduction to Fashion Designing Laboratory', 1, 'SECOND', 1, CIT_DEPT_ID, YL.GARM_Y1),
  lec('AFT05', 'Advanced Apparel Construction', 2, 'SECOND', 1, CIT_DEPT_ID, YL.GARM_Y1),
  lab('AFT05L', 'Advanced Apparel Construction Laboratory', 2, 'SECOND', 1, CIT_DEPT_ID, YL.GARM_Y1),

  // 2nd Year, 1st Sem
  lec('AFT06', 'Fashion Arts and Apparel Accessories', 1, 'FIRST', 2, CIT_DEPT_ID, YL.GARM_Y2),
  lab('AFT06L', 'Fashion Arts and Apparel Accessories Laboratory', 1, 'FIRST', 2, CIT_DEPT_ID, YL.GARM_Y2),
  lec('AFT07', 'Creative Costume Design and Construction', 2, 'FIRST', 2, CIT_DEPT_ID, YL.GARM_Y2),
  lab('AFT07L', 'Creative Costume Design and Construction Laboratory', 2, 'FIRST', 2, CIT_DEPT_ID, YL.GARM_Y2),
  lec('AFT08', 'Pattern Standardization and Grading', 1, 'FIRST', 2, CIT_DEPT_ID, YL.GARM_Y2),
  lab('AFT08L', 'Pattern Standardization and Grading Laboratory', 1, 'FIRST', 2, CIT_DEPT_ID, YL.GARM_Y2),
  // 2nd Year, 2nd Sem
  lec('AFT09', 'Tailoring', 2, 'SECOND', 2, CIT_DEPT_ID, YL.GARM_Y2),
  lab('AFT09L', 'Tailoring Laboratory', 2, 'SECOND', 2, CIT_DEPT_ID, YL.GARM_Y2),

  // 3rd Year, 1st Sem
  lec('AFT10', 'Advanced Pattern Drafting/Designing', 1, 'FIRST', 3, CIT_DEPT_ID, YL.GARM_Y3),
  lab('AFT10L', 'Advanced Pattern Drafting/Designing Laboratory', 2, 'FIRST', 3, CIT_DEPT_ID, YL.GARM_Y3),
  lec('AFT11', 'Home Furnishing and Fashion Accessories', 2, 'FIRST', 3, CIT_DEPT_ID, YL.GARM_Y3),
  lab('AFT11L', 'Home Furnishing and Fashion Accessories Laboratory', 2, 'FIRST', 3, CIT_DEPT_ID, YL.GARM_Y3),
  // 3rd Year, 2nd Sem
  lec('AFT12', 'Fabrics and Thread: Selection and Usage', 3, 'SECOND', 3, CIT_DEPT_ID, YL.GARM_Y3),
  lec('AFT13', 'Production Management in Garment Industry', 3, 'SECOND', 3, CIT_DEPT_ID, YL.GARM_Y3),
  lec('AFT14', 'Draping Fashion Modeling and Fashion Show with Hair Styling and Artistic Make-up', 2, 'SECOND', 3, CIT_DEPT_ID, YL.GARM_Y3),
  lab('AFT14L', 'Draping Fashion Modeling and Fashion Show with Hair Styling and Artistic Make-up Laboratory', 2, 'SECOND', 3, CIT_DEPT_ID, YL.GARM_Y3),

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTOMOTIVE TECHNOLOGY (BSIT-Auto) — AIT prefix → CIT dept
  // ═══════════════════════════════════════════════════════════════════════════

  // 1st Year, 1st Sem
  lec('AIT01', 'Occupational Safety and Health', 3, 'FIRST', 1, CIT_DEPT_ID, YL.AUTO_Y1),
  lec('AIT02', 'Fundamentals of Automotive Technology', 2, 'FIRST', 1, CIT_DEPT_ID, YL.AUTO_Y1),
  lab('AIT02L', 'Fundamentals of Automotive Technology Laboratory', 1, 'FIRST', 1, CIT_DEPT_ID, YL.AUTO_Y1),
  lec('AIT03', 'Automotive Electrical System', 2, 'FIRST', 1, CIT_DEPT_ID, YL.AUTO_Y1),
  lab('AIT03L', 'Automotive Electrical System Laboratory', 1, 'FIRST', 1, CIT_DEPT_ID, YL.AUTO_Y1),
  // 1st Year, 2nd Sem
  lec('AIT04', 'Automotive Electronics', 2, 'SECOND', 1, CIT_DEPT_ID, YL.AUTO_Y1),
  lab('AIT04L', 'Automotive Electronics Laboratory', 3, 'SECOND', 1, CIT_DEPT_ID, YL.AUTO_Y1),
  lec('AIT05', 'Small Engine Repair and Motorcycle Servicing', 2, 'SECOND', 1, CIT_DEPT_ID, YL.AUTO_Y1),
  lab('AIT05L', 'Small Engine Repair and Motorcycle Servicing Laboratory', 3, 'SECOND', 1, CIT_DEPT_ID, YL.AUTO_Y1),
  lec('AIT06', 'Car Care Servicing Emission Control and Tune-up', 2, 'SECOND', 1, CIT_DEPT_ID, YL.AUTO_Y1),
  lab('AIT06L', 'Car Care Servicing Emission Control and Tune-up Laboratory', 3, 'SECOND', 1, CIT_DEPT_ID, YL.AUTO_Y1),

  // 2nd Year, 1st Sem
  lec('AIT07', 'Body Repair and Painting', 2, 'FIRST', 2, CIT_DEPT_ID, YL.AUTO_Y2),
  lab('AIT07L', 'Body Repair and Painting Laboratory', 3, 'FIRST', 2, CIT_DEPT_ID, YL.AUTO_Y2),
  lec('AIT08', 'Power Train and Conversion System', 2, 'FIRST', 2, CIT_DEPT_ID, YL.AUTO_Y2),
  lab('AIT08L', 'Power Train and Conversion System Laboratory', 3, 'FIRST', 2, CIT_DEPT_ID, YL.AUTO_Y2),
  lec('AIT09', 'Automotive LPG System', 2, 'FIRST', 2, CIT_DEPT_ID, YL.AUTO_Y2),
  lab('AIT09L', 'Automotive LPG System Laboratory', 3, 'FIRST', 2, CIT_DEPT_ID, YL.AUTO_Y2),
  lec('AIT10', 'Automotive Air Conditioning', 2, 'FIRST', 2, CIT_DEPT_ID, YL.AUTO_Y2),
  lab('AIT10L', 'Automotive Air Conditioning Laboratory', 3, 'FIRST', 2, CIT_DEPT_ID, YL.AUTO_Y2),
  // 2nd Year, 2nd Sem
  lec('AIT11', 'Engine Overhauling and Performance Testing', 2, 'SECOND', 2, CIT_DEPT_ID, YL.AUTO_Y2),
  lab('AIT11L', 'Engine Overhauling and Performance Testing Laboratory', 3, 'SECOND', 2, CIT_DEPT_ID, YL.AUTO_Y2),
  lec('AIT12', 'Hybrid and Electric Vehicle', 2, 'SECOND', 2, CIT_DEPT_ID, YL.AUTO_Y2),
  lab('AIT12L', 'Hybrid and Electric Vehicle Laboratory', 3, 'SECOND', 2, CIT_DEPT_ID, YL.AUTO_Y2),
  lec('AIT13', 'Driving Education', 2, 'SECOND', 2, CIT_DEPT_ID, YL.AUTO_Y2),
  lab('AIT13L', 'Driving Education Laboratory', 1, 'SECOND', 2, CIT_DEPT_ID, YL.AUTO_Y2),

  // 3rd Year, 1st Sem
  lec('AIT14', 'Body Management and Under chassis Electronic Control System', 2, 'FIRST', 3, CIT_DEPT_ID, YL.AUTO_Y3),
  lab('AIT14L', 'Body Management and Under chassis Electronic Control System Laboratory', 3, 'FIRST', 3, CIT_DEPT_ID, YL.AUTO_Y3),
  // 3rd Year, 2nd Sem
  lec('AIT15', 'Automotive Computer-Aided Design', 1, 'SECOND', 3, CIT_DEPT_ID, YL.AUTO_Y3),
  lab('AIT15L', 'Automotive Computer-Aided Design Laboratory', 3, 'SECOND', 3, CIT_DEPT_ID, YL.AUTO_Y3),
  lec('AIT16', 'Electronics Engine Management System', 3, 'SECOND', 3, CIT_DEPT_ID, YL.AUTO_Y3),

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPUTER TECHNOLOGY (BSIT-Comp) — CPT prefix → CIT dept
  // ═══════════════════════════════════════════════════════════════════════════

  // 1st Year, 1st Sem
  lec('CPT02a', 'Fundamentals of Electricity and Electronics', 2, 'FIRST', 1, CIT_DEPT_ID, YL.COMP_Y1),
  lab('CPT02aL', 'Fundamentals of Electricity and Electronics Laboratory', 1, 'FIRST', 1, CIT_DEPT_ID, YL.COMP_Y1),
  lec('CPT04', 'Computer System and Hardware', 2, 'FIRST', 1, CIT_DEPT_ID, YL.COMP_Y1),
  lab('CPT04L', 'Computer System and Hardware Laboratory', 1, 'FIRST', 1, CIT_DEPT_ID, YL.COMP_Y1),
  lec('CPT05', 'Logic and Switching Theory', 1, 'FIRST', 1, CIT_DEPT_ID, YL.COMP_Y1),
  lab('CPT05L', 'Logic and Switching Theory Laboratory', 1, 'FIRST', 1, CIT_DEPT_ID, YL.COMP_Y1),
  // 1st Year, 2nd Sem
  lec('CPT01', 'Occupational Safety and Health', 3, 'SECOND', 1, CIT_DEPT_ID, YL.COMP_Y1),
  lec('CPT08a', 'Computer Installation and Servicing', 2, 'SECOND', 1, CIT_DEPT_ID, YL.COMP_Y1),
  lab('CPT08aL', 'Computer Installation and Servicing Laboratory', 2, 'SECOND', 1, CIT_DEPT_ID, YL.COMP_Y1),
  lec('ITE15', 'Computer Networking I', 2, 'SECOND', 1, CIT_DEPT_ID, YL.COMP_Y1),
  lab('ITE15L', 'Computer Networking I Laboratory', 1, 'SECOND', 1, CIT_DEPT_ID, YL.COMP_Y1),

  // 2nd Year, 1st Sem
  lec('CPT10', 'Specialized Technology 1', 2, 'FIRST', 2, CIT_DEPT_ID, YL.COMP_Y2),
  lab('CPT10L', 'Specialized Technology 1 Laboratory', 1, 'FIRST', 2, CIT_DEPT_ID, YL.COMP_Y2),
  // 2nd Year, 2nd Sem
  lec('CPT14', 'Specialized Technology 2', 2, 'SECOND', 2, CIT_DEPT_ID, YL.COMP_Y2),
  lab('CPT14L', 'Specialized Technology 2 Laboratory', 1, 'SECOND', 2, CIT_DEPT_ID, YL.COMP_Y2),
  lec('CPT16', 'Advanced Programming', 2, 'SECOND', 2, CIT_DEPT_ID, YL.COMP_Y2),
  lab('CPT16L', 'Advanced Programming Laboratory', 2, 'SECOND', 2, CIT_DEPT_ID, YL.COMP_Y2),

  // 3rd Year, 1st Sem
  lec('CPT17', 'Embedded System', 2, 'FIRST', 3, CIT_DEPT_ID, YL.COMP_Y3),
  lab('CPT17L', 'Embedded System Laboratory', 2, 'FIRST', 3, CIT_DEPT_ID, YL.COMP_Y3),
  lec('CPT18', 'Platform Technologies', 2, 'FIRST', 3, CIT_DEPT_ID, YL.COMP_Y3),
  lab('CPT18L', 'Platform Technologies Laboratory', 1, 'FIRST', 3, CIT_DEPT_ID, YL.COMP_Y3),
  lec('CPT19', 'Information Management', 2, 'FIRST', 3, CIT_DEPT_ID, YL.COMP_Y3),
  lab('CPT19L', 'Information Management Laboratory', 1, 'FIRST', 3, CIT_DEPT_ID, YL.COMP_Y3),
  // 3rd Year, 2nd Sem
  lec('ITE28', 'Emerging Technologies', 2, 'SECOND', 3, CIT_DEPT_ID, YL.COMP_Y3),
  lab('ITE28L', 'Emerging Technologies Laboratory', 1, 'SECOND', 3, CIT_DEPT_ID, YL.COMP_Y3),
  lec('CPT11a', 'Seminar in Computer Technology', 1, 'SECOND', 3, CIT_DEPT_ID, YL.COMP_Y3),
  lab('CPT11aL', 'Seminar in Computer Technology Laboratory', 1, 'SECOND', 3, CIT_DEPT_ID, YL.COMP_Y3),
  lec('ITE13a', 'Professional Issues in Computing', 3, 'SECOND', 3, CIT_DEPT_ID, YL.COMP_Y3),

  // ═══════════════════════════════════════════════════════════════════════════
  // CULINARY TECHNOLOGY (BSIT-Food) — CUL prefix → CIT dept
  // ═══════════════════════════════════════════════════════════════════════════

  // 1st Year, 1st Sem
  lec('CUL01', 'Occupational Safety and Health', 3, 'FIRST', 1, CIT_DEPT_ID, YL.FOOD_Y1),
  lec('CUL02', 'Food Safety and Sanitation', 2, 'FIRST', 1, CIT_DEPT_ID, YL.FOOD_Y1),
  lab('CUL02L', 'Food Safety and Sanitation Laboratory', 2, 'FIRST', 1, CIT_DEPT_ID, YL.FOOD_Y1),
  lec('CUL03', 'Kitchen Essential and Basic Food Preparation', 3, 'FIRST', 1, CIT_DEPT_ID, YL.FOOD_Y1),
  // 1st Year, 2nd Sem
  lec('CUL04', 'Advanced Food Preparation', 2, 'SECOND', 1, CIT_DEPT_ID, YL.FOOD_Y1),
  lab('CUL04L', 'Advanced Food Preparation Laboratory', 2, 'SECOND', 1, CIT_DEPT_ID, YL.FOOD_Y1),
  lec('CUL05', 'Food Styling and Design', 2, 'SECOND', 1, CIT_DEPT_ID, YL.FOOD_Y1),
  lab('CUL05L', 'Food Styling and Design Laboratory', 1, 'SECOND', 1, CIT_DEPT_ID, YL.FOOD_Y1),

  // 2nd Year, 1st Sem
  lec('CUL06', 'Advanced Garde Manger', 2, 'FIRST', 2, CIT_DEPT_ID, YL.FOOD_Y2),
  lab('CUL06L', 'Advanced Garde Manger Laboratory', 1, 'FIRST', 2, CIT_DEPT_ID, YL.FOOD_Y2),
  lec('CUL07', 'Introduction to Bakery and Pastry', 2, 'FIRST', 2, CIT_DEPT_ID, YL.FOOD_Y2),
  lab('CUL07L', 'Introduction to Bakery and Pastry Laboratory', 2, 'FIRST', 2, CIT_DEPT_ID, YL.FOOD_Y2),
  // 2nd Year, 2nd Sem
  lec('CUL08', 'Quantity Food Production Planning and Management', 2, 'SECOND', 2, CIT_DEPT_ID, YL.FOOD_Y2),
  lab('CUL08L', 'Quantity Food Production Planning and Management Laboratory', 1, 'SECOND', 2, CIT_DEPT_ID, YL.FOOD_Y2),
  lec('CUL09', 'Wine Beverage and Mixology', 2, 'SECOND', 2, CIT_DEPT_ID, YL.FOOD_Y2),
  lab('CUL09L', 'Wine Beverage and Mixology Laboratory', 1, 'SECOND', 2, CIT_DEPT_ID, YL.FOOD_Y2),

  // 3rd Year, 1st Sem
  lec('CUL10', 'Catering and Events Simulation', 2, 'FIRST', 3, CIT_DEPT_ID, YL.FOOD_Y3),
  lab('CUL10L', 'Catering and Events Simulation Laboratory', 2, 'FIRST', 3, CIT_DEPT_ID, YL.FOOD_Y3),
  lec('CUL11', 'Nutrition and Food Trends', 3, 'FIRST', 3, CIT_DEPT_ID, YL.FOOD_Y3),
  lec('CUL12', 'Philippine Regional Cuisine and Asian Cuisine', 2, 'FIRST', 3, CIT_DEPT_ID, YL.FOOD_Y3),
  lab('CUL12L', 'Philippine Regional Cuisine and Asian Cuisine Laboratory', 1, 'FIRST', 3, CIT_DEPT_ID, YL.FOOD_Y3),
  // 3rd Year, 2nd Sem
  lec('CUL13', 'Western Cuisine', 2, 'SECOND', 3, CIT_DEPT_ID, YL.FOOD_Y3),
  lab('CUL13L', 'Western Cuisine Laboratory', 1, 'SECOND', 3, CIT_DEPT_ID, YL.FOOD_Y3),
  lec('CUL14', 'Plant-based Cooking', 2, 'SECOND', 3, CIT_DEPT_ID, YL.FOOD_Y3),
  lab('CUL14L', 'Plant-based Cooking Laboratory', 1, 'SECOND', 3, CIT_DEPT_ID, YL.FOOD_Y3),

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED CIT SUBJECTS — no yearLevelId (department-wide)
  // ═══════════════════════════════════════════════════════════════════════════

  // Year 1
  lec('IIT01', 'Introduction to Information Technology', 2, 'FIRST', 1, CIT_DEPT_ID),
  lab('IIT01L', 'Introduction to Information Technology Laboratory', 1, 'FIRST', 1, CIT_DEPT_ID),
  lec('COM01a', 'Computer Programming', 2, 'FIRST', 1, CIT_DEPT_ID),
  lab('COM01aL', 'Computer Programming Laboratory', 1, 'FIRST', 1, CIT_DEPT_ID),
  lec('IND01', 'Industrial Drawing', 1, 'FIRST', 1, CIT_DEPT_ID),
  lab('IND01L', 'Industrial Drawing Laboratory', 1, 'FIRST', 1, CIT_DEPT_ID),

  // Year 2
  lec('CHM01a', 'Chemistry for Industrial Technologist', 2, 'FIRST', 2, CIT_DEPT_ID),
  lab('CHM01aL', 'Chemistry for Industrial Technologist Laboratory', 1, 'FIRST', 2, CIT_DEPT_ID),
  lec('MAT04a', 'Comprehensive Mathematics', 5, 'FIRST', 2, CIT_DEPT_ID),
  lec('PHY01a', 'Physics for Industrial Technologist', 2, 'FIRST', 2, CIT_DEPT_ID),
  lab('PHY01aL', 'Physics for Industrial Technologist Laboratory', 1, 'FIRST', 2, CIT_DEPT_ID),

  // Year 3
  lec('RES01a', 'Project Study 1 with Intellectual Property Rights', 2, 'FIRST', 3, CIT_DEPT_ID),
  lab('RES01aL', 'Project Study 1 with Intellectual Property Rights Laboratory', 1, 'FIRST', 3, CIT_DEPT_ID),
  lec('PSY11a', 'Industrial Psychology', 3, 'FIRST', 3, CIT_DEPT_ID),
  lec('MTM01', 'Materials Technology Management', 3, 'FIRST', 3, CIT_DEPT_ID),
  lec('IEN08a', 'Quality Control and Assurance', 3, 'FIRST', 3, CIT_DEPT_ID),
  lec('IEN04a', 'Industrial Organization and Management', 3, 'FIRST', 3, CIT_DEPT_ID),
  lec('IEN11a', 'Production Management', 3, 'FIRST', 3, CIT_DEPT_ID),
  lec('MGT02', 'Technopreneurship', 3, 'FIRST', 3, CIT_DEPT_ID),
  lec('FLO01', 'Foreign Language', 3, 'FIRST', 3, CIT_DEPT_ID),
  lec('RES02a', 'Project Study 2', 2, 'SECOND', 3, CIT_DEPT_ID),
  lab('RES02aL', 'Project Study 2 Laboratory', 1, 'SECOND', 3, CIT_DEPT_ID),

  // ═══════════════════════════════════════════════════════════════════════════
  // GEC / GEL / PATHFIT / NST — CAS department, no yearLevelId
  // ═══════════════════════════════════════════════════════════════════════════

  // Year 1
  lec('GEC01', 'The Life and Works of Rizal', 3, 'FIRST', 1, CAS_DEPT_ID),
  lec('GEC02', 'Understanding the Self', 3, 'FIRST', 1, CAS_DEPT_ID),
  lec('GEC04', 'The Contemporary World', 3, 'FIRST', 1, CAS_DEPT_ID),
  lec('GEC05', 'Mathematics in the Modern World', 3, 'FIRST', 1, CAS_DEPT_ID),
  lec('NST01', 'National Service Training Program 1', 3, 'FIRST', 1, CAS_DEPT_ID),
  lec('NST02', 'National Service Training Program 2', 3, 'SECOND', 1, CAS_DEPT_ID),
  lec('PATHFit01', 'Movement Skill Training', 2, 'FIRST', 1, CAS_DEPT_ID),
  lec('PATHFit02', 'Fitness and Wellness Activities', 2, 'SECOND', 1, CAS_DEPT_ID),

  // Year 2
  lec('GEC03', 'Readings in the Philippine History', 3, 'FIRST', 2, CAS_DEPT_ID),
  lec('GEC06', 'Purposive Communication', 3, 'FIRST', 2, CAS_DEPT_ID),
  lec('GEC07', 'Art Appreciation', 3, 'FIRST', 2, CAS_DEPT_ID),
  lec('GEC08', 'Science Technology and Society', 3, 'FIRST', 2, CAS_DEPT_ID),
  lec('GEC09', 'Ethics', 3, 'FIRST', 2, CAS_DEPT_ID),
  lec('GEL01', 'Environmental Science', 3, 'FIRST', 2, CAS_DEPT_ID),
  lec('GEL07', 'Gender and Society', 3, 'FIRST', 2, CAS_DEPT_ID),
  lec('GEL10', 'Philippine Popular Culture', 3, 'FIRST', 2, CAS_DEPT_ID),
  lec('PATHFit03', 'Rhythmic Activities and/or Sports', 2, 'FIRST', 2, CAS_DEPT_ID),
  lec('PATHFit04', 'Recreational Activities', 2, 'SECOND', 2, CAS_DEPT_ID),
]

// ─── Main Seed Function ─────────────────────────────────────────────────────

async function main() {
  console.log('=== Seeding Curriculum Subjects ===\n')

  let added = 0
  let skipped = 0
  let errors = 0

  for (const s of subjects) {
    const roomType: ('LECTURE_ROOM' | 'LABORATORY')[] =
      s.type === 'LABORATORY' ? ['LABORATORY'] : ['LECTURE_ROOM']

    try {
      const result = await db.subject.upsert({
        where: { code: s.code },
        update: {},
        create: {
          code: s.code,
          title: s.title,
          units: s.units,
          hoursPerWeek: s.units,
          type: s.type,
          semester: s.semester,
          year: s.year,
          departmentId: s.departmentId,
          yearLevelId: s.yearLevelId,
          requiredRoomType: roomType,
        },
      })

      // If the record was just created, its createdAt will be very recent
      const isNew = (Date.now() - result.createdAt.getTime()) < 5000
      if (isNew) {
        added++
        console.log(`  [ADDED]   ${s.code} — ${s.title} (${s.units}u ${s.type})`)
      } else {
        skipped++
        console.log(`  [EXISTS]  ${s.code} — ${s.title}`)
      }
    } catch (err: any) {
      errors++
      console.error(`  [ERROR]   ${s.code} — ${err.message}`)
    }
  }

  console.log('\n=== Seed Summary ===')
  console.log(`  Total subjects: ${subjects.length}`)
  console.log(`  Added:   ${added}`)
  console.log(`  Skipped: ${skipped}`)
  console.log(`  Errors:  ${errors}`)
  console.log('\nDone!')
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
