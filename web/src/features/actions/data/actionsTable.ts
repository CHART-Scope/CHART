/**
 * Recommended-action content, shaped exactly like an Airtable base export so
 * the static rows can be swapped for the Airtable (or solution repository)
 * API without touching anything that renders them.
 *
 * Two tables:
 *   - Actions: one row per action. Long-text fields follow simple line rules
 *     so content editors never need markup:
 *       "Description", "Rationale"   paragraphs separated by a blank line
 *       "Steps", "Expected outcomes", "Stakeholders"
 *                                    one item per line; "Lead — rest" bolds
 *                                    the lead (Steps) or shows it as the role
 *                                    heading (Stakeholders)
 *   - Sources: citations linked from Actions."Sources" by record id.
 */

export type AirtableRecord<Fields> = { id: string; fields: Fields };

export type ActionFields = {
  Title: string;
  Icon: "pregnant-woman" | "building" | "stethoscope" | "alert-triangle";
  Department: string;
  "Action type": string;
  "Application level": string[];
  "Climate hazards": string[];
  "Cost level": "Low" | "Medium" | "High";
  "Cost notes": string;
  Timeframe: ("Before heat season" | "During heat season" | "After heat season")[];
  "Timeframe notes": string;
  Description: string;
  "Steps heading"?: string;
  Steps: string;
  Stakeholders: string;
  Rationale: string;
  "Expected outcomes": string;
  Sources: string[];
};

export type SourceFields = {
  Citation: string;
  URL: string;
  Kind: "Source" | "Case study";
};

