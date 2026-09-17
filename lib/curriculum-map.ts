/**
 * Curriculum mapping — exact per-program, per-year, per-semester subject codes.
 * Drives the subject dropdown filtering in the schedule entry form.
 */

interface CurriculumEntry {
  code: string
  year: number
  semester: "FIRST" | "SECOND"
}

function e(codes: string[], year: number, semester: "FIRST" | "SECOND"): CurriculumEntry[] {
  return codes.map(code => ({ code, year, semester }))
}

// ── BAComm ────────────────────────────────────────────────────────────────────
const BAComm: CurriculumEntry[] = [
  ...e(['GEC02','GEC06','GEC08','GEC09','GEC10','PATHFit01','NST01'], 1, 'FIRST'),
  ...e(['GEC01','GEC03','GEC05','GEC07','GEC13','PATHFit02','NST02'], 1, 'SECOND'),
  ...e(['COM01','COM02','COM04','COM05','GEC04','GEC14','PATHFit03'], 2, 'FIRST'),
  ...e(['COM09','COM11','COM12','COM13','COM16','CSH01','GEC11','PATHFit04'], 2, 'SECOND'),
  ...e(['COM03','COM08','COM10','COM17','COM18','GEC12'], 3, 'FIRST'),
  ...e(['RES01','COM14','COM15','COM19','CSH02'], 3, 'SECOND'),
  ...e(['RES02','COM06','CSH03','CSH04','CSH05'], 4, 'FIRST'),
  ...e(['COM07'], 4, 'SECOND'),
]

