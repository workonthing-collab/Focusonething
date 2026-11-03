# Srujan Fund Support — Applicant Portal

Startup status portal for **srujanfundsupport.in**. **Admins add each startup** (company, founder, founder email, status). **Founders** sign up with that same email, verify it, and see their status, messages from the team, and funding/tranches. Founders can't edit anything.

Static site (HTML/CSS/JS) hosted on GitHub Pages, with Firebase for login, database and file storage.

## Pages

| File | What it is |
|---|---|
| `index.html` | Public site: about, eligibility, process, documents, FAQs, contact |
| `login.html` | Sign up / log in / forgot password |
| `dashboard.html` | Applicant dashboard: application form, uploads, review & submit, status tracker |
| `admin.html` | Staff console. **Admins:** filter/search applications, full detail with documents, change status, message/email applicant, assign reviewers, scorecards, private notes, CSV export, manage reviewers. **Reviewers:** only applications assigned to them, with their own scorecard. `admin.html#reports` has the reports dashboard |

## Demo mode

Until Firebase is configured in `assets/js/config.js`, the portal runs in **demo mode**: everything works, but data is saved only in the visitor's own browser. A yellow banner shows this.

## Going live: Firebase setup

1. Go to <https://console.firebase.google.com> → **Add project** (e.g. `srujan-fund-support`).
2. **Project settings → Your apps → Web (`</>`)** → register app → copy the `firebaseConfig` values into `assets/js/config.js`.
3. **Authentication → Sign-in method** → enable **Email/Password**.
   **Authentication → Settings → Authorized domains** → add `srujanfundsupport.in` and `www.srujanfundsupport.in`.
4. **Firestore Database → Create database** → production mode → region **asia-south1 (Mumbai)**.
   Open the **Rules** tab → paste the contents of `firestore.rules` → Publish.
5. *(Not used — free plan.)* Documents are shared as Google Drive/Dropbox links, so Firebase Storage and the Blaze plan aren't needed. `storage.rules` is kept in case you switch to direct uploads later.
6. **Make yourself admin:** sign up on the portal with your admin email → open `admin.html` (it shows your user ID) → Firestore → **Start collection** `admins` → Document ID = that user ID → add any field (e.g. `email`) → Save. Reload `admin.html`.
7. **Add reviewers (optional):** reviewer signs up on the portal → opens `admin.html` and sends you the user ID it shows → you open `admin.html#team` (or the **Reviewers** button) → add ID, name, email. Then tick reviewers on any application to assign it.
8. Edit `site.email` and `site.adminEmail` in `assets/js/config.js` to your real support email.

The Firebase web config is safe to publish. Access is controlled by the security rules.

## Funding & tranches

When an application is set to **Selected**, its admin page shows a **Funding & tranches** panel: sanctioned amount, instrument, agreement date and a tranche schedule (amount, milestone, status, release date, reference no.). The startup sees all of this on their dashboard and can submit **progress / utilisation reports** with attachments, which appear back on the admin page.

## Email notifications (optional)

Uses [EmailJS](https://www.emailjs.com) (free plan: 200 emails/month). With it set up:
- the applicant gets a confirmation email when they submit,
- you (`site.adminEmail`) get an alert for every new application,
- the applicant gets an email when you change their status (tick box on the admin page).

Setup:
1. Create an EmailJS account → **Email Services** → add Gmail (or your domain's SMTP) → note the **Service ID**.
2. **Email Templates → Create** with:
   - To email: `{{to_email}}`
   - From name: `{{site_name}}`, Reply-to: `{{reply_to}}`
   - Subject: `{{subject}}`
   - Content: `{{message}}`
   Save and note the **Template ID**.
3. **Account → General** → copy the **Public Key**.
4. Paste all three into `emailjs` in `assets/js/config.js`.
5. In EmailJS **Account → Security**, restrict allowed origins to `https://srujanfundsupport.in`.

Leave the keys blank to keep emails off; everything else still works.

## Status flow

`draft` → `submitted` → `under_review` → `shortlisted` → `selected` / `rejected`

Applicants can edit only while in `draft`. After submission, only admins can change status. Setting status back to `draft` reopens the application for the applicant to edit. Scores and internal notes are stored in the `reviews` collection, which applicants can't read.

## Roadmap

- **Phase 1 (done):** public site, applicant signup, application, uploads, status
- **Phase 2 (done):** admin console: list/filter applications, view documents, change status, notes, scoring, CSV export
- **Phase 3 (done):** reviewer role, per-reviewer scorecards with average, reviewer assignment, email notifications
- **Phase 4 (done):** funding & tranche tracking for selected startups, progress/utilisation reports from startups, reports dashboard (funnel, monthly submissions, sector/state/stage, funding totals)
