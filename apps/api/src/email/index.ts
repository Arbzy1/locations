export type { EmailKind, EmailVars } from "./kinds";
export { EMAIL_KINDS } from "./kinds";
export { escapeHtml, renderEmail } from "./templates";
export { sendEmail, sendEmailSafe } from "./send";
export type { SendEmailOpts } from "./send";
export { billingEmailKind, isDemoRecipient, sendProductEmail } from "./notify";
