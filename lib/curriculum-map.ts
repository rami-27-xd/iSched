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
