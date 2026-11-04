// Application form definition, shared by applicant and admin views.
export const STATES = ["Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh","Chhattisgarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh","Jammu and Kashmir","Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal"];
export const SECTORS = ["Agriculture & Agritech","AI / Machine Learning","Clean Energy & Climate","Consumer Products & D2C","Deeptech & Hardware","EdTech","FinTech","Food & Beverages","HealthTech & MedTech","Logistics & Supply Chain","Manufacturing","Media & Entertainment","Real Estate & Construction","Retail & E-commerce","SaaS / Enterprise Software","Social Impact","Textiles & Apparel","Travel & Hospitality","Waste Management & Recycling","Other"];

export const STEPS = [
  { id: "company", title: "Company details", fields: [
    { k: "companyName", label: "Registered company name", req: true },
    { k: "brandName", label: "Brand / product name", hint: "If different from the registered name" },
    { row: [
      { k: "entityType", label: "Entity type", type: "select", req: true, options: ["Private Limited Company", "Limited Liability Partnership (LLP)", "Registered Partnership"] },
      { k: "regNumber", label: "CIN / LLPIN / Registration no.", req: true }
    ]},
    { row: [
      { k: "incDate", label: "Date of incorporation", type: "date", req: true },
      { k: "stage", label: "Current stage", type: "select", req: true, options: ["Idea", "Prototype / MVP", "Early revenue", "Scaling"] }
    ]},
    { row: [
      { k: "dpiit", label: "DPIIT recognised?", type: "select", req: true, options: ["Yes", "No", "Applied"] },
      { k: "dpiitNo", label: "DPIIT certificate no.", hint: "If recognised" }
    ]},
    { row: [
      { k: "state", label: "State", type: "select", req: true, options: STATES },
      { k: "city", label: "City", req: true }
    ]},
    { row: [
      { k: "sector", label: "Sector", type: "select", req: true, options: SECTORS },
      { k: "website", label: "Website", type: "url", hint: "Optional" }
    ]}
  ]},
  { id: "team", title: "Founders & team", fields: [
    { row: [
      { k: "founderName", label: "Lead founder's name", req: true },
      { k: "founderRole", label: "Designation", req: true, placeholder: "e.g. Founder & CEO" }
    ]},
    { row: [
      { k: "founderEmail", label: "Email", type: "email", req: true },
      { k: "founderPhone", label: "Mobile number", type: "tel", req: true, pattern: "^[6-9]\\d{9}$", patternMsg: "Enter a valid 10-digit Indian mobile number", placeholder: "10-digit mobile" }
    ]},
    { k: "founderLinkedin", label: "LinkedIn profile", type: "url", hint: "Optional" },
    { k: "cofounders", label: "Co-founders", type: "textarea", max: 1200, hint: "One per line: name, role, % shareholding, one-line background", placeholder: "Priya Shah, CTO, 30%, ex-Infosys, 6 yrs in embedded systems" },
    { row: [
      { k: "teamSize", label: "Total team size", type: "number", req: true, min: 1 },
      { k: "founderHolding", label: "Founders' combined shareholding (%)", type: "number", req: true, min: 0, max: 100 }
    ]}
  ]},
  { id: "pitch", title: "Your pitch", fields: [
    { k: "oneLiner", label: "One-line description", req: true, max: 160, placeholder: "We help ___ do ___ by ___" },
    { k: "problem", label: "What problem are you solving, and for whom?", type: "textarea", req: true, max: 1500 },
    { k: "solution", label: "Your solution and what makes it innovative", type: "textarea", req: true, max: 1500 },
    { k: "market", label: "Target market and its size", type: "textarea", req: true, max: 1200 },
    { k: "businessModel", label: "Business model: how do you make money?", type: "textarea", req: true, max: 1200 },
    { k: "traction", label: "Traction so far", type: "textarea", req: true, max: 1200, hint: "Users, customers, revenue, pilots, LOIs, awards. Write 'None yet' if you're pre-launch." },
    { k: "competition", label: "Competitors and your advantage", type: "textarea", req: true, max: 1200 }
  ]},
  { id: "funding", title: "Funding requirement", fields: [
    { row: [
      { k: "amountAsked", label: "Amount requested (₹)", type: "number", req: true, min: 0 },
      { k: "supportType", label: "Preferred funding instrument", type: "select", req: true, options: ["Grant", "Equity", "Convertible instrument", "Debt", "Not sure"], hint: "Final terms are set only in a signed funding agreement" }
    ]},
    { k: "useOfFunds", label: "How will you use the funds?", type: "textarea", req: true, max: 1500, hint: "Break it down: product development, hiring, marketing, working capital etc., with rough amounts and timelines." },
    { row: [
      { k: "revenueLastFY", label: "Revenue in last financial year (₹)", type: "number", min: 0, hint: "0 if pre-revenue" },
      { k: "priorFunding", label: "Funding raised so far", type: "select", req: true, options: ["None (bootstrapped)", "Friends & family", "Angel investors", "Government grant", "Institutional / VC"] }
    ]},
    { k: "priorFundingDetails", label: "Details of funding raised", type: "textarea", max: 800, hint: "Amount, source and year. Leave blank if none." }
  ]},
  { id: "documents", title: "Documents", docs: [
    { k: "incCert", label: "Certificate of incorporation / registration", req: true },
    { k: "pitchDeck", label: "Pitch deck", req: true, hint: "10–15 slides, PDF preferred" },
    { k: "companyPan", label: "Company PAN card", req: true },
    { k: "financials", label: "Financial statements or projections", hint: "Optional" },
    { k: "dpiitCert", label: "DPIIT recognition certificate", hint: "Optional" },
    { k: "otherDoc", label: "Any other supporting document", hint: "Optional — patents, awards, LOIs" }
  ], fields: [
    { k: "demoLink", label: "Product demo / video link", type: "url", hint: "Optional — YouTube, Drive or website link" }
  ]},
  { id: "review", title: "Review & submit" }
];

export const STATUS = {
  draft: "Draft (not submitted)",
  submitted: "Application Submitted",
  initial_review: "Under Initial Review",
  documents_pending: "Documents Pending",
  under_evaluation: "Under Evaluation",
  under_review: "Under Evaluation", // legacy value
  shortlisted: "Shortlisted",
  selected: "Selected",
  rejected: "Not Selected"
};
// Statuses an administrator can set, in order.
export const ADMIN_STATUSES = ["submitted", "initial_review", "documents_pending", "under_evaluation", "shortlisted", "selected", "rejected"];
// Progress stages shown to applicants.
export const STAGES = [
  { k: "submitted", label: "Application Submitted", match: ["submitted"] },
  { k: "verification", label: "Initial Review & Documents", match: ["initial_review", "documents_pending"] },
  { k: "evaluation", label: "Under Evaluation", match: ["under_evaluation", "under_review"] },
  { k: "shortlisted", label: "Shortlisted", match: ["shortlisted"] },
  { k: "decision", label: "Decision", match: ["selected", "rejected"] }
];
export const stageIndex = st => STAGES.findIndex(x => x.match.includes(st));
export const FLOW = ["submitted", "initial_review", "under_evaluation", "shortlisted", "selected"];

export const flatFields = s => (s.fields || []).flatMap(f => f.row || [f]);
export const MONEY = new Set(["amountAsked", "revenueLastFY"]);
export const money = v => v === "" || v == null ? "" : "₹" + Number(v).toLocaleString("en-IN");
