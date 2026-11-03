// ─────────────────────────────────────────────────────────────
// Srujan Fund Support — site configuration
// ─────────────────────────────────────────────────────────────
// 1. Create a Firebase project, add a Web App, and paste its config below.
// 2. Until apiKey is filled in, the portal runs in DEMO MODE:
//    data is saved only in the visitor's own browser (nothing is sent anywhere).

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export const site = {
  name: "Srujan Fund Support",
  shortName: "Srujan",
  email: "support@srujanfundsupport.in",
  phone: "",
  // Max upload size per document, in MB
  maxUploadMB: 10
};

export const DEMO_MODE = !firebaseConfig.apiKey;