export const actionRecords: AirtableRecord<ActionFields>[] = [
  {
    id: "recCounselling",
    fields: {
      Title: "Provide pregnancy-specific health counselling to pregnant women",
      Icon: "pregnant-woman",
      Department: "Health",
      "Action type": "Behaviour change",
      "Application level": ["System", "Community"],
      "Climate hazards": ["Increased temperature"],
      "Cost level": "Low",
      "Cost notes":
        "Integrated into existing outreach contacts; primary cost is CHW orientation and IEC material adaptation, with no new cadre or equipment required.",
      Timeframe: ["Before heat season", "During heat season"],
      "Timeframe notes":
        "Counselling should begin ahead of the pre-monsoon heat peak, so behaviours are established before the hottest months begin.",
      Description:
        "Provide counselling on six core pregnancy-heat-health actions via community health workers through outreach sessions, home visits and during antenatal contacts.",
      "Steps heading":
        "The care messages to be delivered through counselling are as follows:",
      Steps: [
        "Recognising heatstroke — advise drinking water frequently through the day rather than waiting for thirst.",
        "Avoiding peak heat exposure — guide the woman and family to identify the hottest hours locally and plan outdoor tasks, market visits and household chores outside this window.",
        "Advice on clothing — wear light-coloured, loose, breathable clothing.",
        "Resting in shaded/cool places — help in identifying the coolest available space at home or nearby community structure for rest during hot afternoons.",
        "Household cooling measures — cross-ventilation during warmer months, use damp cloth on wrists/forehead.",
        "Recognising danger signs requiring facility care — close every session by reviewing these with the woman.",
      ].join("\n"),
      Stakeholders: [
        "Community health worker (household-level, first point of contact) — India: ASHAs",
        "Frontline supervisor / mid-level outreach cadre — India: ANMs",
        "Sub-national health management — India: District RCH Officer",
        "Climate / disaster management influencers — India: State Heat Action Plan node officer",
      ].join("\n"),
      Rationale:
        "Extreme heat during pregnancy is associated with elevated risk of preterm birth, low birth weight and stillbirth risk. Community health workers are well placed to deliver this counselling given their existing trusted relationships in these settings.",
      "Expected outcomes": [
        "Improved hydration and ORS-use practices among pregnant women during heat periods",
        "Reduced time spent by pregnant women in outdoor heat exposure",
        "Increased family involvement in protecting rest and time for pregnant women during heat",
      ].join("\n"),
      Sources: [
        "recSrcUnfpaGuidance",
        "recSrcNrdc",
        "recSrcNcdcIec",
        "recCaseUnfpa",
        "recCaseKir",
        "recCaseKilifi",
      ],
    },
  },
  {
    id: "recWorksite",
    fields: {
      Title:
        "Implement safe heat protocols for pregnant women working in agriculture, construction and other sectors",
      Icon: "building",
      Department: "Labour",
      "Action type": "Regulatory",
      "Application level": ["System", "Community"],
      "Climate hazards": ["Increased temperature"],
      "Cost level": "Medium",
      "Cost notes":
        "Costs are concentrated in training the existing labour inspectorate to monitor and handle complaints, plus employer-side poster printing and shaded rest area provisioning per site.",
      Timeframe: ["During heat season", "After heat season"],
      "Timeframe notes":
        "Protocols should be actively enforced through the hottest months, with a compliance review and threshold update ahead of the following heat season.",
      Description:
        "Implement heat safety protections for outdoor and heat-exposed worksites, with specific provisions for pregnant women.",
      "Steps heading":
        "Explicit protections for pregnant workers to be added and implemented as follows:",
      Steps: [
        "Additional, more frequent rest breaks",
        "Priority access to shaded rest areas and cooling",
        "Priority access to safe drinking water",
        "Rescheduling of peak-hour tasks and provision of heat-stress prevention materials for working conditions",
        "Facilitated regular health check-ups for pregnant workers with the health department",
        "Right to request lighter or rescheduled duties on heat-alert days without loss of pay or employment status",
        "Dissemination of information in local language on the pregnancy-specific provisions above",
      ].join("\n"),
      Stakeholders: [
        "Employers and labour contractors in agriculture, construction and other sectors",
        "Worker unions and worker associations",
        "National Disaster Management Authority, Meteorological Department (heat alert triggers)",
        "Health Department, in a technical advisory role on WBGT thresholds and heat-related clinical data",
      ].join("\n"),
      Rationale: [
        "Outdoor work is a major source of heat exposure for pregnant women. A prospective cohort study of around 800 pregnant agricultural workers in Tamil Nadu (Rekha et al., BJOG 2024) found occupational heat exposure was associated with increased risk of adverse pregnancy outcomes, supporting the case for outdoor heat-safety triggers for pregnant workers in India.",
        "A parallel cohort of pregnant subsistence farmers in The Gambia, west Africa (Bonell et al., Lancet Planetary Health 2022) found that each 1°C rise in heat exposure was associated with reduced fetal blood flow, supporting the same protective pathway outside a South Asian context.",
        "Protections for pregnant workers are not yet explicit under the heatwave advisory issued by the Ministry of Labour & Employment (2025), placing this within the Labour department's existing legal authority, inspection machinery and employer-facing relationships already used to enforce other workplace safety standards — closing the gap between issued mandates and pregnancy-specific provisions.",
      ].join("\n\n"),
      "Expected outcomes": [
        "Explicit work-adjustment provisions specific to pregnant workers in place",
        "Reduced heat exposure during peak hours for pregnant outdoor workers, in turn helping improve maternal health outcomes",
      ].join("\n"),
      Sources: [
        "recSrcPibLabour",
        "recSrcRekha",
        "recSrcBonell",
        "recSrcCurtis",
        "recSrcKippra",
      ],
    },
  },
  {
    id: "recHeatstrokeRoom",
    fields: {
      Title:
        "Set up heatstroke room for emergency management of Severe Heat-Related Illnesses (HRI) for District Hospitals and Community Health Centres",
      Icon: "alert-triangle",
      Department: "Health",
      "Action type": "Infrastructure",
      "Application level": ["System"],
      "Climate hazards": ["Increased temperature"],
      "Cost level": "Medium",
      "Cost notes": "500,000–1,500,000 INR (tentative)",
      Timeframe: ["During heat season"],
      "Timeframe notes":
        "The room should be fully equipped and staffed before onset of heat season, and remain operational and stocked throughout.",
      Description: [
        "Set up a dedicated heat stroke room (at least 2 beds, 14×16') with cooling equipment: AC / cooler / fans / water sprinkler / refrigerator / ice packs.",
        "Selecting a heatstroke room: a room in the health centre should be designated where the ambient temperature can be maintained optimally with appropriate shading and ventilation, and should have continuous electricity supply or generator backup. It should not be on the top floor, and can be cooled effectively with fans and desert coolers wherever air conditioning is not available.",
      ].join("\n\n"),
      "Steps heading": "This room should contain:",
      Steps: [
        "Refrigerator, ice box, ice packs, ice cold water, cool blankets, wet linens, garden sprayer round the clock",
        "Thermometer / rectal thermometer / rectal probe / multipara monitor / stethoscope / BP apparatus / ET tube and laryngoscope",
        "Disposable waterproof zipper body bags for immersion cooling",
        "High flow oxygen",
        "ECG equipment: ECG machine, gel, electrodes, ECG paper",
        "Glucometer and testing strips",
        "Ryle's tube",
        "Multifunction monitor, cardioversion / defibrillator facility",
        "Medicines: Lorazepam, Diazepam, IV antiseizure medicines like phenytoin and valproate, cold IV normal saline (0.9%), dextrose 50% in water solution (D50W), Dopamine, Dobutamine",
        "Trained staff",
        "Treatment protocol displayed on walls",
        "IEC material",
        "Uninterrupted power supply with power backup",
      ].join("\n"),
      Stakeholders: [
        "SNO (State Nodal Officer)",
        "DNO (District Nodal Officer)",
        "Facility in-charge",
      ].join("\n"),
      Rationale:
        "Heatstroke is a medical emergency with a high case fatality rate. Rapid cooling is the most effective strategy for minimizing morbidity and mortality from heat stroke, and should be initiated as soon as possible and within 30 minutes of presentation.",
      "Expected outcomes": [
        "Improved management of severe heatstroke cases",
        "Reduction in the number of severe heatstroke deaths",
      ].join("\n"),
      Sources: ["recSrcNcdcCooling", "recSrcNcdcPreparedness"],
    },
  },
  {
    id: "recHospitalEquipment",
    fields: {
      Title:
        "Ensure availability of basic equipment and medicines as a part of hospital preparedness for heat season",
      Icon: "stethoscope",
      Department: "Health",
      "Action type": "Infrastructure",
      "Application level": ["System"],
      "Climate hazards": ["Increased temperature"],
      "Cost level": "Low",
      "Cost notes": "50,000–100,000 INR (tentative)",
      Timeframe: ["Before heat season"],
      "Timeframe notes":
        "Equipment and medicine stocks should be confirmed and topped up before the start of heat season, ahead of any HRI cases presenting.",
      Description:
        "Primary Health Centres (PHC), Community Health Centres (CHC), District Hospitals (DH) and Medical Colleges should ensure the following requirements are met before the start of heat season:",
      Steps: [
        "Dedicated bed for HRI patients in a cooler area of the hospital",
        "Thermometer",
        "ORS packets",
        "Ice packs",
        "BP apparatus",
        "Silver sulphadiazine cream",
        "Calamine lotion",
        "Chlorhexidine in a light cream or lotion base",
        "Cold IV normal saline (0.9%)",
        "Dextrose 50% in water solution (D50W)",
        "Glucometer and testing strips",
        "ECG equipment: ECG machine, gel, electrodes, ECG paper",
        "Cooling equipment: AC, cooler, fan as per requirement",
        "Water cooler",
        "Medicines: Lorazepam, Diazepam",
      ].join("\n"),
      Stakeholders: [
        "SNO (State Nodal Officer)",
        "DNO (District Nodal Officer)",
        "Facility in-charge",
      ].join("\n"),
      Rationale:
        "Establishing HRI management rooms provides rapid emergency cooling and triage, and helps prevent misdiagnosis. Dedicated rooms ensure staff are specifically trained to differentiate heatstroke from other conditions and prioritise immediate evaporative or immersion cooling. During peak summer months, emergency departments can easily become overwhelmed — dedicated HRI zones reserve the necessary beds and resources so that vulnerable patients (e.g. the elderly, outdoor labourers) receive immediate, uninterrupted care.",
      "Expected outcomes": [
        "Improved management of HRI-related illnesses",
        "Reduction in the number of complications and deaths due to HRI-related illnesses",
      ].join("\n"),
      Sources: ["recSrcNcdcPreparedness", "recSrcUnicef"],
    },
  },
];

