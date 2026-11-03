# Srujan Fund Support — Applicant Portal

Startup application portal for **srujanfundsupport.in**. Founders sign up, fill a 5-step application, upload documents, submit, and track status.

Static site (HTML/CSS/JS) hosted on GitHub Pages, with Firebase for login, database and file storage.

## Pages

| File | What it is |
|---|---|
| `index.html` | Public site: about, eligibility, process, documents, FAQs, contact |
| `login.html` | Sign up / log in / forgot password |
| `dashboard.html` | Applicant dashboard: application form, uploads, review & submit, status tracker |
| `admin.html` | Admin console: filter/search applications, full detail with documents, change status, message applicant, private scores & notes, CSV export |

## Demo mode

Until Firebase is configured in `assets/js/config.js`, the portal runs in **demo mode**: everything works, but data is saved only in the visitor's own browser. A yellow banner shows this.

## Going live: Firebase setup

1. Go to <https://console.firebase.google.com> → **Add project** (e.g. `srujan-fund-support`).
2. **Project settings → Your apps → Web (`</>`)** → register app → copy the `firebaseConfig` values into `assets/js/config.js`.
3. **Authentication → Sign-in method** → enable **Email/Password**.
   **Authentication → Settings → Authorized domains** → add `srujanfundsupport.in` and `www.srujanfundsupport.in`.
4. **Firestore Database → Create database** → production mode → region **asia-south1 (Mumbai)**.
   Open the **Rules** tab → paste the contents of `firestore.rules` → Publish.
5. **Storage → Get started** (needs the Blaze pay-as-you-go plan; the free usage tier still applies) → same region → **Rules** tab → paste `storage.rules` → Publish.
6. **Make yourself admin:** sign up on the portal with your admin email → open `admin.html` (it shows your user ID) → Firestore → **Start collection** `admins` → Document ID = that user ID → add any field (e.g. `email`) → Save. Reload `admin.html`.
7. Edit `site.email` in `assets/js/config.js` to your real support email.

The Firebase web config is safe to publish. Access is controlled by the security rules.

## Status flow

`draft` → `submitted` → `under_review` → `shortlisted` → `selected` / `rejected`

Applicants can edit only while in `draft`. After submission, only admins can change status. Setting status back to `draft` reopens the application for the applicant to edit. Scores and internal notes are stored in the `reviews` collection, which applicants can't read.

## Roadmap

- **Phase 1 (done):** public site, applicant signup, application, uploads, status
- **Phase 2 (done):** admin console: list/filter applications, view documents, change status, notes, scoring, CSV export
- **Phase 3:** reviewer role with scoring, email notifications
- **Phase 4:** disbursement/tranche tracking, reports