// ── BAHist ────────────────────────────────────────────────────────────────────
const BAHist: CurriculumEntry[] = [
  ...e(['GEC02','GEC03','GEC05','GEC06','PATHFit01','NSTP1'], 1, 'FIRST'),
  ...e(['GEC01','GEC04','GEC08','GEC10','GEC09','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['GEC07','GEC13','HST01','HSTE1','FLS01','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC11','HST02','HST03','HST04','FLS02','PATHFit04'], 2, 'SECOND'),
  ...e(['HST05','HST06','HST07','FLS03','GEC14','GEC12'], 3, 'FIRST'),
  ...e(['HST08','HST09','HST10','HSTE2','FLS04'], 3, 'SECOND'),
  ...e(['HST11','HST12','HSTE3'], 4, 'FIRST'),
  ...e(['HSTE4'], 4, 'SECOND'),
]

// ── BSBio ─────────────────────────────────────────────────────────────────────
const BSBio: CurriculumEntry[] = [
  ...e(['GEC08','GEC10','BOT01','BOT01L','ZOO01','ZOO01L','PATHFit01','NSTP1'], 1, 'FIRST'),
  ...e(['GEC02','GEC03','GEC05','BCH01','BIO01','BIO01L','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['GEC07','BCH02','BCH02L','BIO02','BIO02L','BPH00','BPH00L','BIO03','BIO03L','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC09','GEC11','GEC13','BCH03','BCH03L','MCB01','MCB01L','PATHFit04'], 2, 'SECOND'),
  ...e(['GEC04','GEC06','BST01','BST01L','MCB02','MCB02L','BIO04','BIO04L','BIO05','BIO05L','BIO101'], 3, 'FIRST'),
  ...e(['GEC01','BIO06','BIO06L','BIO07','BIO07L','BIO08','BIO08L','ELE01','BIO102'], 3, 'SECOND'),
  ...e(['BIO10','BIO10L','BIO11','BIO11L','ELE02','BIO103'], 4, 'FIRST'),
  ...e(['BIO13','BIO13L','BIO14','BIO14L','BIO110'], 4, 'SECOND'),
]

// ── BSMath ────────────────────────────────────────────────────────────────────
const BSMath: CurriculumEntry[] = [
  ...e(['MAT04a','MAT09','MAT09L','GEC01','GEC05','GEC08','PATHFit01','NST01'], 1, 'FIRST'),
  ...e(['MAT05a','MAT11','GEC02','GEC06','GEC10','PATHFit02','NST02'], 1, 'SECOND'),
  ...e(['MAT15','MAT10','MAT10L','MAT06a','PHY01','PHY01L','GEC07','GEC13','PATHFit03'], 2, 'FIRST'),
  ...e(['MAT16','PHY02','PHY02L','MAT19','MAT18','GEC09','GEC11','PATHFit04'], 2, 'SECOND'),
  ...e(['MAT33','MAT14','MAT20','MAT20L','MAT07','MAT07L','GEC04'], 3, 'FIRST'),
  ...e(['MAT34','MAT32','MAT24','MAT24L','GEC03','MAT23','MAT23L','RES01'], 3, 'SECOND'),
  ...e(['MAT35','MAT30','MAT30L','RES02'], 4, 'FIRST'),
]

// ── BAPsych ───────────────────────────────────────────────────────────────────
const BAPsych: CurriculumEntry[] = [
  ...e(['GEC02','GEC08','GEC10','GEC04','PATHFit01','NST01'], 1, 'FIRST'),
  ...e(['GEC01','GEC03','GEC05','GEC06','PSY01','PATHFit02','NST02'], 1, 'SECOND'),
  ...e(['GEC07','PSY02','PSY03','PSY04','PATHFit03','GEC13'], 2, 'FIRST'),
  ...e(['GEC09','GEC11','PSY05','PSY06','PSY07','PATHFit04','GEC14'], 2, 'SECOND'),
  ...e(['PSY10','PSY09','PSY08','PSY11'], 3, 'FIRST'),
  ...e(['PSY12','PSY13','PSY14','GEC12'], 3, 'SECOND'),
  ...e(['PSY-ELE01','PSY15','PSY-ELE02'], 4, 'FIRST'),
  ...e(['PSY-ELE03','PSY-ELE04'], 4, 'SECOND'),
]

// ── BSIT-Garm (AFT) ───────────────────────────────────────────────────────────
const BSIT_Garm: CurriculumEntry[] = [
  ...e(['AFT01','AFT02','AFT02L','AFT03','AFT03L','GEC01','GEC04','COM01a','COM01aL','PATHFit01','NST01'], 1, 'FIRST'),
  ...e(['AFT04','AFT04L','AFT05','AFT05L','GEC02','GEC05','IIT01','IIT01L','IND01','IND01L','PATHFit02'], 1, 'SECOND'),
  ...e(['AFT06','AFT06L','AFT07','AFT07L','AFT08','AFT08L','CHM01a','CHM01aL','GEC08','GEC09','GEL07','GEL10','PATHFit03'], 2, 'FIRST'),
  ...e(['AFT09','AFT09L','PHY01a','PHY01aL','MAT04a','GEC03','GEC06','GEC07','GEL01','PATHFit04'], 2, 'SECOND'),
  ...e(['AFT10','AFT10L','AFT11','AFT11L','RES01a','RES01aL','PSY11a','MTM01','IEN08a','IEN04a'], 3, 'FIRST'),
  ...e(['AFT12','AFT13','AFT14','AFT14L','RES02a','RES02aL','FLO01','MGT02','IEN11a'], 3, 'SECOND'),
]

// ── BSIT-Auto (AIT) ───────────────────────────────────────────────────────────
const BSIT_Auto: CurriculumEntry[] = [
  ...e(['AIT01','AIT02','AIT03','CHM01a','IND01','GEC02','GEC05','PATHFit01','NST01'], 1, 'FIRST'),
  ...e(['AIT04','AIT04L','AIT05','AIT05L','AIT06','AIT06L','IIT01','IIT01L','COM01a','COM01aL','MAT04a','PATHFit02','NSTP02'], 1, 'SECOND'),
  ...e(['AIT07','AIT07L','AIT08','AIT08L','AIT09','AIT09L','AIT10','AIT10L','PHY01a','PHY01aL','GEL01','GEC09','PATHFit03'], 2, 'FIRST'),
  ...e(['AIT11','AIT11L','AIT12','AIT12L','AIT13','AIT13L','GEC07','GEC03','GEC04','MTM01','PATHFit04'], 2, 'SECOND'),
  ...e(['AIT14','AIT14L','RES01a','RES01aL','PSY11a','GEC06','GEL07','GEC08','MGT02','IEN11a'], 3, 'FIRST'),
  ...e(['AIT15','AIT15L','AIT16','RES02a','RES02aL','FLO01','GEL10','GEC01','IEN08a','IEN04a'], 3, 'SECOND'),
]

// ── BSIT-Comp (CPT) ───────────────────────────────────────────────────────────
const BSIT_Comp: CurriculumEntry[] = [
  ...e(['CPT02a','CPT02aL','CPT04','CPT04L','CPT05','CPT05L','IIT01','IIT01L','COM01a','COM01aL','GEC01','GEC04','PATHFit01','NST01'], 1, 'FIRST'),
  ...e(['CPT01','CPT08a','CPT08aL','ITE15','ITE15L','IND01','IND01L','GEC02','GEC05','PATHFit02','NSTP02'], 1, 'SECOND'),
  ...e(['CPT10','CPT10L','CHM01a','CHM01aL','MAT04a','GEC08','GEC09','GEL07','GEL10','PATHFit03'], 2, 'FIRST'),
  ...e(['CPT14','CPT14L','CPT16','CPT16L','PHY01a','PHY01aL','GEC03','GEC06','GEC07','GEL01','PATHFit04'], 2, 'SECOND'),
  ...e(['CPT17','CPT17L','CPT18','CPT18L','CPT19','CPT19L','RES01a','RES01aL','PSY11a','FLO01','MTM01'], 3, 'FIRST'),
  ...e(['ITE28','ITE28L','CPT11a','CPT11aL','RES02a','RES02aL','ITE13a','IEN08a','IEN04a','MGT02','IEN11a'], 3, 'SECOND'),
]

// ── BSIT-Food (CUL) ───────────────────────────────────────────────────────────
const BSIT_Food: CurriculumEntry[] = [
  ...e(['CUL01','CUL02','CUL02L','CUL03','GEC01','GEC04','COM01a','COM01aL','PATHFit01','NSTP01'], 1, 'FIRST'),
  ...e(['CUL04','CUL04L','CUL05','CUL05L','GEC02','GEC05','IIT01','IIT01L','IND01','IND01L','PATHFit02','NSTP02'], 1, 'SECOND'),
  ...e(['CUL06','CUL06L','CUL07','CUL07L','CHM01a','GEC08','GEC09','GEL07','MTM01','PATHFit03'], 2, 'FIRST'),
  ...e(['CUL08','CUL08L','CUL09','CUL09L','PHY01a','PHY01aL','MAT04a','GEC03','GEC06','GEC07','PATHFit04'], 2, 'SECOND'),
  ...e(['CUL10','CUL10L','CUL11','CUL12','CUL12L','RES01a','RES01aL','GEL10','PSY11a','MGT02','IEN11a'], 3, 'FIRST'),
  ...e(['CUL13','CUL13L','CUL14','CUL14L','RES02a','RES02aL','GEL01','FLO01','IEN08a','IEN04a'], 3, 'SECOND'),
]

// ── BSIT-Eltx (ELX) ───────────────────────────────────────────────────────────
const BSIT_Eltx: CurriculumEntry[] = [
  ...e(['ELX01','ELX02','ELX02L','ELX03','ELX03L','ELX04','ELX04L','IND01','IND01L','GEC05','COM01a','COM01aL','PATHFit01','NST01'], 1, 'FIRST'),
  ...e(['ELX05','ELX05L','ELX06','ELX06L','ELX07','ELX07L','MAT04a','CHM01a','IIT01','IIT01L','PATHFit02','NSTP02'], 1, 'SECOND'),
  ...e(['ELX08','ELX08L','ELX09','ELX09L','ELX10','PHY01a','PHY01aL','GEL01','GEC09','MTM01','PATHFit03'], 2, 'FIRST'),
  ...e(['ELX11','ELX11L','ELX12','ELX12L','ELX13','ELX13L','GEC07','GEC04','IEN08a','IEN04a','PATHFit04'], 2, 'SECOND'),
  ...e(['ELT17','ELT17L','RES01a','RES01aL','GEC02','GEC03','GEL07','GEC08','GEL10','PSY11a'], 3, 'FIRST'),
  ...e(['ELT18','ELT18L','RES02a','RES02aL','GEC01','FLO01','GEC06','MGT02','IEN11a'], 3, 'SECOND'),
]

// ── BSIT-Elec (ELT) ───────────────────────────────────────────────────────────
const BSIT_Elec: CurriculumEntry[] = [
  ...e(['ELT01','ELT02','ELT02L','ELT03','ELT03L','ELT04','ELT04L','ELT05','ELT06','ELT06L','GEC05','IND01','IND01L','PATHFit01','NSTP01'], 1, 'FIRST'),
  ...e(['ELT07','ELT07L','ELT08','ELT08L','ELT09','ELT09L','ELT10','ELT10L','CHM01a','IIT01','IIT01L','COM01a','COM01aL','PATHFit02','NSTP02'], 1, 'SECOND'),
  ...e(['ELT11','ELT11L','ELT12','ELT12L','ELT13','ELT13L','GEL01','MAT04a','GEC09','PHY01a','PHY01aL','PATHFit03'], 2, 'FIRST'),
  ...e(['ELT14','ELT14L','ELT15','ELT15L','ELT16','ELT16L','GEC04','GEC07','MTM01','IEN08a','IEN04a','PATHFit04'], 2, 'SECOND'),
  ...e(['ELT17','ELT17L','RES01a','RES01aL','GEC02','GEC03','GEL07','GEC08','GEL10','PSY11a'], 3, 'FIRST'),
  ...e(['ELT18','ELT18L','RES02a','RES02aL','GEC01','FLO01','GEC06','MGT02','IEN11a'], 3, 'SECOND'),
]

// ── BSIT-Mech (MET) ───────────────────────────────────────────────────────────
const BSIT_Mech: CurriculumEntry[] = [
  ...e(['MET01','MET02','MET02L','MET03','MET03L','IND01','IND01L','GEC02','GEC05','PATHFit01','NSTP01'], 1, 'FIRST'),
  ...e(['MET04','MET04L','MET05','MET05L','IIT01','IIT01L','COM01a','COM01aL','GEC01','GEC04','PATHFit02','NSTP02'], 1, 'SECOND'),
  ...e(['MET06','MET06L','MET07','MAT04a','PHY01a','PHY01aL','GEC07','GEL01','GEC03','GEC06','PATHFit03'], 2, 'FIRST'),
  ...e(['MET08','MET08L','MET09','MET09L','CHM01a','GEC09','GEL07','GEL10','GEC08','PATHFit04'], 2, 'SECOND'),
  ...e(['MET10','MET10L','MET11','MET11L','RES01a','RES01aL','MTM01','MGT02','IEN11a'], 3, 'FIRST'),
  ...e(['MET12','MET12L','MET13','MET13L','RES02a','RES02aL','FLO01','PSY11a','IEN08a','IEN04a'], 3, 'SECOND'),
]

// ── BSIT-Print (PMT) ──────────────────────────────────────────────────────────
const BSIT_Print: CurriculumEntry[] = [
  ...e(['PMT01','PMT02','PMT02L','PMT03','PMT03L','GEC01','GEC04','COM01a','COM01aL','PATHFit01','NSTP01'], 1, 'FIRST'),
  ...e(['PMT04','PMT04L','PMT05','PMT05L','GEC05','GEC02','IIT01','IIT01L','IND01','IND01L','PATHFit02','NSTP02'], 1, 'SECOND'),
  ...e(['PMT06','PMT06L','PHY01a','PHY01aL','MAT04a','GEC03','GEC06','GEC07','GEL01','PATHFit03'], 2, 'FIRST'),
  ...e(['PMT07','PMT07L','PMT08','PMT08L','CHM01a','GEC08','GEC09','GEL07','GEL10','PATHFit04'], 2, 'SECOND'),
  ...e(['PMT09','PMT09L','PMT10','PMT10L','RES01a','RES01aL','IEN08a','PSY11','IEN11a'], 3, 'FIRST'),
  ...e(['PMT11','PMT11L','PMT12','PMT12L','RES02a','RES02aL','MTM01','IEN04a','MGT02','FLO01'], 3, 'SECOND'),
]

// ── BSInfoTech (ITE) ──────────────────────────────────────────────────────────
const BSInfoTech: CurriculumEntry[] = [
  ...e(['GEC04','GEC05','GEC08','GEC10','ITE01','ITE01L','PATHFit01','NSTP01'], 1, 'FIRST'),
  ...e(['GEC02','GEC03','GEC06','GEC11','ITE02','ITE02L','PATHFit02','NSTP02'], 1, 'SECOND'),
  ...e(['GEC01','GEC09','ITE03','ITE04','ITE05','ITE05L','ITE06','ITE06L','ITE07','ITE07L','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC07','GEC13','ITE08','ITE08L','ITE09','ITE09L','ITE10','ITE10L','ITE11','ITE11L','PATHFit04'], 2, 'SECOND'),
  ...e(['ITE12','ITE13','ITE14','ITE15','ITE15L','ITE16','ITE16L','ITE17','ITE17L','ITE18','ITE18L'], 3, 'FIRST'),
  ...e(['ITE19','ITE19L','ITE20','ITE20L','ITE21','ITE21L','ITE22','ITE23','ITE24','ITE24L','ITE25','ITE25L'], 3, 'SECOND'),
  ...e(['ITE26','ITE27','ITE28','ITE28L','ITE29','ITE30','ITE31','ITE31L','ITE32','ITE32L'], 4, 'FIRST'),
]

// ═══════════════════════════════════════════════════════════════
// CTE / CEN / CAM / CABHA — generated from prisma/curricula/*.ts (the same data
// prisma/seed-curriculum-colleges.ts writes), so codes here match the DB rows
// exactly. CEN and CAM documents cover the SECOND semester only. BCAEd's mid-year
// AAF01 is not listed (the map has no SUMMER term).
// ═══════════════════════════════════════════════════════════════

// ── BCAEd (CTE) ────────────────────────────────────────────────────────────
const BCAEd: CurriculumEntry[] = [
  ...e(['CAED01','CAED02','GEC01','GEC04','GEC08','GEC10','PED01','PATHFit01','NSTP1'], 1, 'FIRST'),
  ...e(['GEC02','GEC03','GEC05','GEC06','PED04','CAE-ELE01','CAE23','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['GEC09','GEC11','CAE03','CAE04','CAE05','CAE06','CAE07','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC07','GEC12','PED02','PED03','CAE08','CAE09','CAE10','CAE11','PATHFit04'], 2, 'SECOND'),
  ...e(['PED05','PED06','PED08','PED09','CAE12','CAE13','CAE14','CAE15'], 3, 'FIRST'),
  ...e(['PED07','PED10','CAE20','CAE22','CAE16','CAE17','CAE18','CAE19'], 3, 'SECOND'),
  ...e(['CAED21','FS001','FS002','ICL01'], 4, 'FIRST'),
  ...e(['PED11'], 4, 'SECOND'),
]

// ── BEEd (CTE) ─────────────────────────────────────────────────────────────
const BEEd: CurriculumEntry[] = [
  ...e(['GEC01','GEC04','GEC08','GEC10','PED01','ELE16','ELE17','PATHFit01','NSTP1'], 1, 'FIRST'),
  ...e(['GEC02','GEC03','GEC05','GEC06','PED04','PED08','ELE13','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['GEC09','GEC11','PED05','PED06','PED09','ELE11','ELE12','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC07','GEC14','PED02','PED07','PED10','ELE01','ELE07','ELE14','PATHFit04'], 2, 'SECOND'),
  ...e(['ELE02','ELE03','ELE05','ELE08','ELE09','ELE15','ELE18'], 3, 'FIRST'),
  ...e(['PED03','ELE04','ELE06','ELE10','ELC01'], 3, 'SECOND'),
  ...e(['FS001','FS002','TCC01'], 4, 'FIRST'),
  ...e(['PED11'], 4, 'SECOND'),
]

// ── BSEd-Sci (CTE) ─────────────────────────────────────────────────────────
const BSEd_Sci: CurriculumEntry[] = [
  ...e(['GEC01','GEC04','GEC08','GEC10','PATHFit01','NSTP1','PED01','CHM01','CHM01L'], 1, 'FIRST'),
  ...e(['GEC02','GEC03','GEC05','GEC06','PATHFit02','NSTP2','PED04','CHM02','CHM02L'], 1, 'SECOND'),
  ...e(['GEC09','GEC11','PED02','CHM03','BIO01','BIO01L','PHY01','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC07','GEL07','PED03','PED10','CHM04','CHM04L','PHY02','PHY02L','PHY03','PHY03L','PATHFit04'], 2, 'SECOND'),
  ...e(['PED08','PED06','PED05','BIO02','BIO02L','SED01','SED02','NSC01','BIO03','BIO03L'], 3, 'FIRST'),
  ...e(['NSC04','PED07','SED03','PHY04','PHY04L','BIO04','BIO04L','PHY05','NSC02','NSC03'], 3, 'SECOND'),
  ...e(['FS001','FS002','TCC01'], 4, 'FIRST'),
  ...e(['PED11'], 4, 'SECOND'),
]

// ── BSEd-SS (CTE) ──────────────────────────────────────────────────────────
const BSEd_SS: CurriculumEntry[] = [
  ...e(['GEC01','GEC04','GEC08','GEC10','PATHFit01','NSTP1','PED01','FSE01','SSE05'], 1, 'FIRST'),
  ...e(['GEC02','GEC03','GEC05','GEC06','PATHFit02','NSTP2','PED04','SSE06','SSE13'], 1, 'SECOND'),
  ...e(['GEC09','GEC11','PED02','PED09','FSE04','SSE11','SSE08','SSE03','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC07','GEC12','PED03','PED10','SSE09','SSE07','SSE15','SSE12','PATHFit04'], 2, 'SECOND'),
  ...e(['PED08','PED06','PED05','SSE20','SSE21','SSE14','FSE02'], 3, 'FIRST'),
  ...e(['SSE23','PED07','SSE25','SSE22','SSE27','SSE24','FSE03'], 3, 'SECOND'),
  ...e(['FS001','FS002','TCC01','SSE26'], 4, 'FIRST'),
  ...e(['PED11'], 4, 'SECOND'),
]

// ── BTLEd-HE (CTE) ─────────────────────────────────────────────────────────
const BTLEd_HE: CurriculumEntry[] = [
  ...e(['GEC01','GEC04','GEC08','GEC10','PED01','INA01','ICT01','ICT01L','PATHFit01','NSTP1'], 1, 'FIRST'),
  ...e(['GEC02','GEC03','GEC05','GEC06','PED04','INA02','ICT02','ICT02L','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['GEC09','GEC11','PED02','PED03','HE001','HE002','AF001','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC07','GEC13','PED08','PED10','PED05','AF002','HEM01','HEM01L','HEM02','PATHFit04'], 2, 'SECOND'),
  ...e(['PED06','TEC01','PED09','RES01','HEM03','HEM03L','HEM04','HEM04L','HEM05','HEM05L','HEM06','HEM06L','HEM07','HEM07L'], 3, 'FIRST'),
  ...e(['PED07','RES02','HEM08','HEM09','HEM10','HEM10L','HEM11','HEM11L','HEM12','HEM12L','ET001'], 3, 'SECOND'),
  ...e(['FS001','FS002','TCC01'], 4, 'FIRST'),
  ...e(['PED11'], 4, 'SECOND'),
]

// ── BSESS (CTE) ────────────────────────────────────────────────────────────
const BSESS: CurriculumEntry[] = [
  ...e(['GEC01','GEC04','GEC08','GEC10','ESS01','ESS02','PATHFit01','NSTP1'], 1, 'FIRST'),
  ...e(['GEC02','GEC03','GEC05','GEC06','ESS03','ESS04','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['GEC09','GEC11','ESS05','ESS06','ESS07','ESS08','ESS09','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC07','GEL07','ESS10','ESS11','ESS12','ESS13','ESS14','PATHFit04'], 2, 'SECOND'),
  ...e(['ESS15','ESS16','ESS17','ESS18','ESS19','ESS20','ESS21'], 3, 'FIRST'),
  ...e(['ESS22','ESS23','ESS24','ESS25','ESS26','ESS27'], 3, 'SECOND'),
  ...e(['ESS28'], 4, 'FIRST'),
  ...e(['ESS29'], 4, 'SECOND'),
]

// ── BTLEd-IA (CTE) ─────────────────────────────────────────────────────────
const BTLEd_IA: CurriculumEntry[] = [
  ...e(['GEC01','GEC04','GEC08','GEC10','PED01','INA01','ICT01','ICT01L','PATHFit01','NSTP1'], 1, 'FIRST'),
  ...e(['GEC02','GEC03','GEC05','GEC06','PED04','INA02','ICT02','ICT02L','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['GEC09','GEC11','PED02','PED03','HE001','HE002','AF001','ENT01','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC07','GEC13','PED08','PED10','PED05','AF002','IAM01','IAM01L','IAM02','IAM02L','PATHFit04'], 2, 'SECOND'),
  ...e(['PED06','TEC01','PED09','RES01','IAM03','IAM03L','IAM04','IAM04L','IAM05','IAM05L','IAM06','IAM06L','IAM07','IAM07L'], 3, 'FIRST'),
  ...e(['PED07','RES02','IAM08','IAM08L','IAM09','IAM09L','IAM10','IAM10L','IAM11','IAM11L','IAM12','IAM12L','ET001'], 3, 'SECOND'),
  ...e(['FS001','FS002','TCC01'], 4, 'FIRST'),
  ...e(['PED11'], 4, 'SECOND'),
]

// ── BTLEd-ICT (CTE) ────────────────────────────────────────────────────────
const BTLEd_ICT: CurriculumEntry[] = [
  ...e(['GEC01','GEC04','GEC08','GEC10','PED01','INA01','ICT01','ICT01L','PATHFit01','NSTP1'], 1, 'FIRST'),
  ...e(['GEC02','GEC03','GEC05','GEC06','PED04','INA02','ICT02','ICT02L','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['GEC09','GEC11','PED02','PED03','HE001','HE002','ICTM01','ICTM01L','ICTM02','ICTM02L','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC07','GEC13','PED08','PED10','PED05','AF001','ICTM03','ICTM03L','ICTM04','ICTM04L','PATHFit04'], 2, 'SECOND'),
  ...e(['PED06','TEC01','ENT01','RES01','ICTM05','ICTM05L','ICTM06','ICTM06L','ICTM07','ICTM07L','AF002','ICTM08','ICTM08L'], 3, 'FIRST'),
  ...e(['PED07','RES02','ICTM09','ICTM09L','ICTM10','ICTM10L','ICTM11','ICTM11L','ICTM12','ICTM12L','ET001','PED09'], 3, 'SECOND'),
  ...e(['FS001','FS002','TCC01'], 4, 'FIRST'),
  ...e(['PED11'], 4, 'SECOND'),
]

// ── BSEd-Eng (CTE) ─────────────────────────────────────────────────────────
const BSEd_Eng: CurriculumEntry[] = [
  ...e(['GEC01','GEC04','GEC08','GEC10','PATHFit01','NSTP1','PED01','LIN01'], 1, 'FIRST'),
  ...e(['GEC02','GEC03','GEC05','GEC06','PATHFit02','NSTP2','PED04','LIN02'], 1, 'SECOND'),
  ...e(['GEC09','GEC11','PED02','PED09','LIN03','ELT01','ELT05','LTE01','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC07','GEC12','GEC13','PED03','PED10','ELT02','LTE02','LTE03','ELT06','PATHFit04'], 2, 'SECOND'),
  ...e(['PED08','PED06','PED05','GEC14','LTE04','LTE05','ELT07','ELT03','ELT09'], 3, 'FIRST'),
  ...e(['ELT11','PED07','LTE06','ELT04','ELT08','LTE07','ELT10','ELT12','ELT13'], 3, 'SECOND'),
  ...e(['FS001','FS002','TCC01'], 4, 'FIRST'),
  ...e(['PED11'], 4, 'SECOND'),
]

// ── BSEd-Fil (CTE) ─────────────────────────────────────────────────────────
const BSEd_Fil: CurriculumEntry[] = [
  ...e(['GEC01','GEC04','GEC08','GEC10','PATHFit01','NSTP1','PED01','FIL01','FIL02'], 1, 'FIRST'),
  ...e(['GEC02','GEC03','GEC05','GEC06','PATHFit02','NSTP2','PED04','PAN01','FIL04'], 1, 'SECOND'),
  ...e(['GEC09','GEC11','PED02','PED09','FIL03','FIL05','FIL07','FIL08','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC07','GEC13','PED03','PED10','FIL12','PAN03','PAN04','EAF01','PATHFit04'], 2, 'SECOND'),
  ...e(['PED08','PED06','PED05','FIL09','FIL10','FIL11','PAN02'], 3, 'FIRST'),
  ...e(['FIL06','PED07','FIL13','PAN06','PAN07','PAN05','EAF02'], 3, 'SECOND'),
  ...e(['FS001','FS002','TCC01'], 4, 'FIRST'),
  ...e(['PED11'], 4, 'SECOND'),
]

// ── BSEd-Math (CTE) ────────────────────────────────────────────────────────
const BSEd_Math: CurriculumEntry[] = [
  ...e(['GEC01','GEC04','GEC08','GEC10','PATHFit01','NSTP1','PED01','MAT01','MAT12'], 1, 'FIRST'),
  ...e(['GEC02','GEC05','GEC06','PATHFit02','NSTP2','PED04','MAT08','MAT02','MAT03'], 1, 'SECOND'),
  ...e(['GEC09','GEC11','PED02','PED09','MAT04b','MAT27','STA04','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC07','GEL04','PED03','PED10','STA05','MAT05a','MAT17','PATHFit04'], 2, 'SECOND'),
  ...e(['PED08','PED06','PED05','MAT06a','MAT18','MAT19'], 3, 'FIRST'),
  ...e(['GEC03','PED07','MAT13','MAT15','MAT20','MAT116','MAT121'], 3, 'SECOND'),
  ...e(['FS001','FS002','TCC01','MAT22','MAE01'], 4, 'FIRST'),
  ...e(['PED11'], 4, 'SECOND'),
]

// ── BSCE (CEN) ─────────────────────────────────────────────────────────────
const BSCE: CurriculumEntry[] = [
  ...e(['MAT05','PHY03','PHY03L','COM01','CVE03','GEC06','GEC03','GEC02','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['MEC02','MEC03','CVE04','MAT08','EEN01a','NSC01','GEC07','GEC11','PATHFit04'], 2, 'SECOND'),
  ...e(['CVE11','CVE11L','CVE12','CVE12L','CVE13','CVE13L','CVE14','CVE14L','CVE18','CVE18L','CVE16','CVS01'], 3, 'SECOND'),
  ...e(['CVE21','CVE21L','CVE22','CVE15','CVE19','CVE20','CVE20L'], 4, 'SECOND'),
]

// ── BSCpE (CEN) ────────────────────────────────────────────────────────────
const BSCpE: CurriculumEntry[] = [
  ...e(['GEC02','GEC03','GEC06','GEC11','MAT05','PHY03','PHY03L','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['GEC07','GEC13','MAT08','ECE01','ECE01L','CPE04','CPE05','CPE06','CPE06L','PATHFit04'], 2, 'SECOND'),
  ...e(['BES01','CPE16','CPE16L','CPE17','CPE17L','CPE18','CPE18L','CPE19','CPE19L','CPE20','CPE21','CPE21L'], 3, 'SECOND'),
  ...e(['CPE29','CPE30'], 4, 'SECOND'),
]

// ── BSEE (CEN) ─────────────────────────────────────────────────────────────
const BSEE: CurriculumEntry[] = [
  ...e(['GEC02','GEC03','GEC06','MAT05','PHY03','PHY03L','GEC11','CAD01','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['GEC07','MEC03a','GEC13','ECE01a','ECE01aL','EEN02','EEN02L','EEN03','MAT04','EEN05','PATHFit04'], 2, 'SECOND'),
  ...e(['MCE01a','EEN12','EEN14','EEN115','EEN16','EEN16L','EEN18','EEN19','EEN19L','EEN20','EEN20L'], 3, 'SECOND'),
  ...e(['EEN27','RES02','EEN26','BES04','EEN17'], 4, 'SECOND'),
]

// ── BSECE (CEN) ────────────────────────────────────────────────────────────
const BSECE: CurriculumEntry[] = [
  ...e(['MAT05','PHY03','PHY03L','ECM01','ECM01L','GEC06','GEC02','COM01','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['ECM02','ECM02L','ECE02','ECE02L','ECE05','ECE05L','ECEE02','ECEE02L','EEN02','EEN02L','PATHFit03'], 2, 'SECOND'),
  ...e(['ECE10','ECE10L','ECE07','ECE07L','ECE13','ECE04','ECE04L','GEC11','GEC13','BES02a'], 3, 'SECOND'),
  ...e(['ECE15','ECE16','ECEE04','ECEE04L','GEC01','GEC07'], 4, 'SECOND'),
]

// ── BSIE (CEN) ─────────────────────────────────────────────────────────────
const BSIE: CurriculumEntry[] = [
  ...e(['GEC04','GEC06','GEC11','PHY03','PHY03L','MAT05','IEN01','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['AEC02','BES01','CAD01','IEN05','IEN06','IEN06L','MCE01a','BES05','PATHFit04'], 2, 'SECOND'),
  ...e(['GEC08','IEN10','IEN11','IEN12','IEN12L','AEC05','BES04','IEE02','IEN13','IEN13L'], 3, 'SECOND'),
  ...e(['IEN18','IEN18L','IEN16','IEN16L'], 4, 'SECOND'),
]

// ── BSME (CEN) ─────────────────────────────────────────────────────────────
const BSME: CurriculumEntry[] = [
  ...e(['CAD01','GEC04','GEC08','PHY03','PHY03L','MAT05','GEC01','GEC06','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['MAT08','MEC02','BES02a','ECE00','ECE00L','MCE02','MCE04','MAT101','GEC11','COM01','PATHFit04'], 2, 'SECOND'),
  ...e(['RES01','MCE08','MCE09','MCE10','MCE14','MCE14L','MCE12','MCE12L','MCE11','BES04','MCE16'], 3, 'SECOND'),
  ...e(['MCE21','MCE23','MCE23L','MCE25','RES02b','MCE26','MCE35'], 4, 'SECOND'),
]

// ── BSN (CAM) ──────────────────────────────────────────────────────────────
const BSN: CurriculumEntry[] = [
  ...e(['NCM01','NCM01L','NCM02','NCM03','NCM03L','NPS03','NPS03L','PATHFit02','GEC02','GEC11','NSTP2'], 1, 'SECOND'),
  ...e(['NCM08','NCM09','NCM09L','PATHFit04','GEC01','GEC05','GEC07','GEC08'], 2, 'SECOND'),
  ...e(['NCM14','NCM14L','NCM15','NCM16','NCM16L','NCM17','NCM17L'], 3, 'SECOND'),
  ...e(['HCN00','HCN00L','NCM21','NCM21L','NCM22','GEC04'], 4, 'SECOND'),
]

// ── BSMid (CAM) ────────────────────────────────────────────────────────────
const BSMid: CurriculumEntry[] = [
  ...e(['GEC05','GEC01','NPS02','NPS02L','MWP00','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['GEC09','GEL08','MWC04','MWC04L','MWP01','MWP02','PATHFit04'], 2, 'SECOND'),
  ...e(['MWP04','MWP05','PHC03','MWC07'], 3, 'SECOND'),
  ...e(['MWC09','MWC09L','MWP08','MWC10'], 4, 'SECOND'),
]

// ── BSRT (CAM) ─────────────────────────────────────────────────────────────
const BSRT: CurriculumEntry[] = [
  ...e(['MT01','GEC02','GEC08','GEC01','GEC04','GEC09','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['RAD07','RAD08','RAD08L','RAD09','RAD09L','RAD10','RAD11','RAD11L','RAD12','RAD12L','RAD13','GEC11','PATHFit04'], 2, 'SECOND'),
  ...e(['RAD20','RAD20L','RAD21','RAD22','RAD23','RAD24','RAD25','RAD26','RES02'], 3, 'SECOND'),
  ...e(['ICRT'], 4, 'SECOND'),
]

// ── BSA (CABHA) ────────────────────────────────────────────────────────────
const BSA: CurriculumEntry[] = [
  ...e(['GEC02','GEC03','GEC05','AEC13','GEC06','AEC22','PATHFit01','NSTP1'], 1, 'FIRST'),
  ...e(['GEC04','GEC10','GEC08','AEC01','AEC14','GEC01','AEC15','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['GEC09','GEC13','AEC26','AEC16','AEC23','AEC02','BME01','AEC04','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC07','GEC11','AEC25','AEC03','AEC17','AEC10','AEC18','AEC12','PATHFit04'], 2, 'SECOND'),
  ...e(['AEC19','STA02','STA02L','AEC21','AEC21L','PrE01','PrE02','PrE06','PrE07','AEC11'], 3, 'FIRST'),
  ...e(['ELE02','RES01','IBT01','PrE08','PrE03','PrE04','AEC20','AEC20L','HBO01'], 3, 'SECOND'),
  ...e(['OJT','RES02'], 4, 'FIRST'),
  ...e(['BME02','AEC24','ELE03','ELE04','PrE05','PrE05L','INT01','INT02'], 4, 'SECOND'),
]

// ── BSBA-HRM (CABHA) ───────────────────────────────────────────────────────
const BSBA_HRM: CurriculumEntry[] = [
  ...e(['GEC02','GEC03','GEC05','GEC06','PATHFit01','NSTP1'], 1, 'FIRST'),
  ...e(['GEC01','GEC04','GEC08','BAC05','PATHFit02','NSTP2','BAC02'], 1, 'SECOND'),
  ...e(['GEC07','GEC10','BAC01','HRM01','BAC04','GEC13','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC09','BNA01','BAC03','HRM02','HRM03','GEC11','PATHFit04'], 2, 'SECOND'),
  ...e(['BME01','IBT01','HRE05','HRM04','HRM05','HRE01','BNA02'], 3, 'FIRST'),
  ...e(['BME02','HRM06','HRE03','HRE04','HRE02','RES01'], 3, 'SECOND'),
  ...e(['RES02','HRM07','PHM08','PHM08L'], 4, 'FIRST'),
  ...e(['OJT'], 4, 'SECOND'),
]

// ── BSBA-FM (CABHA) ────────────────────────────────────────────────────────
const BSBA_FM: CurriculumEntry[] = [
  ...e(['GEC02','GEC03','GEC05','GEC06','PATHFit01','NSTP1'], 1, 'FIRST'),
  ...e(['GEC01','GEC04','GEC08','BAC02','BAC05','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['GEC07','GEC10','BAC01','FNM01','FNM03','GEC13','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC09','BAC03','FNM04','FNM02','BNA01','GEC11','PATHFit04'], 2, 'SECOND'),
  ...e(['BME01','BAC04','FNM06','FNM05','FME01','FME02','BNA02'], 3, 'FIRST'),
  ...e(['BME02','FNM07','FME03','FME04','RES01','FME05'], 3, 'SECOND'),
  ...e(['RES02','IBT01','FME06','FME06L'], 4, 'FIRST'),
  ...e(['OJT'], 4, 'SECOND'),
]

// ── BSBA-MM (CABHA) ────────────────────────────────────────────────────────
const BSBA_MM: CurriculumEntry[] = [
  ...e(['GEC02','GEC03','GEC05','GEC06','PATHFit01','NSTP1'], 1, 'FIRST'),
  ...e(['GEC01','GEC04','GEC08','BAC05','PATHFit02','NSTP2','BAC02'], 1, 'SECOND'),
  ...e(['GEC07','GEC10','BAC01','MKM05','MKM02','GEC13','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC09','PATHFit04','BNA01','BAC03','MKM03','MKM04','GEC11'], 2, 'SECOND'),
  ...e(['BME01','MKM08','MKM01','MKM06','MME01','MME02','BNA02'], 3, 'FIRST'),
  ...e(['BME02','MKM07','MME03','IBT01','RES01','BAC04'], 3, 'SECOND'),
  ...e(['RES02','MME05','MME04','MME04L'], 4, 'FIRST'),
  ...e(['OJT'], 4, 'SECOND'),
]

// ── BSHM (CABHA) ───────────────────────────────────────────────────────────
const BSHM: CurriculumEntry[] = [
  ...e(['GEC02','GEC03','GEC05','GEC06','THC01','PATHFit01','NSTP1'], 1, 'FIRST'),
  ...e(['GEC01','GEC04','GEC07','GEC10','THC02','THC03','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['GEC08','GEC13','BME01a','THC04','HPC01','HPC01L','HPC02','HPC02L','PATHFit03'], 2, 'FIRST'),
  ...e(['GEC09','GEC11','HPC03','HPC03L','HPC04','HPC04L','HPC05','HME01','HME01L','PATHFit04'], 2, 'SECOND'),
  ...e(['THC05','THC06','THC07','HPC06','HPC06L','HPC07','HME02','HME03','HME03L'], 3, 'FIRST'),
  ...e(['BME02a','THC08','THC09','THC10','HPC08','HPC08L','HPC09','HME04'], 3, 'SECOND'),
  ...e(['RES00','RES00L','HME05'], 4, 'FIRST'),
  ...e(['OJT'], 4, 'SECOND'),
]

// ── BPA (CABHA) ────────────────────────────────────────────────────────────
const BPA: CurriculumEntry[] = [
  ...e(['GEC02','GEC04','GEC05','GEC06','BPA01','PATHFit01','NSTP1'], 1, 'FIRST'),
  ...e(['GEC01','GEC03','GEC08','BAC04','GEL04','PATHFit02','NSTP2'], 1, 'SECOND'),
  ...e(['BPA20','BME01','GEC07','GEL10','PSC01','STA01','GEC09','PATHFit03'], 2, 'FIRST'),
  ...e(['PAE01','BPA21','BPA22','GEL05','BME02','ACC01','BPA23','PATHFit04'], 2, 'SECOND'),
  ...e(['BPA30','BPA31','BPA32','BPA33','BPA34','BPA35','PAE02'], 3, 'FIRST'),
  ...e(['RES01','BPA36','HBO01','BPA37','BPA38','BPA39','PAE03'], 3, 'SECOND'),
  ...e(['BPM01','PAE04','PAE05','RES02'], 4, 'FIRST'),
  ...e(['OJT'], 4, 'SECOND'),
]

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export const CURRICULUM_MAP: Record<string, CurriculumEntry[]> = {
  // CAS
  "BAComm":     BAComm,
  "BSBio":      BSBio,
  "BAHist":     BAHist,
  "BSMath":     BSMath,
  "BAPsych":    BAPsych,
  // CIT — keys MUST equal Program.abbreviation in the DB, which uses BIT-* (not
  // BSIT-*). They previously read "BSIT-…", so hasCurriculumMap() returned false for
  // every CIT industrial-technology program and generation silently fell back to
  // crude year+semester matching instead of the real per-program curriculum.
  // "BSIT-Food" is the DB's "BIT-Culi" (Culinary) — verified: all 25 of BIT-Culi's
  // major subjects appear in that map and in no other.
  // BIT-ID (Industrial Design) has NO map — its 24 majors match none of these, and the
  // 8 mapped BIT programs each use a DIFFERENT GE distribution, so one cannot be
  // inferred for it. It keeps the year+semester fallback until its curriculum is added.
  "BIT-Garm":   BSIT_Garm,
  "BIT-Auto":   BSIT_Auto,
  "BIT-Comp":   BSIT_Comp,
  "BIT-Culi":   BSIT_Food,
  "BIT-Eltx":   BSIT_Eltx,
  "BIT-Elec":   BSIT_Elec,
  "BIT-Mech":   BSIT_Mech,
  "BIT-Print":  BSIT_Print,
  "BSInfoTech": BSInfoTech,
  // CTE
  "BCAEd":       BCAEd,
  "BEEd":        BEEd,
  "BSEd-Sci":    BSEd_Sci,
  "BSEd-SS":     BSEd_SS,
  "BTLEd-HE":    BTLEd_HE,
  "BSESS":       BSESS,
  "BTLEd-IA":    BTLEd_IA,
  "BTLEd-ICT":   BTLEd_ICT,
  "BSEd-Eng":    BSEd_Eng,
  "BSEd-Fil":    BSEd_Fil,
  "BSEd-Math":   BSEd_Math,
  // CEN
  "BSCE":        BSCE,
  "BSCpE":       BSCpE,
  "BSEE":        BSEE,
  "BSECE":       BSECE,
  "BSIE":        BSIE,
  "BSME":        BSME,
  // CAM
  "BSN":         BSN,
  "BSMid":       BSMid,
  "BSRT":        BSRT,
  // CABHA
  "BSA":         BSA,
  "BSBA-HRM":    BSBA_HRM,
  "BSBA-FM":     BSBA_FM,
  "BSBA-MM":     BSBA_MM,
  "BSHM":        BSHM,
  "BPA":         BPA,
}

export function getCurriculumCodes(
  programAbbr: string,
  yearLevel: number,
  semester: "FIRST" | "SECOND"
): string[] {
  const curriculum = CURRICULUM_MAP[programAbbr]
  if (!curriculum) return []
  return curriculum
    .filter((e) => e.year === yearLevel && e.semester === semester)
    .map((e) => e.code)
}

export function hasCurriculumMap(programAbbr: string): boolean {
  return programAbbr in CURRICULUM_MAP
}
