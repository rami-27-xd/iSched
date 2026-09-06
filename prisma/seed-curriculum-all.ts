import 'dotenv/config'
import { PrismaClient } from './generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

// ─── Department IDs ─────────────────────────────────────────────────────────
const CIT = 'cmmzovtuu0008qkvu6u4ayhzs'
const CAS = 'cmmzovtv10009qkvur7tude03'

// ─── Types ──────────────────────────────────────────────────────────────────
type SubjectType = 'LECTURE' | 'LABORATORY'
type SemesterType = 'FIRST' | 'SECOND'

interface SubjectInput {
  code: string
  title: string
  units: number
  type: SubjectType
  semester: SemesterType
  year: number
  departmentId: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function lec(
  code: string,
  title: string,
  units: number,
  semester: SemesterType,
  year: number,
  departmentId: string,
): SubjectInput {
  return { code, title, units, type: 'LECTURE', semester, year, departmentId }
}

function lab(
  code: string,
  title: string,
  units: number,
  semester: SemesterType,
  year: number,
  departmentId: string,
): SubjectInput {
  return { code, title, units, type: 'LABORATORY', semester, year, departmentId }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALL SUBJECTS
// ═══════════════════════════════════════════════════════════════════════════════

const subjects: SubjectInput[] = [
  // ─── CIT Shared Subjects ────────────────────────────────────────────────────
  lec('IIT01', 'Introduction to Information Technology', 2, 'FIRST', 1, CIT),
  lab('IIT01L', 'Introduction to Information Technology Laboratory', 1, 'FIRST', 1, CIT),
  lec('IND01', 'Industrial Drawing', 1, 'FIRST', 1, CIT),
  lab('IND01L', 'Industrial Drawing Laboratory', 1, 'FIRST', 1, CIT),
  lec('COM01a', 'Computer Programming', 2, 'FIRST', 1, CIT),
  lab('COM01aL', 'Computer Programming Laboratory', 1, 'FIRST', 1, CIT),
  lec('CHM01a', 'Chemistry for Industrial Technologist', 2, 'FIRST', 1, CIT),
  lab('CHM01aL', 'Chemistry for Industrial Technologist Laboratory', 1, 'FIRST', 1, CIT),
  lec('PHY01a', 'Physics for Industrial Technologist', 2, 'FIRST', 1, CIT),
  lab('PHY01aL', 'Physics for Industrial Technologist Laboratory', 1, 'FIRST', 1, CIT),
  lec('MAT04a', 'Comprehensive Mathematics', 5, 'FIRST', 1, CIT),
  lec('MTM01', 'Materials Technology Management', 3, 'FIRST', 1, CIT),
  lec('PSY11a', 'Industrial Psychology', 3, 'FIRST', 1, CIT),
  lec('IEN04a', 'Industrial Organization and Management', 3, 'FIRST', 1, CIT),
  lec('IEN08a', 'Quality Control and Assurance', 3, 'FIRST', 1, CIT),
  lec('IEN11a', 'Production Management', 3, 'FIRST', 1, CIT),
  lec('MGT02', 'Technopreneurship', 3, 'FIRST', 1, CIT),
  lec('FLO01', 'Foreign Language', 3, 'FIRST', 1, CIT),
  lec('RES01a', 'Project Study 1 with Intellectual Property Rights', 2, 'FIRST', 1, CIT),
  lab('RES01aL', 'Project Study 1 with IPR Laboratory', 1, 'FIRST', 1, CIT),
  lec('RES02a', 'Project Study 2', 2, 'FIRST', 1, CIT),
  lab('RES02aL', 'Project Study 2 Laboratory', 1, 'FIRST', 1, CIT),

  // ─── BSIT-Garm (Apparel/Fashion) ───────────────────────────────────────────
  lec('AFT01', 'Occupational Safety and Health', 3, 'FIRST', 1, CIT),
  lec('AFT02', 'Sewing Machine Operations Maintenance & Basic Apparel', 2, 'FIRST', 1, CIT),
  lab('AFT02L', 'Sewing Machine Operations Maintenance & Basic Apparel Laboratory', 2, 'FIRST', 1, CIT),
  lec('AFT03', 'Fundamentals of Apparel Construction', 2, 'FIRST', 1, CIT),
  lab('AFT03L', 'Fundamentals of Apparel Construction Laboratory', 2, 'FIRST', 1, CIT),
  lec('AFT04', 'Introduction to Fashion Designing', 1, 'SECOND', 1, CIT),
  lab('AFT04L', 'Introduction to Fashion Designing Laboratory', 1, 'SECOND', 1, CIT),
  lec('AFT05', 'Advanced Apparel Construction', 2, 'SECOND', 1, CIT),
  lab('AFT05L', 'Advanced Apparel Construction Laboratory', 2, 'SECOND', 1, CIT),
  lec('AFT06', 'Fashion Arts and Apparel Accessories', 1, 'FIRST', 2, CIT),
  lab('AFT06L', 'Fashion Arts and Apparel Accessories Laboratory', 1, 'FIRST', 2, CIT),
  lec('AFT07', 'Creative Costume Design and Construction', 2, 'FIRST', 2, CIT),
  lab('AFT07L', 'Creative Costume Design and Construction Laboratory', 2, 'FIRST', 2, CIT),
  lec('AFT08', 'Pattern Standardization and Grading', 1, 'FIRST', 2, CIT),
  lab('AFT08L', 'Pattern Standardization and Grading Laboratory', 1, 'FIRST', 2, CIT),
  lec('AFT09', 'Tailoring', 2, 'SECOND', 2, CIT),
  lab('AFT09L', 'Tailoring Laboratory', 2, 'SECOND', 2, CIT),
  lec('AFT10', 'Advanced Pattern Drafting/Designing', 1, 'FIRST', 3, CIT),
  lab('AFT10L', 'Advanced Pattern Drafting/Designing Laboratory', 2, 'FIRST', 3, CIT),
  lec('AFT11', 'Home Furnishing and Fashion Accessories', 2, 'FIRST', 3, CIT),
  lab('AFT11L', 'Home Furnishing and Fashion Accessories Laboratory', 2, 'FIRST', 3, CIT),
  lec('AFT12', 'Fabrics and Thread Selection and Usage', 3, 'SECOND', 3, CIT),
  lec('AFT13', 'Production Management in Garment Industry', 3, 'SECOND', 3, CIT),
  lec('AFT14', 'Draping Fashion Modeling and Fashion Show', 2, 'SECOND', 3, CIT),
  lab('AFT14L', 'Draping Fashion Modeling and Fashion Show Laboratory', 2, 'SECOND', 3, CIT),

  // ─── BSIT-Auto (Automotive) ─────────────────────────────────────────────────
  lec('AIT01', 'Occupational Safety and Health', 3, 'FIRST', 1, CIT),
  lec('AIT02', 'Fundamentals of Automotive Technology', 2, 'FIRST', 1, CIT),
  lab('AIT02L', 'Fundamentals of Automotive Technology Laboratory', 1, 'FIRST', 1, CIT),
  lec('AIT03', 'Automotive Electrical System', 2, 'FIRST', 1, CIT),
  lab('AIT03L', 'Automotive Electrical System Laboratory', 1, 'FIRST', 1, CIT),
  lec('AIT04', 'Automotive Electronics', 2, 'SECOND', 1, CIT),
  lab('AIT04L', 'Automotive Electronics Laboratory', 3, 'SECOND', 1, CIT),
  lec('AIT05', 'Small Engine Repair and Motorcycle Servicing', 2, 'SECOND', 1, CIT),
  lab('AIT05L', 'Small Engine Repair and Motorcycle Servicing Laboratory', 3, 'SECOND', 1, CIT),
  lec('AIT06', 'Car Care Servicing Emission Control and Tune-up', 2, 'SECOND', 1, CIT),
  lab('AIT06L', 'Car Care Servicing Emission Control and Tune-up Laboratory', 3, 'SECOND', 1, CIT),
  lec('AIT07', 'Body Repair and Painting', 2, 'FIRST', 2, CIT),
  lab('AIT07L', 'Body Repair and Painting Laboratory', 3, 'FIRST', 2, CIT),
  lec('AIT08', 'Power Train and Conversion System', 2, 'FIRST', 2, CIT),
  lab('AIT08L', 'Power Train and Conversion System Laboratory', 3, 'FIRST', 2, CIT),
  lec('AIT09', 'Automotive LPG System', 2, 'FIRST', 2, CIT),
  lab('AIT09L', 'Automotive LPG System Laboratory', 3, 'FIRST', 2, CIT),
  lec('AIT10', 'Automotive Air Conditioning', 2, 'FIRST', 2, CIT),
  lab('AIT10L', 'Automotive Air Conditioning Laboratory', 3, 'FIRST', 2, CIT),
  lec('AIT11', 'Engine Overhauling and Performance Testing', 2, 'SECOND', 2, CIT),
  lab('AIT11L', 'Engine Overhauling and Performance Testing Laboratory', 3, 'SECOND', 2, CIT),
  lec('AIT12', 'Hybrid and Electric Vehicle', 2, 'SECOND', 2, CIT),
  lab('AIT12L', 'Hybrid and Electric Vehicle Laboratory', 3, 'SECOND', 2, CIT),
  lec('AIT13', 'Driving Education', 2, 'SECOND', 2, CIT),
  lab('AIT13L', 'Driving Education Laboratory', 1, 'SECOND', 2, CIT),
  lec('AIT14', 'Body Management and Under chassis Electronic Control System', 2, 'FIRST', 3, CIT),
  lab('AIT14L', 'Body Management and Under chassis Electronic Control System Laboratory', 3, 'FIRST', 3, CIT),
  lec('AIT15', 'Automotive Computer-Aided Design', 1, 'SECOND', 3, CIT),
  lab('AIT15L', 'Automotive Computer-Aided Design Laboratory', 3, 'SECOND', 3, CIT),
  lec('AIT16', 'Electronics Engine Management System', 3, 'SECOND', 3, CIT),

  // ─── BSIT-Comp (Computer Technology) ────────────────────────────────────────
  lec('CPT01', 'Occupational Safety and Health', 3, 'SECOND', 1, CIT),
  lec('CPT02a', 'Fundamentals of Electricity and Electronics', 2, 'FIRST', 1, CIT),
  lab('CPT02aL', 'Fundamentals of Electricity and Electronics Laboratory', 1, 'FIRST', 1, CIT),
  lec('CPT04', 'Computer System and Hardware', 2, 'FIRST', 1, CIT),
  lab('CPT04L', 'Computer System and Hardware Laboratory', 1, 'FIRST', 1, CIT),
  lec('CPT05', 'Logic and Switching Theory', 1, 'FIRST', 1, CIT),
  lab('CPT05L', 'Logic and Switching Theory Laboratory', 1, 'FIRST', 1, CIT),
  lec('CPT08a', 'Computer Installation and Servicing', 2, 'SECOND', 1, CIT),
  lab('CPT08aL', 'Computer Installation and Servicing Laboratory', 2, 'SECOND', 1, CIT),
  lec('CPT10', 'Specialized Technology 1', 2, 'FIRST', 2, CIT),
  lab('CPT10L', 'Specialized Technology 1 Laboratory', 1, 'FIRST', 2, CIT),
  lec('CPT14', 'Specialized Technology 2', 2, 'SECOND', 2, CIT),
  lab('CPT14L', 'Specialized Technology 2 Laboratory', 1, 'SECOND', 2, CIT),
  lec('CPT16', 'Advanced Programming', 2, 'SECOND', 2, CIT),
  lab('CPT16L', 'Advanced Programming Laboratory', 2, 'SECOND', 2, CIT),
  lec('CPT17', 'Embedded System', 2, 'FIRST', 3, CIT),
  lab('CPT17L', 'Embedded System Laboratory', 2, 'FIRST', 3, CIT),
  lec('CPT18', 'Platform Technologies', 2, 'FIRST', 3, CIT),
  lab('CPT18L', 'Platform Technologies Laboratory', 1, 'FIRST', 3, CIT),
  lec('CPT19', 'Information Management', 2, 'FIRST', 3, CIT),
  lab('CPT19L', 'Information Management Laboratory', 1, 'FIRST', 3, CIT),
  lec('CPT11a', 'Seminar in Computer Technology', 1, 'SECOND', 3, CIT),
  lab('CPT11aL', 'Seminar in Computer Technology Laboratory', 1, 'SECOND', 3, CIT),

  // ─── BSIT-Food (Culinary Technology) ────────────────────────────────────────
  lec('CUL01', 'Occupational Safety and Health', 3, 'FIRST', 1, CIT),
  lec('CUL02', 'Food Safety and Sanitation', 2, 'FIRST', 1, CIT),
  lab('CUL02L', 'Food Safety and Sanitation Laboratory', 2, 'FIRST', 1, CIT),
  lec('CUL03', 'Kitchen Essential and Basic Food Preparation', 3, 'FIRST', 1, CIT),
  lec('CUL04', 'Advanced Food Preparation', 2, 'SECOND', 1, CIT),
  lab('CUL04L', 'Advanced Food Preparation Laboratory', 2, 'SECOND', 1, CIT),
  lec('CUL05', 'Food Styling and Design', 2, 'SECOND', 1, CIT),
  lab('CUL05L', 'Food Styling and Design Laboratory', 1, 'SECOND', 1, CIT),
  lec('CUL06', 'Advanced Garde Manger', 2, 'FIRST', 2, CIT),
  lab('CUL06L', 'Advanced Garde Manger Laboratory', 1, 'FIRST', 2, CIT),
  lec('CUL07', 'Introduction to Bakery and Pastry', 2, 'FIRST', 2, CIT),
  lab('CUL07L', 'Introduction to Bakery and Pastry Laboratory', 2, 'FIRST', 2, CIT),
  lec('CUL08', 'Quantity Food Production Planning and Management', 2, 'SECOND', 2, CIT),
  lab('CUL08L', 'Quantity Food Production Planning and Management Laboratory', 1, 'SECOND', 2, CIT),
  lec('CUL09', 'Wine Beverage and Mixology', 2, 'SECOND', 2, CIT),
  lab('CUL09L', 'Wine Beverage and Mixology Laboratory', 1, 'SECOND', 2, CIT),
  lec('CUL10', 'Catering and Events Simulation', 2, 'FIRST', 3, CIT),
  lab('CUL10L', 'Catering and Events Simulation Laboratory', 2, 'FIRST', 3, CIT),
  lec('CUL11', 'Nutrition and Food Trends', 3, 'FIRST', 3, CIT),
  lec('CUL12', 'Philippine Regional Cuisine and Asian Cuisine', 2, 'FIRST', 3, CIT),
  lab('CUL12L', 'Philippine Regional Cuisine and Asian Cuisine Laboratory', 1, 'FIRST', 3, CIT),
  lec('CUL13', 'Western Cuisine', 2, 'SECOND', 3, CIT),
  lab('CUL13L', 'Western Cuisine Laboratory', 1, 'SECOND', 3, CIT),
  lec('CUL14', 'Plant-based Cooking', 2, 'SECOND', 3, CIT),
  lab('CUL14L', 'Plant-based Cooking Laboratory', 1, 'SECOND', 3, CIT),

  // ─── BSIT-Eltx (Electronics Technology) ─────────────────────────────────────
  lec('ELX01', 'Occupational Safety and Health', 3, 'FIRST', 1, CIT),
  lec('ELX02', 'Electronic Devices 1', 3, 'FIRST', 1, CIT),
  lab('ELX02L', 'Electronic Devices 1 Laboratory', 6, 'FIRST', 1, CIT),
  lec('ELX03', 'Electronics Communication 1', 2, 'FIRST', 1, CIT),
  lab('ELX03L', 'Electronics Communication 1 Laboratory', 3, 'FIRST', 1, CIT),
  lec('ELX04', 'Electronics CAD', 1, 'FIRST', 1, CIT),
  lab('ELX04L', 'Electronics CAD Laboratory', 3, 'FIRST', 1, CIT),
  lec('ELX05', 'Electronic Devices 2', 2, 'SECOND', 1, CIT),
  lab('ELX05L', 'Electronic Devices 2 Laboratory', 3, 'SECOND', 1, CIT),
  lec('ELX06', 'Electronic Communications 2', 2, 'SECOND', 1, CIT),
  lab('ELX06L', 'Electronic Communications 2 Laboratory', 3, 'SECOND', 1, CIT),
  lec('ELX07', 'Digital Electronics', 2, 'SECOND', 1, CIT),
  lab('ELX07L', 'Digital Electronics Laboratory', 3, 'SECOND', 1, CIT),
  lec('ELX08', 'Instrumentation and Process Control', 2, 'FIRST', 2, CIT),
  lab('ELX08L', 'Instrumentation and Process Control Laboratory', 3, 'FIRST', 2, CIT),
  lec('ELX09', 'Sensor Technology', 2, 'FIRST', 2, CIT),
  lab('ELX09L', 'Sensor Technology Laboratory', 3, 'FIRST', 2, CIT),
  lec('ELX10', 'Electronic Laws and Standards', 3, 'FIRST', 2, CIT),
  lec('ELX11', 'Multimedia Systems', 2, 'SECOND', 2, CIT),
  lab('ELX11L', 'Multimedia Systems Laboratory', 3, 'SECOND', 2, CIT),
  lec('ELX12', 'Industrial Electronics', 2, 'SECOND', 2, CIT),
  lab('ELX12L', 'Industrial Electronics Laboratory', 3, 'SECOND', 2, CIT),
  lec('ELX13', 'Electro-Pneumatic Systems', 2, 'SECOND', 2, CIT),
  lab('ELX13L', 'Electro-Pneumatic Systems Laboratory', 3, 'SECOND', 2, CIT),

  // ─── BSIT-Elec (Electrical Technology) ──────────────────────────────────────
  lec('ELT01', 'Occupational Safety and Health', 3, 'FIRST', 1, CIT),
  lec('ELT02', 'Electricity and Electronics Principles', 1, 'FIRST', 1, CIT),
  lab('ELT02L', 'Electricity and Electronics Principles Laboratory', 3, 'FIRST', 1, CIT),
  lec('ELT03', 'DC Circuits', 1, 'FIRST', 1, CIT),
  lab('ELT03L', 'DC Circuits Laboratory', 3, 'FIRST', 1, CIT),
  lec('ELT04', 'Shop Process Tools and Equipment', 1, 'FIRST', 1, CIT),
  lab('ELT04L', 'Shop Process Tools and Equipment Laboratory', 3, 'FIRST', 1, CIT),
  lec('ELT05', 'Philippine Electrical Code', 2, 'FIRST', 1, CIT),
  lec('ELT06', 'Residential Wiring System', 1, 'FIRST', 1, CIT),
  lab('ELT06L', 'Residential Wiring System Laboratory', 6, 'FIRST', 1, CIT),
  lec('ELT07', 'AC Circuits', 2, 'SECOND', 1, CIT),
  lab('ELT07L', 'AC Circuits Laboratory', 3, 'SECOND', 1, CIT),
  lec('ELT08', 'Industrial Wiring System', 1, 'SECOND', 1, CIT),
  lab('ELT08L', 'Industrial Wiring System Laboratory', 6, 'SECOND', 1, CIT),
  lec('ELT09', 'Electrical Instruments and Measurement', 2, 'SECOND', 1, CIT),
  lab('ELT09L', 'Electrical Instruments and Measurement Laboratory', 3, 'SECOND', 1, CIT),
  lec('ELT10', 'Electrical Machines', 1, 'SECOND', 1, CIT),
  lab('ELT10L', 'Electrical Machines Laboratory', 6, 'SECOND', 1, CIT),
  lec('ELT11', 'Transmission and Distribution System', 2, 'FIRST', 2, CIT),
  lab('ELT11L', 'Transmission and Distribution System Laboratory', 3, 'FIRST', 2, CIT),
  lec('ELT12', 'Industrial Motor Controllers', 1, 'FIRST', 2, CIT),
  lab('ELT12L', 'Industrial Motor Controllers Laboratory', 3, 'FIRST', 2, CIT),
  lec('ELT13', 'Power Production and Management Systems', 1, 'FIRST', 2, CIT),
  lab('ELT13L', 'Power Production and Management Systems Laboratory', 3, 'FIRST', 2, CIT),
  lec('ELT14', 'Logic Circuits', 1, 'SECOND', 2, CIT),
  lab('ELT14L', 'Logic Circuits Laboratory', 3, 'SECOND', 2, CIT),
  lec('ELT15', 'Electrical Computer Aided Design', 1, 'SECOND', 2, CIT),
  lab('ELT15L', 'Electrical Computer Aided Design Laboratory', 3, 'SECOND', 2, CIT),
  lec('ELT16', 'Programmable Logic Controllers', 2, 'SECOND', 2, CIT),
  lab('ELT16L', 'Programmable Logic Controllers Laboratory', 3, 'SECOND', 2, CIT),
  lec('ELT17', 'Electro-Pneumatic Systems', 2, 'FIRST', 3, CIT),
  lab('ELT17L', 'Electro-Pneumatic Systems Laboratory', 3, 'FIRST', 3, CIT),
  lec('ELT18', 'Instrumentation and Process Control', 2, 'SECOND', 3, CIT),
  lab('ELT18L', 'Instrumentation and Process Control Laboratory', 3, 'SECOND', 3, CIT),

  // ─── BSIT-Mech (Mechanical Technology) ──────────────────────────────────────
  lec('MET01', 'Occupational Health and Safety', 3, 'FIRST', 1, CIT),
  lec('MET02', 'Basic Arc and Gas Welding Practices', 2, 'FIRST', 1, CIT),
  lab('MET02L', 'Basic Arc and Gas Welding Practices Laboratory', 2, 'FIRST', 1, CIT),
  lec('MET03', 'Bench working Pipefitting and Pipe Bending', 2, 'FIRST', 1, CIT),
  lab('MET03L', 'Bench working Pipefitting and Pipe Bending Laboratory', 2, 'FIRST', 1, CIT),
  lec('MET04', 'Metallurgy and Heat Treatment', 1, 'SECOND', 1, CIT),
  lab('MET04L', 'Metallurgy and Heat Treatment Laboratory', 2, 'SECOND', 1, CIT),
  lec('MET05', 'Machining I Turning and Shaping', 2, 'SECOND', 1, CIT),
  lab('MET05L', 'Machining I Turning and Shaping Laboratory', 2, 'SECOND', 1, CIT),
  lec('MET06', 'Mechanical CAD', 1, 'FIRST', 2, CIT),
  lab('MET06L', 'Mechanical CAD Laboratory', 1, 'FIRST', 2, CIT),
  lec('MET07', 'Machine Design for Technology', 3, 'FIRST', 2, CIT),
  lec('MET08', 'Machining II Milling and Surface Grinding', 2, 'SECOND', 2, CIT),
  lab('MET08L', 'Machining II Milling and Surface Grinding Laboratory', 2, 'SECOND', 2, CIT),
  lec('MET09', 'Basic CNC Lathe', 2, 'SECOND', 2, CIT),
  lab('MET09L', 'Basic CNC Lathe Laboratory', 2, 'SECOND', 2, CIT),
  lec('MET10', 'Principle of Tool & Die and Pattern Development', 2, 'FIRST', 3, CIT),
  lab('MET10L', 'Principle of Tool & Die and Pattern Development Laboratory', 2, 'FIRST', 3, CIT),
  lec('MET11', 'Basic CNC Milling', 2, 'FIRST', 3, CIT),
  lab('MET11L', 'Basic CNC Milling Laboratory', 2, 'FIRST', 3, CIT),
  lec('MET12', 'Advance Computer Numerical Control (CNC)', 2, 'SECOND', 3, CIT),
  lab('MET12L', 'Advance Computer Numerical Control (CNC) Laboratory', 2, 'SECOND', 3, CIT),
  lec('MET13', 'Pneumatic Electropneumatic and Hydraulic', 1, 'SECOND', 3, CIT),
  lab('MET13L', 'Pneumatic Electropneumatic and Hydraulic Laboratory', 2, 'SECOND', 3, CIT),

  // ─── BSIT-ID (Print Media Technology) ───────────────────────────────────────
  lec('PMT01', 'Occupational Safety and Health', 3, 'FIRST', 1, CIT),
  lec('PMT02', 'Fundamentals of Visual Communication', 2, 'FIRST', 1, CIT),
  lab('PMT02L', 'Fundamentals of Visual Communication Laboratory', 2, 'FIRST', 1, CIT),
  lec('PMT03', 'Introduction to Printing Techniques', 2, 'FIRST', 1, CIT),
  lab('PMT03L', 'Introduction to Printing Techniques Laboratory', 2, 'FIRST', 1, CIT),
  lec('PMT04', 'Introduction to Media Technology', 2, 'SECOND', 1, CIT),
  lab('PMT04L', 'Introduction to Media Technology Laboratory', 2, 'SECOND', 1, CIT),
  lec('PMT05', 'Sustainability and Environment', 2, 'SECOND', 1, CIT),
  lab('PMT05L', 'Sustainability and Environment Laboratory', 2, 'SECOND', 1, CIT),
  lec('PMT06', 'Visual Graphic Design', 2, 'FIRST', 2, CIT),
  lab('PMT06L', 'Visual Graphic Design Laboratory', 2, 'FIRST', 2, CIT),
  lec('PMT07', 'Digital Printing', 2, 'SECOND', 2, CIT),
  lab('PMT07L', 'Digital Printing Laboratory', 2, 'SECOND', 2, CIT),
  lec('PMT08', 'Digital Photography and Image Processing', 2, 'SECOND', 2, CIT),
  lab('PMT08L', 'Digital Photography and Image Processing Laboratory', 2, 'SECOND', 2, CIT),
  lec('PMT09', 'Commercial and Packaging Design', 2, 'FIRST', 3, CIT),
  lab('PMT09L', 'Commercial and Packaging Design Laboratory', 2, 'FIRST', 3, CIT),
  lec('PMT10', 'Industrial Printing', 2, 'FIRST', 3, CIT),
  lab('PMT10L', 'Industrial Printing Laboratory', 2, 'FIRST', 3, CIT),
  lec('PMT11', 'Digital Print Production', 2, 'SECOND', 3, CIT),
  lab('PMT11L', 'Digital Print Production Laboratory', 2, 'SECOND', 3, CIT),
  lec('PMT12', 'Printing Press Management', 1, 'SECOND', 3, CIT),
  lab('PMT12L', 'Printing Press Management Laboratory', 2, 'SECOND', 3, CIT),

  // ─── BSInfoTech (BS Information Technology) ─────────────────────────────────
  lec('ITE01', 'Introduction to Computing', 2, 'FIRST', 1, CIT),
  lab('ITE01L', 'Introduction to Computing Laboratory', 1, 'FIRST', 1, CIT),
  lec('ITE02', 'Computer Programming 1', 2, 'SECOND', 1, CIT),
  lab('ITE02L', 'Computer Programming 1 Laboratory', 1, 'SECOND', 1, CIT),
  lec('ITE03', 'Human Computer Interaction', 3, 'FIRST', 2, CIT),
  lec('ITE04', 'Discrete Mathematics', 3, 'FIRST', 2, CIT),
  lec('ITE05', 'Computer Programming 2', 2, 'FIRST', 2, CIT),
  lab('ITE05L', 'Computer Programming 2 Laboratory', 1, 'FIRST', 2, CIT),
  lec('ITE06', 'Visual Graphic Design', 2, 'FIRST', 2, CIT),
  lab('ITE06L', 'Visual Graphic Design Laboratory', 1, 'FIRST', 2, CIT),
  lec('ITE07', 'Database Management Systems 1', 2, 'FIRST', 2, CIT),
  lab('ITE07L', 'Database Management Systems 1 Laboratory', 1, 'FIRST', 2, CIT),
  lec('ITE08', 'Data Structures and Algorithms', 2, 'SECOND', 2, CIT),
  lab('ITE08L', 'Data Structures and Algorithms Laboratory', 1, 'SECOND', 2, CIT),
  lec('ITE09', 'Quantitative Methods', 2, 'SECOND', 2, CIT),
  lab('ITE09L', 'Quantitative Methods Laboratory', 1, 'SECOND', 2, CIT),
  lec('ITE10', 'Front-End Development', 2, 'SECOND', 2, CIT),
  lab('ITE10L', 'Front-End Development Laboratory', 1, 'SECOND', 2, CIT),
  lec('ITE11', 'Database Management Systems 2', 2, 'SECOND', 2, CIT),
  lab('ITE11L', 'Database Management Systems 2 Laboratory', 1, 'SECOND', 2, CIT),
  lec('ITE12', 'Information Assurance and Security', 3, 'FIRST', 3, CIT),
  lec('ITE13', 'IT Social and Professional Issues', 3, 'FIRST', 3, CIT),
  lec('ITE14', 'Systems Analysis and Design', 3, 'FIRST', 3, CIT),
  lec('ITE15', 'Computer Networking 1', 2, 'FIRST', 3, CIT),
  lab('ITE15L', 'Computer Networking 1 Laboratory', 1, 'FIRST', 3, CIT),
  lec('ITE16', 'Object-Oriented Programming', 2, 'FIRST', 3, CIT),
  lab('ITE16L', 'Object-Oriented Programming Laboratory', 1, 'FIRST', 3, CIT),
  lec('ITE17', 'Cognate/Professional Course 1 (Elective)', 2, 'FIRST', 3, CIT),
  lab('ITE17L', 'Cognate/Professional Course 1 (Elective) Laboratory', 1, 'FIRST', 3, CIT),
  lec('ITE18', 'Cognate/Professional Course 2 (Elective)', 2, 'FIRST', 3, CIT),
  lab('ITE18L', 'Cognate/Professional Course 2 (Elective) Laboratory', 1, 'FIRST', 3, CIT),
  lec('ITE19', 'Computer Organization Architecture and Logic', 2, 'SECOND', 3, CIT),
  lab('ITE19L', 'Computer Organization Architecture and Logic Laboratory', 1, 'SECOND', 3, CIT),
  lec('ITE20', 'Computer Networking 2', 2, 'SECOND', 3, CIT),
  lab('ITE20L', 'Computer Networking 2 Laboratory', 1, 'SECOND', 3, CIT),
  lec('ITE21', 'Operating Systems', 2, 'SECOND', 3, CIT),
  lab('ITE21L', 'Operating Systems Laboratory', 1, 'SECOND', 3, CIT),
  lec('ITE22', 'IT Project Management', 3, 'SECOND', 3, CIT),
  lec('ITE23', 'Capstone Project 1', 3, 'SECOND', 3, CIT),
  lec('ITE24', 'Cognate/Professional Course 3 (Elective)', 2, 'SECOND', 3, CIT),
  lab('ITE24L', 'Cognate/Professional Course 3 (Elective) Laboratory', 1, 'SECOND', 3, CIT),
  lec('ITE25', 'Cognate/Professional Course 4 (Elective)', 2, 'SECOND', 3, CIT),
  lab('ITE25L', 'Cognate/Professional Course 4 (Elective) Laboratory', 1, 'SECOND', 3, CIT),
  lab('ITE26', 'Seminars in IT Trends', 1, 'FIRST', 4, CIT),
  lec('ITE27', 'User Experience Design', 3, 'FIRST', 4, CIT),
  lec('ITE28', 'Emerging Technologies in IT', 2, 'FIRST', 4, CIT),
  lab('ITE28L', 'Emerging Technologies in IT Laboratory', 1, 'FIRST', 4, CIT),
  lec('ITE29', 'Capstone Project 2', 3, 'FIRST', 4, CIT),
  lec('ITE30', 'IT Entrepreneurship', 3, 'FIRST', 4, CIT),
  lec('ITE31', 'Systems Administration and Maintenance', 2, 'FIRST', 4, CIT),
  lab('ITE31L', 'Systems Administration and Maintenance Laboratory', 1, 'FIRST', 4, CIT),
  lec('ITE32', 'Data Mining and Analytics', 2, 'FIRST', 4, CIT),
  lab('ITE32L', 'Data Mining and Analytics Laboratory', 1, 'FIRST', 4, CIT),
  lec('ITE13a', 'Professional Issues in Computing', 3, 'SECOND', 3, CIT),

  // ═══════════════════════════════════════════════════════════════════════════════
  // CAS DEPARTMENT SUBJECTS
  // ═══════════════════════════════════════════════════════════════════════════════

  // ─── GEC (General Education Core) ───────────────────────────────────────────
  lec('GEC01', 'The Life and Works of Rizal', 3, 'FIRST', 1, CAS),
  lec('GEC02', 'Understanding the Self', 3, 'FIRST', 1, CAS),
  lec('GEC03', 'Readings in Philippine History', 3, 'FIRST', 1, CAS),
  lec('GEC04', 'The Contemporary World', 3, 'FIRST', 1, CAS),
  lec('GEC05', 'Mathematics in the Modern World', 3, 'FIRST', 1, CAS),
  lec('GEC06', 'Purposive Communication', 3, 'FIRST', 1, CAS),
  lec('GEC07', 'Art Appreciation', 3, 'FIRST', 1, CAS),
  lec('GEC08', 'Science Technology and Society', 3, 'FIRST', 1, CAS),
  lec('GEC09', 'Ethics', 3, 'FIRST', 1, CAS),
  lec('GEC10', 'Kontekstwalisadong Komunikasyon sa Filipino', 3, 'FIRST', 1, CAS),
  lec('GEC11', 'Filipino sa Iba\'t Ibang Disiplina', 3, 'FIRST', 1, CAS),
  lec('GEC12', 'Dalumat ng/sa Filipino', 3, 'FIRST', 1, CAS),
  lec('GEC13', 'Literature of the Philippines', 3, 'FIRST', 1, CAS),
  lec('GEC14', 'Literature of the World', 3, 'FIRST', 1, CAS),

  // ─── GEL (General Education Electives) ──────────────────────────────────────
  lec('GEL01', 'Environmental Science', 3, 'FIRST', 1, CAS),
  lec('GEL07', 'Gender and Society', 3, 'FIRST', 1, CAS),
  lec('GEL10', 'Philippine Popular Culture', 3, 'FIRST', 1, CAS),

  // ─── PATHFit ────────────────────────────────────────────────────────────────
  lec('PATHFit01', 'Movement Competency Training', 2, 'FIRST', 1, CAS),
  lec('PATHFit02', 'Exercise-Based Fitness Activities', 2, 'SECOND', 1, CAS),
  lec('PATHFit03', 'Dance Sports Martial Arts Group Exercise Outdoor and Adventure Activities', 2, 'FIRST', 2, CAS),
  lec('PATHFit04', 'Dance Sports Martial Arts Group Exercise Outdoor and Adventure Activities', 2, 'SECOND', 2, CAS),

  // ─── NST ────────────────────────────────────────────────────────────────────
  lec('NST01', 'National Service Training Program 1', 3, 'FIRST', 1, CAS),
  lec('NST02', 'National Service Training Program 2', 3, 'SECOND', 1, CAS),

  // ─── NSTP variants (Bio program) ────────────────────────────────────────────
  lec('NSTP1', 'National Service Training Program 1', 3, 'FIRST', 1, CAS),
  lec('NSTP2', 'National Service Training Program 2', 3, 'SECOND', 1, CAS),

  // ─── BS Biology ─────────────────────────────────────────────────────────────
  lec('BOT01', 'General Botany', 3, 'FIRST', 1, CAS),
  lab('BOT01L', 'General Botany Laboratory', 2, 'FIRST', 1, CAS),
  lec('ZOO01', 'General Zoology', 3, 'FIRST', 1, CAS),
  lab('ZOO01L', 'General Zoology Laboratory', 2, 'FIRST', 1, CAS),
  lec('BCH01', 'Organic Molecules', 3, 'SECOND', 1, CAS),
  lec('BIO01', 'General Ecology', 3, 'SECOND', 1, CAS),
  lab('BIO01L', 'General Ecology Laboratory', 2, 'SECOND', 1, CAS),
  lec('BCH02', 'Analytical Methods for Biology', 2, 'FIRST', 2, CAS),
  lab('BCH02L', 'Analytical Methods for Biology Laboratory', 1, 'FIRST', 2, CAS),
  lec('BIO02', 'Genetics', 3, 'FIRST', 2, CAS),
  lab('BIO02L', 'Genetics Laboratory', 2, 'FIRST', 2, CAS),
  lec('BPH00', 'Biophysics', 3, 'FIRST', 2, CAS),
  lab('BPH00L', 'Biophysics Laboratory', 1, 'FIRST', 2, CAS),
  lec('BIO03', 'Comparative Anatomy', 3, 'FIRST', 2, CAS),
  lab('BIO03L', 'Comparative Anatomy Laboratory', 2, 'FIRST', 2, CAS),
  lec('BCH03', 'Biomolecules', 3, 'SECOND', 2, CAS),
  lab('BCH03L', 'Biomolecules Laboratory', 2, 'SECOND', 2, CAS),
  lec('MCB01', 'General Microbiology', 3, 'SECOND', 2, CAS),
  lab('MCB01L', 'General Microbiology Laboratory', 2, 'SECOND', 2, CAS),
  lec('BST01', 'Statistical Biology', 2, 'FIRST', 3, CAS),
  lab('BST01L', 'Statistical Biology Laboratory', 1, 'FIRST', 3, CAS),
  lec('MCB02', 'Food Safety', 2, 'FIRST', 3, CAS),
  lab('MCB02L', 'Food Safety Laboratory', 1, 'FIRST', 3, CAS),
  lec('BIO04', 'General Physiology', 3, 'FIRST', 3, CAS),
  lab('BIO04L', 'General Physiology Laboratory', 2, 'FIRST', 3, CAS),
  lec('BIO05', 'Systematics', 3, 'FIRST', 3, CAS),
  lab('BIO05L', 'Systematics Laboratory', 2, 'FIRST', 3, CAS),
  lec('BIO101', 'Thesis I', 2, 'FIRST', 3, CAS),
  lec('BIO06', 'Developmental Biology', 3, 'SECOND', 3, CAS),
  lab('BIO06L', 'Developmental Biology Laboratory', 2, 'SECOND', 3, CAS),
  lec('BIO07', 'Cell and Molecular Biology', 3, 'SECOND', 3, CAS),
  lab('BIO07L', 'Cell and Molecular Biology Laboratory', 2, 'SECOND', 3, CAS),
  lec('BIO08', 'Marine Biology', 3, 'SECOND', 3, CAS),
  lab('BIO08L', 'Marine Biology Laboratory', 2, 'SECOND', 3, CAS),
  lec('ELE01', 'Elective 1 (Bioinformatics)', 3, 'SECOND', 3, CAS),
  lec('BIO102', 'Thesis II', 2, 'SECOND', 3, CAS),
  lec('BIO10', 'Introduction to Philippine Wildlife', 3, 'FIRST', 4, CAS),
  lab('BIO10L', 'Philippine Wildlife Laboratory', 2, 'FIRST', 4, CAS),
  lec('BIO11', 'Ethnobotany', 3, 'FIRST', 4, CAS),
  lab('BIO11L', 'Ethnobotany Laboratory', 2, 'FIRST', 4, CAS),
  lec('ELEC02', 'Elective 2 (Teaching Methods)', 3, 'FIRST', 4, CAS),
  lec('BIO103', 'Thesis III', 2, 'FIRST', 4, CAS),
  lec('BIO13', 'Microbial Ecology', 3, 'SECOND', 4, CAS),
  lab('BIO13L', 'Microbial Ecology Laboratory', 2, 'SECOND', 4, CAS),
  lec('BIO14', 'Evolutionary Biology', 3, 'SECOND', 4, CAS),
  lab('BIO14L', 'Evolutionary Biology Laboratory', 2, 'SECOND', 4, CAS),
  lec('BIO110', 'Practicum', 3, 'SECOND', 4, CAS),

  // ─── BA Communication ───────────────────────────────────────────────────────
  lec('COM01', 'Introduction to Communication Media', 3, 'FIRST', 2, CAS),
  lec('COM02', 'Communication Theory', 3, 'FIRST', 2, CAS),
  lec('COM04', 'Communication Culture and Society', 3, 'FIRST', 2, CAS),
  lec('COM05', 'Communication Media Laws and Ethics', 3, 'FIRST', 2, CAS),
  lec('COM09', 'Risk Disaster & Humanitarian Communication', 3, 'SECOND', 2, CAS),
  lec('COM11', 'Journalism Principles and Practices', 3, 'SECOND', 2, CAS),
  lec('COM12', 'Broadcasting Principles and Practices', 3, 'SECOND', 2, CAS),
  lec('COM13', 'Social Media Principles and Practices', 3, 'SECOND', 2, CAS),
  lec('COM16', 'Creative Writing', 3, 'SECOND', 2, CAS),
  lec('CSH01', 'Sociology of Language Communication', 3, 'SECOND', 2, CAS),
  lec('COM03', 'Communication Research', 3, 'FIRST', 3, CAS),
  lec('COM08', 'Development Communication', 3, 'FIRST', 3, CAS),
  lec('COM10', 'Knowledge Management', 3, 'FIRST', 3, CAS),
  lec('COM17', 'Introduction to Theater Arts', 3, 'FIRST', 3, CAS),
  lec('COM18', 'Organizational Culture and Communication', 3, 'FIRST', 3, CAS),
  lec('RES01', 'Methods of Research', 3, 'SECOND', 3, CAS),
  lec('COM14', 'Advertising Principles and Practices', 3, 'SECOND', 3, CAS),
  lec('COM15', 'Introduction to Film', 3, 'SECOND', 3, CAS),
  lec('COM19', 'Behavioral and Social Change Communication', 3, 'SECOND', 3, CAS),
  lec('CSH02', 'Language Gender and Media', 3, 'SECOND', 3, CAS),
  lec('RES02', 'Thesis Writing', 3, 'FIRST', 4, CAS),
  lec('COM06', 'Communication Planning', 3, 'FIRST', 4, CAS),
  lec('CSH03', 'Discourse and Communication', 3, 'FIRST', 4, CAS),
  lec('CSH04', 'Foreign Language', 3, 'FIRST', 4, CAS),
  lec('CSH05', 'Principles of Teaching with Media and Technology', 3, 'FIRST', 4, CAS),
  lec('COM07', 'Communication Management', 3, 'SECOND', 4, CAS),

  // ─── BA History ─────────────────────────────────────────────────────────────
  lec('HST01', 'Intro to the Study & Writing History', 3, 'FIRST', 2, CAS),
  lec('HSTE1', 'Geography', 3, 'FIRST', 2, CAS),
  lec('FLS01', 'Elementary Spanish', 3, 'FIRST', 2, CAS),
  lec('HST02', 'Pre-16th Century Philippines', 3, 'SECOND', 2, CAS),
  lec('HST03', 'Philippine Cultural History', 3, 'SECOND', 2, CAS),
  lec('HST04', 'Survey of Asian Civilizations', 3, 'SECOND', 2, CAS),
  lec('FLS02', 'Advanced Spanish', 3, 'SECOND', 2, CAS),
  lec('HST05', 'Survey of Western Civilizations', 3, 'FIRST', 3, CAS),
  lec('HST06', 'Philosophy of History', 3, 'FIRST', 3, CAS),
  lec('HST07', 'Nationalism and Revolution', 3, 'FIRST', 3, CAS),
  lec('FLS03', 'Reading and Translation in Spanish', 3, 'FIRST', 3, CAS),
  lec('HST08', 'Historical Methodology', 3, 'SECOND', 3, CAS),
  lec('HST09', 'Mainland Southeast Asia', 3, 'SECOND', 3, CAS),
  lec('HST10', 'Modern East Asia', 3, 'SECOND', 3, CAS),
  lec('HSTE2', 'Heritage Studies', 3, 'SECOND', 3, CAS),
  lec('FLS04', 'Obras Literarias delos Heroes', 3, 'SECOND', 3, CAS),
  lec('HST11', 'Senior Thesis', 3, 'FIRST', 4, CAS),
  lec('HST12', 'History of USA', 3, 'FIRST', 4, CAS),
  lec('HSTE3', 'Indigenous Studies', 3, 'FIRST', 4, CAS),
  lec('HSTE4', 'Museology', 3, 'SECOND', 4, CAS),

  // ─── BS Mathematics ─────────────────────────────────────────────────────────
  lec('MAT09', 'Fundamental Concept of Computing I', 2, 'FIRST', 1, CAS),
  lab('MAT09L', 'Fundamental Concept of Computing I Laboratory', 1, 'FIRST', 1, CAS),
  lec('MAT05a', 'Calculus II', 4, 'SECOND', 1, CAS),
  lec('MAT11', 'Fundamental Concepts of Mathematics', 3, 'SECOND', 1, CAS),
  lec('MAT15', 'Abstract Algebra I', 3, 'FIRST', 2, CAS),
  lec('MAT10', 'Fundamental Concepts of Computing II', 2, 'FIRST', 2, CAS),
  lab('MAT10L', 'Fundamental Concepts of Computing II Laboratory', 1, 'FIRST', 2, CAS),
  lec('MAT06a', 'Calculus III', 4, 'FIRST', 2, CAS),
  lec('PHY01', 'General Physics I', 3, 'FIRST', 2, CAS),
  lab('PHY01L', 'General Physics I Laboratory', 1, 'FIRST', 2, CAS),
  lec('MAT16', 'Linear Algebra', 3, 'SECOND', 2, CAS),
  lec('PHY02', 'General Physics II', 2, 'SECOND', 2, CAS),
  lab('PHY02L', 'General Physics II Laboratory', 1, 'SECOND', 2, CAS),
  lec('MAT19', 'Probability', 3, 'SECOND', 2, CAS),
  lec('MAT18', 'Advanced Calculus I', 3, 'SECOND', 2, CAS),
  lec('MAT33', 'Real Analysis', 3, 'FIRST', 3, CAS),
  lec('MAT14', 'Theory of Interest', 3, 'FIRST', 3, CAS),
  lec('MAT20', 'Statistical Theory', 2, 'FIRST', 3, CAS),
  lab('MAT20L', 'Statistical Theory Laboratory', 1, 'FIRST', 3, CAS),
  lec('MAT07', 'Differential Equations I', 2, 'FIRST', 3, CAS),
  lab('MAT07L', 'Differential Equations I Laboratory', 1, 'FIRST', 3, CAS),
  lec('MAT34', 'Topology', 3, 'SECOND', 3, CAS),
  lec('MAT32', 'Modern Geometry', 3, 'SECOND', 3, CAS),
  lec('MAT24', 'Mathematical Modelling', 2, 'SECOND', 3, CAS),
  lab('MAT24L', 'Mathematical Modelling Laboratory', 1, 'SECOND', 3, CAS),
  lec('MAT23', 'Operations Research I', 2, 'SECOND', 3, CAS),
  lab('MAT23L', 'Operations Research I Laboratory', 1, 'SECOND', 3, CAS),
  lec('MAT35', 'Complex Analysis', 3, 'FIRST', 4, CAS),
  lec('MAT30', 'Numerical Analysis', 2, 'FIRST', 4, CAS),
  lab('MAT30L', 'Numerical Analysis Laboratory', 1, 'FIRST', 4, CAS),

  // ─── BA Psychology ──────────────────────────────────────────────────────────
  lec('PSY01', 'Introduction to Psychology', 3, 'SECOND', 1, CAS),
  lec('PSY02', 'Psychological Statistics', 5, 'FIRST', 2, CAS),
  lec('PSY03', 'Bio Psychological', 3, 'FIRST', 2, CAS),
  lec('PSY04', 'Developmental Psychology', 3, 'FIRST', 2, CAS),
  lec('PSY05', 'Theories of Personality', 3, 'SECOND', 2, CAS),
  lec('PSY06', 'Experimental Psychology', 5, 'SECOND', 2, CAS),
  lec('PSY07', 'Cognitive Psychology', 3, 'SECOND', 2, CAS),
  lec('PSY10', 'Social Psychology', 3, 'FIRST', 3, CAS),
  lec('PSY09', 'Abnormal Psychology', 3, 'FIRST', 3, CAS),
  lec('PSY08', 'Field Methods in Psychology', 5, 'FIRST', 3, CAS),
  lec('PSY11', 'Industrial Psychology', 3, 'FIRST', 3, CAS),
  lec('PSY12', 'Psychological Assessment', 5, 'SECOND', 3, CAS),
  lec('PSY13', 'Culture and Psychology', 3, 'SECOND', 3, CAS),
  lec('PSY14', 'Research 1', 3, 'SECOND', 3, CAS),
  lec('PSY-ELE01', 'Introduction to Clinical Psychology', 3, 'FIRST', 4, CAS),
  lec('PSY15', 'Research 2', 3, 'FIRST', 4, CAS),
  lec('PSY-ELE02', 'Strategic Human Resource Management', 3, 'FIRST', 4, CAS),
  lec('PSY-ELE03', 'Practicum in Psychology', 3, 'SECOND', 4, CAS),
  lec('PSY-ELE04', 'Integrative Course in Psychology', 3, 'SECOND', 4, CAS),
]

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('=== Seed ALL Curriculum Subjects ===\n')

  // Step 1: Find subjects referenced by ScheduleEntry
  const referencedSubjects = await db.scheduleEntry.findMany({
    select: { subjectId: true },
    distinct: ['subjectId'],
  })
  const referencedIds = new Set(referencedSubjects.map((e) => e.subjectId))
  console.log(`Found ${referencedIds.size} subjects referenced by ScheduleEntry.\n`)

  // Step 2: Get all existing subjects
  const existingSubjects = await db.subject.findMany({
    select: { id: true, code: true },
  })
  console.log(`Found ${existingSubjects.length} existing subjects in database.\n`)

  // Step 3: Delete unreferenced subjects, warn about referenced ones
  let deletedCount = 0
  let skippedCount = 0
  const skippedCodes: string[] = []

  for (const subj of existingSubjects) {
    if (referencedIds.has(subj.id)) {
      skippedCount++
      skippedCodes.push(subj.code)
    } else {
      await db.subject.delete({ where: { id: subj.id } })
      deletedCount++
    }
  }

  console.log(`Deleted ${deletedCount} unreferenced subjects.`)
  if (skippedCount > 0) {
    console.warn(
      `\n⚠ WARNING: Skipped ${skippedCount} subjects referenced by ScheduleEntry:`,
    )
    console.warn(`  ${skippedCodes.join(', ')}\n`)
  }

  // Step 4: Upsert all subjects
  console.log(`\nUpserting ${subjects.length} subjects...\n`)
  let upsertedCount = 0

  for (const s of subjects) {
    const roomTypes: string[] =
      s.type === 'LABORATORY' ? ['LABORATORY'] : ['LECTURE_ROOM']

    const data = {
      title: s.title,
      units: s.units,
      hoursPerWeek: s.units,
      type: s.type,
      semester: s.semester,
      year: s.year,
      departmentId: s.departmentId,
      requiredRoomType: roomTypes as any,
    }

    await db.subject.upsert({
      where: { code: s.code },
      update: data as any,
      create: { code: s.code, ...data } as any,
    })
    upsertedCount++
  }

  // Step 5: Summary
  const finalCount = await db.subject.count()
  console.log(`\n=== Summary ===`)
  console.log(`  Deleted:  ${deletedCount} unreferenced subjects`)
  console.log(`  Skipped:  ${skippedCount} referenced subjects (kept)`)
  console.log(`  Upserted: ${upsertedCount} subjects`)
  console.log(`  Total subjects in DB: ${finalCount}`)
  console.log(`\nDone!`)
}

main()
  .catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
