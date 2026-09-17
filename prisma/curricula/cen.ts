/**
 * College of Engineering (CEN) — transcribed from CEN.docx.
 *
 * The document lists the SECOND semester of every year only, so every subject here
 * is `semester: SECOND`; first-semester rows can be added later in the same shape.
 *
 * Normalisations applied to the printed codes (everything else is verbatim):
 *   - PATHFIT0n / NST0n / NSTPn         → PATHFit0n / NSTPn (CAS codes; see canonicalCode)
 *   - BSME Y2 "PATHFIT02 Recreational Activities" → PATHFit04 (PATHFit02 is already in Y1; the
 *     title is PATHFit04's)
 *   - MECO2 / MECO3 (letter O)           → MEC02 / MEC03 (BSME prints MEC02 for the same title)
 *   - BSECE prints ECE02 / ECE04 twice (a real subject and an elective with the same code);
 *     the electives are entered as ECEE02 / ECEE04 ("ECE Elective 2 / 4"), following the
 *     IEE02 "IE Elective 2" pattern the same document uses.
 *   - Explicit "XXXL … Lab" rows are folded into their lecture row as the lab column so the
 *     seed produces the usual CODE + CODEL pair; lab-only rows (COM01, CAD01, CPE05 …) keep
 *     their printed code as a LABORATORY subject.
 * Codes shared by several programs (MAT05, PHY03, COM01, CAD01, MAT08, BES0x, MCE01a, EEN02,
 * MEC02 …) become department-wide subjects; where the programs disagree on units the seed
 * keeps the majority value and prints a warning (CAD01 0/3 vs 0/1, COM01 0/2 vs 0/1,
 * MCE01a 2 vs 3).
 */
import { block, r, type CollegeCurriculum } from "./types"