export const sourceRecords: AirtableRecord<SourceFields>[] = [
  {
    id: "recSrcUnfpaGuidance",
    fields: {
      Citation:
        "MoHFW & UNFPA India (2024). Heat and Pregnancy: Guidance for Healthcare Providers and Community Health Workers",
      URL: "https://www.who.int/publications/i/item/9789240090096",
      Kind: "Source",
    },
  },
  {
    id: "recSrcNrdc",
    fields: {
      Citation: "NRDC (2024). India's heat-health action plans",
      URL: "https://www.nrdc.org/resources/india-heat-action-plans",
      Kind: "Source",
    },
  },
  {
    id: "recSrcNcdcIec",
    fields: {
      Citation:
        "NCDC (2024). National Heat-Related Illness Action Plan — IEC materials",
      URL: "https://ncdc.mohfw.gov.in",
      Kind: "Source",
    },
  },
  {
    id: "recCaseUnfpa",
    fields: {
      Citation:
        "MoHFW & UNFPA India (2024): Heat and pregnancy guidance for healthcare providers and community health workers",
      URL: "https://www.who.int/publications/i/item/9789240090096",
      Kind: "Case study",
    },
  },
  {
    id: "recCaseKir",
    fields: {
      Citation: "Co-design workshop process paper, KIR (CHAMPSA)",
      URL: "https://www.ncbi.nlm.nih.gov/pmc/",
      Kind: "Case study",
    },
  },
  {
    id: "recCaseKilifi",
    fields: {
      Citation:
        "Lusambili A. et al. (2025). Reducing extreme heat impacts on health in pregnant women and infants: a community-based intervention in Kilifi, Kenya. Health Policy and Planning 40(9), 943–954.",
      URL: "https://doi.org/10.1093/heapol/czaf028",
      Kind: "Case study",
    },
  },
  {
    id: "recSrcPibLabour",
    fields: {
      Citation:
        "PIB: Ministry of Labour & Employment nationwide heatwave advisory to States/UTs.",
      URL: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2256186&reg=3&lang=2",
      Kind: "Source",
    },
  },
  {
    id: "recSrcRekha",
    fields: {
      Citation:
        "Rekha S, Nalini SJ, Bhuvana S, Kanmani S, Hirst JE, Venugopal V. Heat stress and adverse pregnancy outcome: prospective cohort study. BJOG. 2024;131(5):612–622.",
      URL: "https://doi.org/10.1111/1471-0528.17680",
      Kind: "Source",
    },
  },
  {
    id: "recSrcBonell",
    fields: {
      Citation:
        "Bonell A, Sonko B, Badjie J, et al. Environmental heat stress on maternal physiology and fetal blood flow in pregnant subsistence farmers in The Gambia, west Africa: an observational cohort study. Lancet Planetary Health. 2022;6(12):e968–e976.",
      URL: "https://doi.org/10.1016/S2542-5196(22)00242-X",
      Kind: "Source",
    },
  },
  {
    id: "recSrcCurtis",
    fields: {
      Citation:
        "Curtis A. Expecting in Extremes: Protecting Pregnant Workers in Our Changing Climate. National Commission on Climate and Workforce Health / Health Action Alliance, June 10, 2025.",
      URL: "https://www.healthaction.org/whatsnew/expecting-in-extremes-protecting-pregnant-workers-in-our-changing-climate",
      Kind: "Source",
    },
  },
  {
    id: "recSrcKippra",
    fields: {
      Citation:
        'KIPPRA. "An Overview of Workplace Safety and Health in Kenya" (describes the DOSHS mandate and enforcement role under OSHA 2007).',
      URL: "https://kippra.or.ke/an-overview-of-workplace-safety-and-health-in-kenya/",
      Kind: "Source",
    },
  },
  {
    id: "recSrcNcdcCooling",
    fields: {
      Citation:
        "NCDC. Emergency Cooling for Severe Heat-Related Illnesses, March 2024 (NPCCHH).",
      URL: "https://ncdc.mohfw.gov.in/uploads/resource/1769333089_Emergency-Cooling-for-Severe-Heat-Related-Illnesses_March2024_NPCCHH.pdf",
      Kind: "Source",
    },
  },
  {
    id: "recSrcNcdcPreparedness",
    fields: {
      Citation:
        "NCDC. Strengthening Health Systems Preparedness for Heat-Related Illnesses (HRI) in India, 18 April 2023.",
      URL: "https://ncdc.mohfw.gov.in/uploads/resource/1769333208_4_Strengthening-Health-Systems-Preparedness-for-Heat-Related-Illnesses-HRI-in-India_180423.pdf",
      Kind: "Source",
    },
  },
  {
    id: "recSrcUnicef",
    fields: {
      Citation:
        "CEH/UNICEF. Improving heat preparedness and management through strengthening health systems.",
      URL: "https://ceh.unicef.org/events-and-resources/stories/improving-heat-preparedness-and-management-through-strengthening",
      Kind: "Source",
    },
  },
];

