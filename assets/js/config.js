// ─────────────────────────────────────────────────────────────
// Srujan Fund Support — site configuration
// ─────────────────────────────────────────────────────────────
// 1. Create a Firebase project, add a Web App, and paste its config below.
// 2. Until apiKey is filled in, the portal runs in DEMO MODE:
//    data is saved only in the visitor's own browser (nothing is sent anywhere).

export const firebaseConfig = {
  apiKey: "AIzaSyC_db-CwPiPIedQyaEjXJBX9VUzlvKX7hk",
  authDomain: "srujan-fund-support.firebaseapp.com",
  projectId: "srujan-fund-support",
  storageBucket: "srujan-fund-support.firebasestorage.app",
  messagingSenderId: "520723964156",
  appId: "1:520723964156:web:bab77274025925ad863779"
};

export const site = {
  name: "Srujan Fund Support",
  shortName: "Srujan",
  email: "support@srujanfundsupport.in",
  phone: "",
  // ── Trust & contact details. Leave blank and that block stays hidden on the site.
  // Fill ONLY with real information — never placeholder or estimated numbers.
  // Application fee policy shown on the site. Must be accurate.
  feePolicy: "There is no fee to apply.",
  applicantLoginOpen: false,   // set true to let founders log in; false = admin/staff only
  sheetWebhook: "",   // optional Google Apps Script URL to mirror sign-ins into a live Google Sheet
  operator: "",        // legal entity that runs the program, e.g. "XYZ Ventures Pvt Ltd"
  cin: "",             // its CIN / LLPIN
  address: "",         // registered or office address
  hours: "",           // e.g. "Mon–Sat, 10:30 AM – 6:30 PM"
  social: { linkedin: "", instagram: "", x: "", youtube: "" },
  // Named helpline contacts: { role: "Applications", name: "", email: "", phone: "" }
  contacts: [],
  // Impact numbers — only real, verifiable figures: { value: "25", label: "Startups supported" }
  stats: [],
  // Latest updates: { date: "2026-11-04", title: "", text: "", link: "" }
  announcements: [],
  // Partners you have a real, written agreement with: { name: "", logo: "assets/img/partners/x.png", url: "" }
  partners: [],
  // Where new-application alerts are sent (your inbox)
  adminEmail: "",
  // Max upload size per document, in MB
  maxUploadMB: 10
};

// ─────────────────────────────────────────────────────────────
// Email notifications (optional) — via EmailJS (free: 200 emails/month)
// Leave blank to switch emails off. Setup steps are in README.md.
export const emailjs = {
  publicKey: "",
  serviceId: "",
  templateId: ""
};

export const DEMO_MODE = !firebaseConfig.apiKey;