export const CEN: CollegeCurriculum = {
  college: "CEN",
  department: "CEN",
  programs: [
    {
      abbreviation: "BSCE",
      name: "Bachelor of Science in Civil Engineering (Structural Engineering)",
      blocks: [
        block(1, "SECOND", [
          r("MAT05", "Calculus 2 (Integral Calculus)", 3),
          r("PHY03", "Physics for Engineers (Calculus Based)", 3, 1),
          r("COM01", "Computer Fundamentals and Programming", 0, 2),
          r("CVE03", "Geology for Civil Engineers", 2),
          r("GEC06", "Purposive Communication", 3),
          r("GEC03", "Readings in Philippine History", 3),
          r("GEC02", "Understanding the Self", 3),
          r("PATHFit02", "Fitness and Wellness Activities", 2),
          r("NSTP2", "National Service Training Program 2", 3),
        ]),
        block(2, "SECOND", [
          r("MEC02", "Dynamics of Rigid Bodies", 2),
          r("MEC03", "Mechanics of Deformable Bodies", 4),
          r("CVE04", "CAD Application in CE", 0, 3),
          r("MAT08", "Engineering Data Analysis", 3),
          r("EEN01a", "Basic Electrical Engineering", 3),
          r("NSC01", "Environmental Science", 3),
          r("GEC07", "Art Appreciation", 3),
          r("GEC11", "Filipino sa Iba't Ibang Disiplina", 3),
          r("PATHFit04", "Recreational Activities", 2),
        ]),
        block(3, "SECOND", [
          r("CVE11", "Structural Theory 2", 2, 3),
          r("CVE12", "Building Systems Design", 2, 3),
          r("CVE13", "Principles of Steel and Timber Design", 3, 3),
          r("CVE14", "Principles of Reinforced Concrete / Prestressed Concrete", 3, 3),
          r("CVE18", "Geotechnical Engineering 1 (Soil Mechanics)", 3, 3),
          r("CVE16", "Principles of Transportation Engineering", 3),
          r("CVS01", "Professional Course - Specialized 1", 3),
        ]),
        block(4, "SECOND", [
          r("CVE21", "CE Project 2", 1, 3),
          r("CVE22", "Integrative Course for CE", 3),
          r("CVE15", "Construction Methods and Project Management", 3),
          r("CVE19", "CE Laws, Ethics and Contracts", 2),
          r("CVE20", "Quantity Surveying", 1, 3),
        ]),
      ],
    },
    {
      abbreviation: "BSCpE",
      name: "Bachelor of Science in Computer Engineering",
      blocks: [
        block(1, "SECOND", [
          r("GEC02", "Understanding the Self", 3),
          r("GEC03", "Readings in Philippine History", 3),
          r("GEC06", "Purposive Communication", 3),
          r("GEC11", "Filipino sa Iba't Ibang Disiplina", 3),
          r("MAT05", "Calculus 2 (Integral Calculus)", 3),
          r("PHY03", "Physics for Engineers (Calculus Based)", 3, 1),
          r("PATHFit02", "Fitness and Wellness Activities", 2),
          r("NSTP2", "National Service Training Program 2", 3),
        ]),
        block(2, "SECOND", [
          r("GEC07", "Art Appreciation", 3),
          r("GEC13", "Literature of the Philippines", 3),
          r("MAT08", "Engineering Data Analysis", 3),
          r("ECE01", "Fundamentals of Electronic Circuits", 3, 1),
          r("CPE04", "Numerical Methods", 3),
          r("CPE05", "Object-Oriented Programming", 0, 2),
          r("CPE06", "Online Technologies", 2, 1),
          r("PATHFit04", "Recreational Activities", 2),
        ]),
        block(3, "SECOND", [
          r("BES01", "Engineering Economics", 3),
          r("CPE16", "Computer Networks and Security", 3, 1),
          r("CPE17", "Operating Systems", 2, 1),
          r("CPE18", "Software Design", 3, 1),
          r("CPE19", "Microprocessors", 3, 1),
          r("CPE20", "Methods of Research", 2),
          r("CPE21", "Cognate/Professional Course 2", 2, 1),
        ]),
        block(4, "SECOND", [
          r("CPE29", "Seminars and Field Trips", 0, 1),
          r("CPE30", "CPE Practice and Design 2", 0, 2),
        ]),
      ],
    },
    {
      abbreviation: "BSEE",
      name: "Bachelor of Science in Electrical Engineering",
      blocks: [
        block(1, "SECOND", [
          r("GEC02", "Understanding the Self", 3),
          r("GEC03", "Readings in Philippine History", 3),
          r("GEC06", "Purposive Communication", 3),
          r("MAT05", "Calculus 2 (Integral Calculus)", 3),
          r("PHY03", "Physics for Engineers (Calculus Based)", 3, 1),
          r("GEC11", "Filipino sa Iba't Ibang Disiplina", 3),
          r("CAD01", "Computer-Aided Drafting", 0, 3),
          r("PATHFit02", "Fitness and Wellness Activities", 2),
          r("NSTP2", "National Service Training Program 2", 3),
        ]),
        block(2, "SECOND", [
          r("GEC07", "Art Appreciation", 3),
          r("MEC03a", "Fundamentals of Deformable Bodies", 2),
          r("GEC13", "Literature of the Philippines", 3),
          r("ECE01a", "Electronic Circuits, Devices and Analysis", 3, 1),
          r("EEN02", "Electrical Circuits 2", 3, 1),
          r("EEN03", "EE Laws, Codes and Professional Ethics", 2),
          r("MAT04", "Engineering Math for EE", 3),
          r("EEN05", "Engineering Electromagnetics", 2),
          r("PATHFit04", "Recreational Activities", 2),
        ]),
        block(3, "SECOND", [
          r("MCE01a", "Basic Thermodynamics", 2),
          r("EEN12", "Electrical Standards and Practice", 0, 1),
          r("EEN14", "Feedback Control System", 2),
          r("EEN115", "Microprocessor System", 2),
          r("EEN16", "Electrical Machines 2", 3, 1),
          r("EEN18", "Materials Science and Engineering", 2),
          r("EEN19", "Electrical System and Illumination Engineering Design", 3, 2),
          r("EEN20", "EE Elective 1", 2, 1),
        ]),
        block(4, "SECOND", [
          r("EEN27", "Seminars/Colloquia", 0, 1),
          r("RES02", "Research Project/Capstone Design", 1),
          r("EEN26", "Integrative Course for EE", 3),
          r("BES04", "Technopreneurship 101", 3),
          r("EEN17", "Management of Engineering Projects", 2),
        ]),
      ],
    },
    {
      abbreviation: "BSECE",
      name: "Bachelor of Science in Electronics Engineering",
      blocks: [
        block(1, "SECOND", [
          r("MAT05", "Calculus 2 (Integral Calculus)", 3),
          r("PHY03", "Physics for Engineers (Calculus Based)", 3, 1),
          r("ECM01", "Physics 2", 3, 1),
          r("GEC06", "Purposive Communication", 3),
          r("GEC02", "Understanding the Self", 3),
          r("COM01", "Computer Fundamentals and Programming", 0, 2),
          r("PATHFit02", "Fitness and Wellness Activities", 2),
          r("NSTP2", "National Service Training Program 2", 3),
        ]),
        block(2, "SECOND", [
          r("ECM02", "Advanced Engineering Mathematics for ECE", 3, 1),
          r("ECE02", "Electronics 2: Electronic Circuit Analysis and Design", 3, 1),
          r("ECE05", "Communications 1: Principles of Communication Systems", 3, 1),
          r("ECEE02", "ECE Elective 2", 3, 1),
          r("EEN02", "Electrical Circuits 2", 3, 1),
          r("PATHFit03", "Rhythmic Activities and/or Sports", 2),
        ]),
        block(3, "SECOND", [
          r("ECE10", "Digital Electronics 2: Microprocessor and Microcontroller Systems and Design", 3, 1),
          r("ECE07", "Communications 3: Transmission Media and Antenna System", 3, 1),
          r("ECE13", "Design 1 - Capstone Project 1", 0, 1),
          r("ECE04", "Signals, Spectra and Signal Processing", 3, 1),
          r("GEC11", "Filipino sa Iba't Ibang Disiplina", 3),
          r("GEC13", "Literature of the Philippines", 3),
          r("BES02a", "Engineering Management", 2),
        ]),
        block(4, "SECOND", [
          r("ECE15", "Seminars/Colloquium", 0, 1),
          r("ECE16", "Integrative Course for ECE", 3),
          r("ECEE04", "ECE Elective 4", 3, 1),
          r("GEC01", "The Life and Works of Rizal", 3),
          r("GEC07", "Art Appreciation", 3),
        ]),
      ],
    },
    {
      abbreviation: "BSIE",
      name: "Bachelor of Science in Industrial Engineering",
      blocks: [
        block(1, "SECOND", [
          r("GEC04", "The Contemporary World", 3),
          r("GEC06", "Purposive Communication", 3),
          r("GEC11", "Filipino sa Iba't Ibang Disiplina", 3),
          r("PHY03", "Physics for Engineers (Calculus Based)", 3, 1),
          r("MAT05", "Calculus 2 (Integral Calculus)", 3),
          r("IEN01", "Statistical Analysis for IE 1", 3),
          r("PATHFit02", "Fitness and Wellness Activities", 2),
          r("NSTP2", "National Service Training Program 2", 3),
        ]),
        block(2, "SECOND", [
          r("AEC02", "Principles of Economics", 3),
          r("BES01", "Engineering Economics", 3),
          r("CAD01", "Computer-Aided Drafting", 0, 1),
          r("IEN05", "Advanced Mathematics for IE", 3),
          r("IEN06", "Work Study and Measurement", 3, 1),
          r("MCE01a", "Thermodynamics", 3),
          r("BES05", "Basic Occupational Safety and Health", 3),
          r("PATHFit04", "Recreational Activities", 2),
        ]),
        block(3, "SECOND", [
          r("GEC08", "Science, Technology and Society", 3),
          r("IEN10", "Operations Research 2", 3),
          r("IEN11", "Operations Management", 3),
          r("IEN12", "Ergonomics 2", 2, 1),
          r("AEC05", "Managerial Accounting", 3),
          r("BES04", "Technopreneurship 101", 3),
          r("IEE02", "IE Elective 2", 3),
          r("IEN13", "Industry Computer Application", 1, 2),
        ]),
        block(4, "SECOND", [
          r("IEN18", "IE Capstone Project", 1, 2),
          r("IEN16", "Information Systems", 2, 1),
        ]),
      ],
    },
    {
      abbreviation: "BSME",
      name: "Bachelor of Science in Mechanical Engineering",
      blocks: [
        block(1, "SECOND", [
          r("CAD01", "Computer-Aided Drafting", 0, 3),
          r("GEC04", "The Contemporary World", 3),
          r("GEC08", "Science, Technology and Society", 3),
          r("PHY03", "Physics for Engineers (Calculus Based)", 3, 1),
          r("MAT05", "Calculus 2 (Integral Calculus)", 3),
          r("GEC01", "The Life and Works of Rizal", 3),
          r("GEC06", "Purposive Communication", 3),
          r("PATHFit02", "Fitness and Wellness Activities", 2),
          r("NSTP2", "National Service Training Program 2", 3),
        ]),
        block(2, "SECOND", [
          r("MAT08", "Engineering Data Analysis", 3),
          r("MEC02", "Dynamics of Rigid Bodies", 2),
          r("BES02a", "Engineering Management", 2),
          r("ECE00", "Basic Electronics", 2, 1),
          r("MCE02", "Thermodynamics 2", 3),
          r("MCE04", "Machine Shop Theory", 0, 2),
          r("MAT101", "Advanced Mathematics for ME", 3),
          r("GEC11", "Filipino sa Iba't Ibang Disiplina", 3),
          r("COM01", "Computer Fundamentals and Programming", 0, 1),
          r("PATHFit04", "Recreational Activities", 2),
        ]),
        block(3, "SECOND", [
          r("RES01", "Methods of Research for ME", 1),
          r("MCE08", "Refrigeration System", 3),
          r("MCE09", "Fluid Machinery", 3),
          r("MCE10", "Combustion Engineering", 2),
          r("MCE14", "ME Elective 1 - Electro Pneumatics", 1, 1),
          r("MCE12", "Materials Science and Engineering for ME", 2, 1),
          r("MCE11", "ME Laboratory 1", 0, 1),
          r("BES04", "Technopreneurship 101", 3),
          r("MCE16", "Machine Design 1", 3),
        ]),
        block(4, "SECOND", [
          r("MCE21", "ME Laboratory 3", 0, 2),
          r("MCE23", "Industrial Plant Engineering", 3, 1),
          r("MCE25", "Basic Occupational Safety and Health", 3),
          r("RES02b", "Project Study 2", 0, 1),
          r("MCE26", "Integrative Course for ME", 3),
          r("MCE35", "ME Laws, Ethics, Contracts, Codes and Standards", 2),
        ]),
      ],
    },
  ],
}
