// Email notifications through EmailJS's REST API. Silently does nothing if not configured.
import { emailjs, site } from "./config.js";
import { STATUS } from "./schema.js";

export const mailEnabled = !!(emailjs.publicKey && emailjs.serviceId && emailjs.templateId);

async function send(params) {
  if (!mailEnabled || !params.to_email) return false;
  try {
    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: emailjs.serviceId, template_id: emailjs.templateId, user_id: emailjs.publicKey,
        template_params: { site_name: site.name, reply_to: site.email, ...params }
      })
    });
    return r.ok;
  } catch { return false; }
}

const portal = () => location.origin + location.pathname.replace(/[^/]*$/, "");

export function mailSubmitted(app) {
  const d = app.data || {};
  const tasks = [send({
    to_email: d.founderEmail, to_name: d.founderName,
    subject: `Application received — ${app.applicationId}`,
    message: `Dear ${d.founderName || "Founder"},\n\nThank you for applying to ${site.name}. We have received the application for ${d.companyName}.\n\nApplication ID: ${app.applicationId}\n\nYou can track its status any time at ${portal()}dashboard.html\n\nRegards,\n${site.name}`
  })];
  if (site.adminEmail) tasks.push(send({
    to_email: site.adminEmail, to_name: "Admin",
    subject: `New application: ${d.companyName} (${app.applicationId})`,
    message: `A new application has been submitted.\n\nCompany: ${d.companyName}\nFounder: ${d.founderName} (${d.founderEmail}, ${d.founderPhone})\nSector: ${d.sector}\nLocation: ${d.city}, ${d.state}\nAmount requested: ₹${Number(d.amountAsked || 0).toLocaleString("en-IN")}\n\nReview it: ${portal()}admin.html`
  }));
  return Promise.all(tasks);
}

const STATUS_TEXT = {
  under_review: "Your application is now under review by our team.",
  shortlisted: "We're pleased to tell you that your application has been shortlisted. Our team will contact you about the next round.",
  selected: "Congratulations! Your startup has been selected. Our team will reach out with the next steps.",
  rejected: "After careful review, we're unable to take your application forward in this cycle. Thank you for applying, and you're welcome to apply again in future.",
  draft: "Your application has been reopened so you can make changes. Please log in, update it and submit again.",
  submitted: "Your application status has been updated to Submitted."
};

export function mailStatus(app, status, note) {
  const d = app.data || {};
  return send({
    to_email: d.founderEmail, to_name: d.founderName,
    subject: `Application update: ${STATUS[status] || status} — ${app.applicationId || d.companyName}`,
    message: `Dear ${d.founderName || "Founder"},\n\n${STATUS_TEXT[status] || ""}${note ? `\n\nMessage from the team:\n${note}` : ""}\n\nApplication ID: ${app.applicationId || "—"}\nCompany: ${d.companyName}\n\nView details: ${portal()}dashboard.html\n\nRegards,\n${site.name}`
  });
}
