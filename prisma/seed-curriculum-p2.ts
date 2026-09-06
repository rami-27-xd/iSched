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
  // BSIT-Eltx (Electronics Technology)
  ELTX_Y1: 'cmmzovu50002tqkvu7j0h0j1v',
  ELTX_Y2: 'cmmzovu54002vqkvu51jnnahy',
  ELTX_Y3: 'cmmzovu59002xqkvuuuu8ooq9',
  ELTX_Y4: 'cmmzovu5c002zqkvuualwcrfl',
  // BSIT-Elec (Electrical Technology)
  ELEC_Y1: 'cmmzovu4m002lqkvubshz43he',
  ELEC_Y2: 'cmmzovu4q002nqkvu9f5kpp0x',
  ELEC_Y3: 'cmmzovu4t002pqkvuttv3f6gf',
  ELEC_Y4: 'cmmzovu4w002rqkvua6oohxxd',
  // BSIT-Mech (Mechanical Technology)
  MECH_Y1: 'cmmzovu6r003pqkvuv5p2k36w',
  MECH_Y2: 'cmmzovu6v003rqkvu0i6ipr31',
  MECH_Y3: 'cmmzovu6z003tqkvurfvirc0m',
  MECH_Y4: 'cmmzovu73003vqkvuwejfv9yo',
  // BSIT-ID (Industrial Design / Print Media)
  ID_Y1: 'cmmzovu6b003hqkvuq8q25q11',
  ID_Y2: 'cmmzovu6e003jqkvuqgi94f3a',
  ID_Y3: 'cmmzovu6i003lqkvues1rf9eg',
  ID_Y4: 'cmmzovu6o003nqkvumsretud1',
  // BSInfoTech (BS Information Technology)
  IT_Y1: 'cmmzovu77003xqkvu3acdzr5f',
  IT_Y2: 'cmmzovu7b003zqkvur0clqtee',
  IT_Y3: 'cmmzovu7f0041qkvulpd0pgu3',
  IT_Y4: 'cmmzovu7j0043qkvuvug45ndm',
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

// ─── All Curriculum P2 Subjects ─────────────────────────────────────────────

