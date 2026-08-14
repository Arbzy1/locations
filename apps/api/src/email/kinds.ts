export const EMAIL_KINDS = [
  "verify_email_link",
  "verify_email_otp",
  "password_reset_link",
  "magic_link",
  "signin_otp",
  "change_email_verify",
  "password_changed",
  "email_changed",
  "import_ready",
  "import_failed",
  "subscription_active",
  "subscription_past_due",
  "subscription_canceled",
  "account_deleted",
  "monthly_recap",
] as const;

export type EmailKind = (typeof EMAIL_KINDS)[number];

export type EmailVars = {
  url?: string;
  otp?: string;
  visitCount?: number;
  activityCount?: number;
  siteUrl?: string;
  daysTracked?: number;
  distanceLabel?: string;
  monthLabel?: string;
};
