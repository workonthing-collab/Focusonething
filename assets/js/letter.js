// Approval letter renderer, shared by the applicant portal and the admin preview.
import { site } from "./config.js";
import { esc } from "./common.js";
import { money } from "./schema.js";

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function two(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""); }
function three(n) { return (n >= 100 ? ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : "") + (n % 100 ? two(n % 100) : ""); }
// Indian numbering: crore, lakh, thousand.
export function amountInWords(v) {
  let n = Math.round(+v || 0);
  if (!n) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thou = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push((crore >= 100 ? amountInWords(crore) : two(crore)) + " Crore");
  if (lakh) parts.push(two(lakh) + " Lakh");
  if (thou) parts.push(two(thou) + " Thousand");
  if (n) parts.push(three(n));
  return parts.join(" ");
}

const fmtLong = d => d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "";

export function letterHTML(a) {
  const d = a.data || {}, f = a.funding || {}, L = f.letter || {};
  const tranches = (f.tranches || []).filter(t => t.label || t.amount);
  const conditions = (L.conditions || "").split("\n").map(x => x.trim()).filter(Boolean);
  const addr = [d.city, d.state].filter(Boolean).join(", ");
  return `
  <article class="letter${L.specimen ? " specimen" : ""}" id="approvalLetter">
    ${L.specimen ? '<div class="specimen-mark" aria-hidden="true">SPECIMEN</div>' : ""}
    <header class="lh">
      <img src="assets/img/logo.svg" alt="" width="74" height="74">
      <div>
        <div class="lh-name">Srujan Fund Support</div>
        <div class="lh-sub">Seed · Mentor · Grow</div>
        <div class="lh-contact">${esc(site.email)}${site.phone ? " · " + esc(site.phone) : ""} · srujanfundsupport.in</div>
      </div>
    </header>
    <div class="lh-rule"></div>
    <div class="lt-meta"><div><b>Ref. No.:</b> ${esc(L.refNo || "—")}</div><div><b>Date:</b> ${esc(fmtLong(L.date))}</div></div>
    <div class="lt-to">
      To,<br>
      <b>${esc(d.founderName || "")}</b>${d.founderRole ? `<br>${esc(d.founderRole)}` : ""}<br>
      <b>${esc(d.companyName || "")}</b>${addr ? `<br>${esc(addr)}` : ""}
    </div>
    <p class="lt-subject"><b>Subject: Approval of Seed Funding Support – Application ID ${esc(a.applicationId || "")}</b></p>
    <p>Dear ${esc(d.founderName || "Applicant")},</p>
    <p>We are pleased to inform you that, following evaluation, the application of <b>${esc(d.companyName || "your startup")}</b> under the Srujan Fund Support Seed Funding Programme has been approved for seed funding of <b>${esc(money(f.sanctioned))}</b> (Rupees ${esc(amountInWords(f.sanctioned))} only)${f.instrument ? ` by way of <b>${esc(f.instrument)}</b>` : ""}.</p>
    ${tranches.length ? `<p>The approved amount is proposed to be disbursed in the following tranches, subject to the milestones and conditions set out in the funding agreement:</p>
    <table class="lt-table"><thead><tr><th>Tranche</th><th>Amount</th><th>Milestone / condition</th></tr></thead><tbody>
      ${tranches.map(t => `<tr><td>${esc(t.label)}</td><td>${esc(money(t.amount) || "—")}</td><td>${esc(t.milestone || "—")}</td></tr>`).join("")}
    </tbody></table>` : ""}
    ${conditions.length ? `<p>This approval is subject to the following conditions:</p><ol class="lt-cond">${conditions.map(c => `<li>${esc(c)}</li>`).join("")}</ol>` : ""}
    <p>The funding is subject to the execution of a funding agreement between the parties and to continued compliance with its terms. The terms of funding become binding only upon execution of that agreement.</p>
    <p>We congratulate you and your team and look forward to supporting your journey.</p>
    <div class="lt-sign">
      <div>For <b>Srujan Fund Support</b></div>
      <div class="lt-sigspace"></div>
      <div><b>${esc(L.signatory || "")}</b></div>
      <div>${esc(L.designation || "")}</div>
    </div>
    ${L.specimen ? '<p class="specimen-note">SPECIMEN – issued for testing only. This is not a valid approval or commitment of funding.</p>' : ""}
    <footer class="lt-foot">The authenticity of this letter can be verified by logging in to the applicant portal at srujanfundsupport.in.</footer>
  </article>`;
}