const subjects: SubjectData[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // ELECTRONICS TECHNOLOGY (BSIT-Eltx) — ELX prefix → CIT dept
  // ═══════════════════════════════════════════════════════════════════════════

  // 1st Year, 1st Sem
  lec('ELX01', 'Occupational Safety and Health', 3, 'FIRST', 1, CIT_DEPT_ID, YL.ELTX_Y1),
  lec('ELX02', 'Electronic Devices 1', 3, 'FIRST', 1, CIT_DEPT_ID, YL.ELTX_Y1),
  lab('ELX02L', 'Electronic Devices 1 Laboratory', 6, 'FIRST', 1, CIT_DEPT_ID, YL.ELTX_Y1),
  lec('ELX03', 'Electronics Communication 1', 2, 'FIRST', 1, CIT_DEPT_ID, YL.ELTX_Y1),
  lab('ELX03L', 'Electronics Communication 1 Laboratory', 3, 'FIRST', 1, CIT_DEPT_ID, YL.ELTX_Y1),
  lec('ELX04', 'Electronics CAD', 1, 'FIRST', 1, CIT_DEPT_ID, YL.ELTX_Y1),
  lab('ELX04L', 'Electronics CAD Laboratory', 3, 'FIRST', 1, CIT_DEPT_ID, YL.ELTX_Y1),
  // 1st Year, 2nd Sem
  lec('ELX05', 'Electronic Devices 2', 2, 'SECOND', 1, CIT_DEPT_ID, YL.ELTX_Y1),
  lab('ELX05L', 'Electronic Devices 2 Laboratory', 3, 'SECOND', 1, CIT_DEPT_ID, YL.ELTX_Y1),
  lec('ELX06', 'Electronic Communications 2', 2, 'SECOND', 1, CIT_DEPT_ID, YL.ELTX_Y1),
  lab('ELX06L', 'Electronic Communications 2 Laboratory', 3, 'SECOND', 1, CIT_DEPT_ID, YL.ELTX_Y1),
  lec('ELX07', 'Digital Electronics', 2, 'SECOND', 1, CIT_DEPT_ID, YL.ELTX_Y1),
  lab('ELX07L', 'Digital Electronics Laboratory', 3, 'SECOND', 1, CIT_DEPT_ID, YL.ELTX_Y1),

  // 2nd Year, 1st Sem
  lec('ELX08', 'Instrumentation and Process Control', 2, 'FIRST', 2, CIT_DEPT_ID, YL.ELTX_Y2),
  lab('ELX08L', 'Instrumentation and Process Control Laboratory', 3, 'FIRST', 2, CIT_DEPT_ID, YL.ELTX_Y2),
  lec('ELX09', 'Sensor Technology', 2, 'FIRST', 2, CIT_DEPT_ID, YL.ELTX_Y2),
  lab('ELX09L', 'Sensor Technology Laboratory', 3, 'FIRST', 2, CIT_DEPT_ID, YL.ELTX_Y2),
  lec('ELX10', 'Electronic Laws and Standards', 3, 'FIRST', 2, CIT_DEPT_ID, YL.ELTX_Y2),
  // 2nd Year, 2nd Sem
  lec('ELX11', 'Multimedia Systems', 2, 'SECOND', 2, CIT_DEPT_ID, YL.ELTX_Y2),
  lab('ELX11L', 'Multimedia Systems Laboratory', 3, 'SECOND', 2, CIT_DEPT_ID, YL.ELTX_Y2),
  lec('ELX12', 'Industrial Electronics', 2, 'SECOND', 2, CIT_DEPT_ID, YL.ELTX_Y2),
  lab('ELX12L', 'Industrial Electronics Laboratory', 3, 'SECOND', 2, CIT_DEPT_ID, YL.ELTX_Y2),
  lec('ELX13', 'Electro-Pneumatic Systems', 2, 'SECOND', 2, CIT_DEPT_ID, YL.ELTX_Y2),
  lab('ELX13L', 'Electro-Pneumatic Systems Laboratory', 3, 'SECOND', 2, CIT_DEPT_ID, YL.ELTX_Y2),

  // ═══════════════════════════════════════════════════════════════════════════
  // ELECTRICAL TECHNOLOGY (BSIT-Elec) — ELT prefix → CIT dept
  // ═══════════════════════════════════════════════════════════════════════════

  // 1st Year, 1st Sem
  lec('ELT01', 'Occupational Safety and Health', 3, 'FIRST', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lec('ELT02', 'Electricity and Electronics Principles', 1, 'FIRST', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lab('ELT02L', 'Electricity and Electronics Principles Laboratory', 3, 'FIRST', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lec('ELT03', 'DC Circuits', 1, 'FIRST', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lab('ELT03L', 'DC Circuits Laboratory', 3, 'FIRST', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lec('ELT04', 'Shop Process Tools and Equipment', 1, 'FIRST', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lab('ELT04L', 'Shop Process Tools and Equipment Laboratory', 3, 'FIRST', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lec('ELT05', 'Philippine Electrical Code', 2, 'FIRST', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lec('ELT06', 'Residential Wiring System', 1, 'FIRST', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lab('ELT06L', 'Residential Wiring System Laboratory', 6, 'FIRST', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  // 1st Year, 2nd Sem
  lec('ELT07', 'AC Circuits', 2, 'SECOND', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lab('ELT07L', 'AC Circuits Laboratory', 3, 'SECOND', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lec('ELT08', 'Industrial Wiring System', 1, 'SECOND', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lab('ELT08L', 'Industrial Wiring System Laboratory', 6, 'SECOND', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lec('ELT09', 'Electrical Instruments and Measurement', 2, 'SECOND', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lab('ELT09L', 'Electrical Instruments and Measurement Laboratory', 3, 'SECOND', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lec('ELT10', 'Electrical Machines', 1, 'SECOND', 1, CIT_DEPT_ID, YL.ELEC_Y1),
  lab('ELT10L', 'Electrical Machines Laboratory', 6, 'SECOND', 1, CIT_DEPT_ID, YL.ELEC_Y1),

  // 2nd Year, 1st Sem
  lec('ELT11', 'Transmission and Distribution System', 2, 'FIRST', 2, CIT_DEPT_ID, YL.ELEC_Y2),
  lab('ELT11L', 'Transmission and Distribution System Laboratory', 3, 'FIRST', 2, CIT_DEPT_ID, YL.ELEC_Y2),
  lec('ELT12', 'Industrial Motor Controllers', 1, 'FIRST', 2, CIT_DEPT_ID, YL.ELEC_Y2),
  lab('ELT12L', 'Industrial Motor Controllers Laboratory', 3, 'FIRST', 2, CIT_DEPT_ID, YL.ELEC_Y2),
  lec('ELT13', 'Power Production and Management Systems', 1, 'FIRST', 2, CIT_DEPT_ID, YL.ELEC_Y2),
  lab('ELT13L', 'Power Production and Management Systems Laboratory', 3, 'FIRST', 2, CIT_DEPT_ID, YL.ELEC_Y2),
  // 2nd Year, 2nd Sem
  lec('ELT14', 'Logic Circuits', 1, 'SECOND', 2, CIT_DEPT_ID, YL.ELEC_Y2),
  lab('ELT14L', 'Logic Circuits Laboratory', 3, 'SECOND', 2, CIT_DEPT_ID, YL.ELEC_Y2),
  lec('ELT15', 'Electrical Computer Aided Design', 1, 'SECOND', 2, CIT_DEPT_ID, YL.ELEC_Y2),
  lab('ELT15L', 'Electrical Computer Aided Design Laboratory', 3, 'SECOND', 2, CIT_DEPT_ID, YL.ELEC_Y2),
  lec('ELT16', 'Programmable Logic Controllers', 2, 'SECOND', 2, CIT_DEPT_ID, YL.ELEC_Y2),
  lab('ELT16L', 'Programmable Logic Controllers Laboratory', 3, 'SECOND', 2, CIT_DEPT_ID, YL.ELEC_Y2),

  // 3rd Year, 1st Sem — SHARED between Electronics & Electrical (no yearLevelId)
  lec('ELT17', 'Electro-Pneumatic Systems', 2, 'FIRST', 3, CIT_DEPT_ID),
  lab('ELT17L', 'Electro-Pneumatic Systems Laboratory', 3, 'FIRST', 3, CIT_DEPT_ID),
  // 3rd Year, 2nd Sem — SHARED between Electronics & Electrical (no yearLevelId)
  lec('ELT18', 'Instrumentation and Process Control', 2, 'SECOND', 3, CIT_DEPT_ID),
  lab('ELT18L', 'Instrumentation and Process Control Laboratory', 3, 'SECOND', 3, CIT_DEPT_ID),

  // ═══════════════════════════════════════════════════════════════════════════
  // MECHANICAL TECHNOLOGY (BSIT-Mech) — MET prefix → CIT dept
  // ═══════════════════════════════════════════════════════════════════════════

  // 1st Year, 1st Sem
  lec('MET01', 'Occupational Health and Safety', 3, 'FIRST', 1, CIT_DEPT_ID, YL.MECH_Y1),
  lec('MET02', 'Basic Arc and Gas Welding Practices', 2, 'FIRST', 1, CIT_DEPT_ID, YL.MECH_Y1),
  lab('MET02L', 'Basic Arc and Gas Welding Practices Laboratory', 2, 'FIRST', 1, CIT_DEPT_ID, YL.MECH_Y1),
  lec('MET03', 'Bench working: Pipefitting and Pipe Bending', 2, 'FIRST', 1, CIT_DEPT_ID, YL.MECH_Y1),
  lab('MET03L', 'Bench working: Pipefitting and Pipe Bending Laboratory', 2, 'FIRST', 1, CIT_DEPT_ID, YL.MECH_Y1),
  // 1st Year, 2nd Sem
  lec('MET04', 'Metallurgy and Heat Treatment', 1, 'SECOND', 1, CIT_DEPT_ID, YL.MECH_Y1),
  lab('MET04L', 'Metallurgy and Heat Treatment Laboratory', 2, 'SECOND', 1, CIT_DEPT_ID, YL.MECH_Y1),
  lec('MET05', 'Machining I: Turning and Shaping', 2, 'SECOND', 1, CIT_DEPT_ID, YL.MECH_Y1),
  lab('MET05L', 'Machining I: Turning and Shaping Laboratory', 2, 'SECOND', 1, CIT_DEPT_ID, YL.MECH_Y1),

  // 2nd Year, 1st Sem
  lec('MET06', 'Mechanical CAD', 1, 'FIRST', 2, CIT_DEPT_ID, YL.MECH_Y2),
  lab('MET06L', 'Mechanical CAD Laboratory', 1, 'FIRST', 2, CIT_DEPT_ID, YL.MECH_Y2),
  lec('MET07', 'Machine Design for Technology', 3, 'FIRST', 2, CIT_DEPT_ID, YL.MECH_Y2),
  // 2nd Year, 2nd Sem
  lec('MET08', 'Machining II: Milling and Surface Grinding', 2, 'SECOND', 2, CIT_DEPT_ID, YL.MECH_Y2),
  lab('MET08L', 'Machining II: Milling and Surface Grinding Laboratory', 2, 'SECOND', 2, CIT_DEPT_ID, YL.MECH_Y2),
  lec('MET09', 'Basic CNC Lathe', 2, 'SECOND', 2, CIT_DEPT_ID, YL.MECH_Y2),
  lab('MET09L', 'Basic CNC Lathe Laboratory', 2, 'SECOND', 2, CIT_DEPT_ID, YL.MECH_Y2),

  // 3rd Year, 1st Sem
  lec('MET10', 'Principle of Tool and Die and Pattern Development', 2, 'FIRST', 3, CIT_DEPT_ID, YL.MECH_Y3),
  lab('MET10L', 'Principle of Tool and Die and Pattern Development Laboratory', 2, 'FIRST', 3, CIT_DEPT_ID, YL.MECH_Y3),
  lec('MET11', 'Basic CNC Milling', 2, 'FIRST', 3, CIT_DEPT_ID, YL.MECH_Y3),
  lab('MET11L', 'Basic CNC Milling Laboratory', 2, 'FIRST', 3, CIT_DEPT_ID, YL.MECH_Y3),
  // 3rd Year, 2nd Sem
  lec('MET12', 'Advance Computer Numerical Control (CNC)', 2, 'SECOND', 3, CIT_DEPT_ID, YL.MECH_Y3),
  lab('MET12L', 'Advance Computer Numerical Control (CNC) Laboratory', 2, 'SECOND', 3, CIT_DEPT_ID, YL.MECH_Y3),
  lec('MET13', 'Pneumatic Electropneumatic and Hydraulic', 1, 'SECOND', 3, CIT_DEPT_ID, YL.MECH_Y3),
  lab('MET13L', 'Pneumatic Electropneumatic and Hydraulic Laboratory', 2, 'SECOND', 3, CIT_DEPT_ID, YL.MECH_Y3),

  // ═══════════════════════════════════════════════════════════════════════════
  // PRINT MEDIA TECHNOLOGY (BSIT-ID) — PMT prefix → CIT dept
  // ═══════════════════════════════════════════════════════════════════════════

  // 1st Year, 1st Sem
  lec('PMT01', 'Occupational Safety and Health', 3, 'FIRST', 1, CIT_DEPT_ID, YL.ID_Y1),
  lec('PMT02', 'Fundamentals of Visual Communication', 2, 'FIRST', 1, CIT_DEPT_ID, YL.ID_Y1),
  lab('PMT02L', 'Fundamentals of Visual Communication Laboratory', 2, 'FIRST', 1, CIT_DEPT_ID, YL.ID_Y1),
  lec('PMT03', 'Introduction to Printing Techniques', 2, 'FIRST', 1, CIT_DEPT_ID, YL.ID_Y1),
  lab('PMT03L', 'Introduction to Printing Techniques Laboratory', 2, 'FIRST', 1, CIT_DEPT_ID, YL.ID_Y1),
  // 1st Year, 2nd Sem
  lec('PMT04', 'Introduction to Media Technology', 2, 'SECOND', 1, CIT_DEPT_ID, YL.ID_Y1),
  lab('PMT04L', 'Introduction to Media Technology Laboratory', 2, 'SECOND', 1, CIT_DEPT_ID, YL.ID_Y1),
  lec('PMT05', 'Sustainability and Environment', 2, 'SECOND', 1, CIT_DEPT_ID, YL.ID_Y1),
  lab('PMT05L', 'Sustainability and Environment Laboratory', 2, 'SECOND', 1, CIT_DEPT_ID, YL.ID_Y1),

  // 2nd Year, 1st Sem
  lec('PMT06', 'Visual Graphic Design', 2, 'FIRST', 2, CIT_DEPT_ID, YL.ID_Y2),
  lab('PMT06L', 'Visual Graphic Design Laboratory', 2, 'FIRST', 2, CIT_DEPT_ID, YL.ID_Y2),
  // 2nd Year, 2nd Sem
  lec('PMT07', 'Digital Printing', 2, 'SECOND', 2, CIT_DEPT_ID, YL.ID_Y2),
  lab('PMT07L', 'Digital Printing Laboratory', 2, 'SECOND', 2, CIT_DEPT_ID, YL.ID_Y2),
  lec('PMT08', 'Digital Photography and Image Processing', 2, 'SECOND', 2, CIT_DEPT_ID, YL.ID_Y2),
  lab('PMT08L', 'Digital Photography and Image Processing Laboratory', 2, 'SECOND', 2, CIT_DEPT_ID, YL.ID_Y2),

  // 3rd Year, 1st Sem
  lec('PMT09', 'Commercial and Packaging Design', 2, 'FIRST', 3, CIT_DEPT_ID, YL.ID_Y3),
  lab('PMT09L', 'Commercial and Packaging Design Laboratory', 2, 'FIRST', 3, CIT_DEPT_ID, YL.ID_Y3),
  lec('PMT10', 'Industrial Printing', 2, 'FIRST', 3, CIT_DEPT_ID, YL.ID_Y3),
  lab('PMT10L', 'Industrial Printing Laboratory', 2, 'FIRST', 3, CIT_DEPT_ID, YL.ID_Y3),
  // 3rd Year, 2nd Sem
  lec('PMT11', 'Digital Print Production', 2, 'SECOND', 3, CIT_DEPT_ID, YL.ID_Y3),
  lab('PMT11L', 'Digital Print Production Laboratory', 2, 'SECOND', 3, CIT_DEPT_ID, YL.ID_Y3),
  lec('PMT12', 'Printing Press Management', 1, 'SECOND', 3, CIT_DEPT_ID, YL.ID_Y3),
  lab('PMT12L', 'Printing Press Management Laboratory', 2, 'SECOND', 3, CIT_DEPT_ID, YL.ID_Y3),

  // ═══════════════════════════════════════════════════════════════════════════
  // BS INFORMATION TECHNOLOGY (BSInfoTech) — ITE prefix → CIT dept
  // ═══════════════════════════════════════════════════════════════════════════

  // 1st Year, 1st Sem
  lab('ITE01L', 'Introduction to Computing Laboratory', 1, 'FIRST', 1, CIT_DEPT_ID, YL.IT_Y1),

  // 1st Year, 2nd Sem
  lec('ITE02', 'Computer Programming 1', 2, 'SECOND', 1, CIT_DEPT_ID, YL.IT_Y1),
  lab('ITE02L', 'Computer Programming 1 Laboratory', 1, 'SECOND', 1, CIT_DEPT_ID, YL.IT_Y1),

  // 2nd Year, 1st Sem
  lec('ITE03', 'Human Computer Interaction', 3, 'FIRST', 2, CIT_DEPT_ID, YL.IT_Y2),
  lec('ITE04', 'Discrete Mathematics', 3, 'FIRST', 2, CIT_DEPT_ID, YL.IT_Y2),
  lec('ITE05', 'Computer Programming 2', 2, 'FIRST', 2, CIT_DEPT_ID, YL.IT_Y2),
  lab('ITE05L', 'Computer Programming 2 Laboratory', 1, 'FIRST', 2, CIT_DEPT_ID, YL.IT_Y2),
  lec('ITE06', 'Visual Graphic Design', 2, 'FIRST', 2, CIT_DEPT_ID, YL.IT_Y2),
  lab('ITE06L', 'Visual Graphic Design Laboratory', 1, 'FIRST', 2, CIT_DEPT_ID, YL.IT_Y2),
  lec('ITE07', 'Database Management Systems 1', 2, 'FIRST', 2, CIT_DEPT_ID, YL.IT_Y2),
  lab('ITE07L', 'Database Management Systems 1 Laboratory', 1, 'FIRST', 2, CIT_DEPT_ID, YL.IT_Y2),
  // 2nd Year, 2nd Sem
  lec('ITE08', 'Data Structures and Algorithms', 2, 'SECOND', 2, CIT_DEPT_ID, YL.IT_Y2),
  lab('ITE08L', 'Data Structures and Algorithms Laboratory', 1, 'SECOND', 2, CIT_DEPT_ID, YL.IT_Y2),
  lec('ITE09', 'Quantitative Methods', 2, 'SECOND', 2, CIT_DEPT_ID, YL.IT_Y2),
  lab('ITE09L', 'Quantitative Methods Laboratory', 1, 'SECOND', 2, CIT_DEPT_ID, YL.IT_Y2),
  lec('ITE10', 'Front-End Development', 2, 'SECOND', 2, CIT_DEPT_ID, YL.IT_Y2),
  lab('ITE10L', 'Front-End Development Laboratory', 1, 'SECOND', 2, CIT_DEPT_ID, YL.IT_Y2),
  lec('ITE11', 'Database Management Systems 2', 2, 'SECOND', 2, CIT_DEPT_ID, YL.IT_Y2),
  lab('ITE11L', 'Database Management Systems 2 Laboratory', 1, 'SECOND', 2, CIT_DEPT_ID, YL.IT_Y2),

  // 3rd Year, 1st Sem
  lec('ITE12', 'Information Assurance and Security', 3, 'FIRST', 3, CIT_DEPT_ID, YL.IT_Y3),
  lec('ITE13', 'IT Social and Professional Issues', 3, 'FIRST', 3, CIT_DEPT_ID, YL.IT_Y3),
  lec('ITE14', 'Systems Analysis and Design', 3, 'FIRST', 3, CIT_DEPT_ID, YL.IT_Y3),
  lec('ITE16', 'Object-Oriented Programming', 2, 'FIRST', 3, CIT_DEPT_ID, YL.IT_Y3),
  lab('ITE16L', 'Object-Oriented Programming Laboratory', 1, 'FIRST', 3, CIT_DEPT_ID, YL.IT_Y3),
  lec('ITE17', 'Cognate/Professional Course 1 (Elective)', 2, 'FIRST', 3, CIT_DEPT_ID, YL.IT_Y3),
  lab('ITE17L', 'Cognate/Professional Course 1 (Elective) Laboratory', 1, 'FIRST', 3, CIT_DEPT_ID, YL.IT_Y3),
  lec('ITE18', 'Cognate/Professional Course 2 (Elective)', 2, 'FIRST', 3, CIT_DEPT_ID, YL.IT_Y3),
  lab('ITE18L', 'Cognate/Professional Course 2 (Elective) Laboratory', 1, 'FIRST', 3, CIT_DEPT_ID, YL.IT_Y3),
  // 3rd Year, 2nd Sem
  lec('ITE19', 'Computer Organization Architecture and Logic', 2, 'SECOND', 3, CIT_DEPT_ID, YL.IT_Y3),
  lab('ITE19L', 'Computer Organization Architecture and Logic Laboratory', 1, 'SECOND', 3, CIT_DEPT_ID, YL.IT_Y3),
  lec('ITE20', 'Computer Networking 2', 2, 'SECOND', 3, CIT_DEPT_ID, YL.IT_Y3),
  lab('ITE20L', 'Computer Networking 2 Laboratory', 1, 'SECOND', 3, CIT_DEPT_ID, YL.IT_Y3),
  lec('ITE21', 'Operating Systems', 2, 'SECOND', 3, CIT_DEPT_ID, YL.IT_Y3),
  lab('ITE21L', 'Operating Systems Laboratory', 1, 'SECOND', 3, CIT_DEPT_ID, YL.IT_Y3),
  lec('ITE22', 'IT Project Management', 3, 'SECOND', 3, CIT_DEPT_ID, YL.IT_Y3),
  lec('ITE23', 'Capstone Project 1', 3, 'SECOND', 3, CIT_DEPT_ID, YL.IT_Y3),
  lec('ITE24', 'Cognate/Professional Course 3 (Elective)', 2, 'SECOND', 3, CIT_DEPT_ID, YL.IT_Y3),
  lab('ITE24L', 'Cognate/Professional Course 3 (Elective) Laboratory', 1, 'SECOND', 3, CIT_DEPT_ID, YL.IT_Y3),
  lec('ITE25', 'Cognate/Professional Course 4 (Elective)', 2, 'SECOND', 3, CIT_DEPT_ID, YL.IT_Y3),
  lab('ITE25L', 'Cognate/Professional Course 4 (Elective) Laboratory', 1, 'SECOND', 3, CIT_DEPT_ID, YL.IT_Y3),

  // 4th Year, 1st Sem
  lab('ITE26', 'Seminars in IT Trends', 1, 'FIRST', 4, CIT_DEPT_ID, YL.IT_Y4),
  lec('ITE27', 'User Experience Design', 3, 'FIRST', 4, CIT_DEPT_ID, YL.IT_Y4),
  lec('ITE29', 'Capstone Project 2', 3, 'FIRST', 4, CIT_DEPT_ID, YL.IT_Y4),
  lec('ITE30', 'IT Entrepreneurship', 3, 'FIRST', 4, CIT_DEPT_ID, YL.IT_Y4),
  lec('ITE31', 'Systems Administration and Maintenance', 2, 'FIRST', 4, CIT_DEPT_ID, YL.IT_Y4),
  lab('ITE31L', 'Systems Administration and Maintenance Laboratory', 1, 'FIRST', 4, CIT_DEPT_ID, YL.IT_Y4),
  lec('ITE32', 'Data Mining and Analytics', 2, 'FIRST', 4, CIT_DEPT_ID, YL.IT_Y4),
  lab('ITE32L', 'Data Mining and Analytics Laboratory', 1, 'FIRST', 4, CIT_DEPT_ID, YL.IT_Y4),

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW CAS SUBJECTS — GEC10, GEC11, GEC13 → CAS dept, no yearLevelId
  // ═══════════════════════════════════════════════════════════════════════════

  lec('GEC10', 'Kontekstwalisadong Komunikasyon sa Filipino', 3, 'FIRST', 1, CAS_DEPT_ID),
  lec('GEC11', 'Filipino sa Iba\'t Ibang Disiplina', 3, 'SECOND', 1, CAS_DEPT_ID),
  lec('GEC13', 'Literature of the Philippines', 3, 'SECOND', 2, CAS_DEPT_ID),
]

// ─── Main Seed Function ─────────────────────────────────────────────────────

async function main() {
  console.log('=== Seeding Curriculum P2 Subjects ===\n')

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

  // Fix ITE01 title and units (was incorrectly "Computer Programming 1" with 3 units)
  await db.subject.update({
    where: { code: 'ITE01' },
    data: { title: 'Introduction to Computing', units: 2, hoursPerWeek: 2 },
  })
  console.log('  [UPDATED] ITE01 — Introduction to Computing (fixed title/units)')

  console.log('\n=== Seed P2 Summary ===')
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