/**
 * Sample priority districts per action. Not content: in the product these
 * come from the risk map for the selected place and outcome. Kept here until
 * that join exists so the panel can be seen end to end.
 */
export const samplePriorityDistricts: Record<
  string,
  { district: string; percent: number; temperatureC: number }[]
> = {
  recCounselling: [
    { district: "Sheopur", percent: 24.1, temperatureC: 41.2 },
    { district: "Satna", percent: 20.4, temperatureC: 37.5 },
    { district: "Betul", percent: 17.9, temperatureC: 39.6 },
    { district: "Khargone", percent: 15.6, temperatureC: 38.1 },
    { district: "Panna", percent: 12.3, temperatureC: 35.8 },
    { district: "Damoh", percent: 10.8, temperatureC: 35.1 },
    { district: "Sagar", percent: 8.4, temperatureC: 33.9 },
  ],
  recWorksite: [
    { district: "Sheopur", percent: 24.1, temperatureC: 41.2 },
    { district: "Betul", percent: 17.9, temperatureC: 39.6 },
    { district: "Khargone", percent: 15.6, temperatureC: 38.1 },
    { district: "Dhar", percent: 11.7, temperatureC: 35.4 },
    { district: "Rajgarh", percent: 9.9, temperatureC: 34.2 },
  ],
  recHeatstrokeRoom: [
    { district: "Sheopur", percent: 24.1, temperatureC: 41.2 },
    { district: "Satna", percent: 20.4, temperatureC: 37.5 },
    { district: "Betul", percent: 17.9, temperatureC: 39.6 },
    { district: "Panna", percent: 12.3, temperatureC: 35.8 },
    { district: "Sagar", percent: 8.4, temperatureC: 33.9 },
  ],
  recHospitalEquipment: [
    { district: "Sheopur", percent: 24.1, temperatureC: 41.2 },
    { district: "Khargone", percent: 15.6, temperatureC: 38.1 },
    { district: "Damoh", percent: 10.8, temperatureC: 35.1 },
    { district: "Rajgarh", percent: 9.9, temperatureC: 34.2 },
  ],
};
