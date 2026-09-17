/**
 * College of Allied Medicine (CAM) — transcribed from CAM.docx.
 *
 * The document lists the SECOND semester of every year only, so every subject here
 * is `semester: SECOND`; first-semester rows can be added later in the same shape.
 *
 * Normalisations applied to the printed codes (everything else is verbatim):
 *   - PATHFit0n / NSTP2 / NST02              → PATHFit0n / NSTP2 (CAS codes; see canonicalCode)
 *   - "NCM01 (101)" → NCM01, "NPS 03" → NPS03, "RAD 07" → RAD07, "MT 01" → MT01,
 *     "RES 02" → RES02 (the parenthetical / spaced variants are the same code)
 *   - GEL08 "Human Reproduction" (BSMid)     → GEL08 (added to CAS by the seed runner)
 *   - BSRT Y4 "CE 02 Clinical Education 2 (1,056 hrs)" has NO lecture or laboratory units in
 *     the document, so there is nothing to schedule — it is deliberately NOT seeded.
 *   - Nursing RLE rows printed with laboratory units only (NCM15, NCM22) are kept as
 *     LABORATORY subjects under their printed code.
 * CAM sections are the only ones allowed to hold Saturday classes (CLAUDE.md §5) — nothing
 * here needs to change for that; it is derived from the college.
 */
import { block, r, type CollegeCurriculum } from "./types"

export const CAM: CollegeCurriculum = {
  college: "CAM",
  department: "CAM",
  programs: [
    {
      abbreviation: "BSN",
      name: "Bachelor of Science in Nursing",
      blocks: [
        block(1, "SECOND", [
          r("NCM01", "Health Assessment", 3, 2),
          r("NCM02", "Health Education", 3),
          r("NCM03", "Fundamentals of Nursing", 3, 2),
          r("NPS03", "Microbiology and Parasitology", 3, 1),
          r("PATHFit02", "Fitness and Wellness Activities", 2),
          r("GEC02", "Understanding the Self", 3),
          r("GEC11", "Filipino sa Iba't Ibang Disiplina", 3),
          r("NSTP2", "National Service Training Program 2", 3),
        ]),
        block(2, "SECOND", [
          r("NCM08", "Health Care Ethics (Bioethics)", 3),
          r("NCM09", "Care of Mother and Child at-risk or with Problems (Acute and Chronic)", 6, 6),
          r("PATHFit04", "Recreational Activities", 2),
          r("GEC01", "The Life and Works of Rizal", 3),
          r("GEC05", "Mathematics in the Modern World", 3),
          r("GEC07", "Art Appreciation", 3),
          r("GEC08", "Science, Technology and Society", 3),
        ]),
        block(3, "SECOND", [
          r("NCM14", "Care of the Older Person", 2, 1),
          r("NCM15", "Nursing Research II (RLE II)", 0, 2),
          r("NCM16", "Care of the Clients with Problems in Nutrition and GI, Metabolism and Endocrine, Perception and Coordination (Acute and Chronic)", 5, 4),
          r("NCM17", "Care of the Clients with Maladaptive Patterns of Behavior (Acute and Chronic)", 4, 4),
        ]),
        block(4, "SECOND", [
          r("HCN00", "Hospice Care Nursing", 1, 2),
          r("NCM21", "Disaster Nursing", 2, 1),
          r("NCM22", "Intensive Nursing Practicum", 0, 8),
          r("GEC04", "The Contemporary World", 3),
        ]),
      ],
    },
    {
      abbreviation: "BSMid",
      name: "Bachelor of Science in Midwifery",
      blocks: [
        block(1, "SECOND", [
          r("GEC05", "Mathematics in the Modern World", 3),
          r("GEC01", "The Life and Works of Rizal", 3),
          r("NPS02", "Human Anatomy and Physiology", 3, 2),
          r("MWP00", "Foundation of Midwifery Practice", 3),
          r("PATHFit02", "Fitness and Wellness Activities", 2),
          r("NSTP2", "National Service Training Program 2", 3),
        ]),
        block(2, "SECOND", [
          r("GEC09", "Ethics", 3),
          r("GEL08", "Human Reproduction", 3),
          r("MWC04", "Digital Technology in Health Care", 2, 1),
          r("MWP01", "Obstetrics and Newborn Care", 3),
          r("MWP02", "Care of Infants and Children", 3),
          r("PATHFit04", "Recreational Activities", 2),
        ]),
        block(3, "SECOND", [
          r("MWP04", "Maternal High Risk Care", 4),
          r("MWP05", "Administration and Supervision", 3),
          r("PHC03", "Community Health Service Management", 3),
          r("MWC07", "Midwifery Research 1", 3),
        ]),
        block(4, "SECOND", [
          r("MWC09", "Integrative Seminars and Midwifery Updates", 2, 1),
          r("MWP08", "Midwifery Major - Midwifery Education Program Management", 3),
          r("MWC10", "Competency Assessment", 5),
        ]),
      ],
    },
    {
      abbreviation: "BSRT",
      name: "Bachelor of Science in Radiologic Technology",
      blocks: [
        block(1, "SECOND", [
          r("MT01", "Medical Terminology", 3),
          r("GEC02", "Understanding the Self", 3),
          r("GEC08", "Science, Technology and Society", 3),
          r("GEC01", "The Life and Works of Rizal", 3),
          r("GEC04", "The Contemporary World", 3),
          r("GEC09", "Ethics", 3),
          r("PATHFit02", "Fitness and Wellness Activities", 2),
          r("NSTP2", "National Service Training Program 2", 3),
        ]),
        block(2, "SECOND", [
          r("RAD07", "Radiobiology", 2),
          r("RAD08", "Patient Care and Management", 2, 1),
          r("RAD09", "Pharmacology and Venipuncture", 2, 1),
          r("RAD10", "Imaging Equipment and Maintenance", 2),
          r("RAD11", "Film-Screen Image Acquisition, Processing and Image Analysis", 2, 1),
          r("RAD12", "Radiographic Anatomy and Physiology", 3, 1),
          r("RAD13", "Computed and Digital Radiography", 3),
          r("GEC11", "Filipino sa Iba't Ibang Disiplina", 3),
          r("PATHFit04", "Recreational Activities", 2),
        ]),
        block(3, "SECOND", [
          r("RAD20", "Radiographic Positioning and Radiologic Procedures 2", 3, 1),
          r("RAD21", "Computed Tomography", 3),
          r("RAD22", "Magnetic Resonance Imaging", 3),
          r("RAD23", "Mammography", 2),
          r("RAD24", "Interventional Radiology", 3),
          r("RAD25", "Radiation Therapy", 3),
          r("RAD26", "Nuclear Medicine", 3),
          r("RES02", "Research Writing", 3),
        ]),
        block(4, "SECOND", [
          // CE02 "Clinical Education 2 (1,056 hrs)" — no units printed; not seeded (see header).
          r("ICRT", "Integrative Course in Radiologic Technology", 3),
        ]),
      ],
    },
  ],
}
