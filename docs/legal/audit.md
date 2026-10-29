# Legal and regulatory implementation audit

Reviewed: 29 October 2026. Scope: repository configuration examples, auth, API routes, database schemas, browser storage, billing and public pages. No secret environment values were inspected. This is an implementation audit, not an assurance against regulatory penalties.

## Phase 1 findings
- Hono on Cloudflare Workers; static React assets, R2 uploads/exports and Neon Postgres with tenant filters and FORCE RLS. Better Auth supports password, OTP, magic link and optional Google OAuth.
- Account names, emails, images, roles, password hashes, tokens, session IP/user agents, private GPS/history, annotations, jobs, caches and settings are stored. Journey cost adds encrypted plates, vehicles, tariffs, fill-ups, places and estimates. Stripe stores payment details; the app stores billing identifiers/status and webhook IDs.
- Integrations include Cloudflare, Neon, Stripe, Resend, Google identity/Maps, deployment-configured tiles/routing/geocoding, DVLA and Open-Meteo. Shared reference-data ingestion does not itself send user history. Actual regions and contracts cannot be verified from example files.
- Private uploads and downloadable exports exist; public user posting, organization/workspace administration, advertising SDKs and runtime LLM/agent processing were not identified. Demo data is shared. Tenant isolation alone does not make every account an Article 28 processing arrangement.
- Recurring monthly/yearly payments and a Stripe cancellation portal exist. The repository has no evidence that provider dashboard renewal notices, cancellation configuration or durable confirmations meet every applicable market's rules.
- Existing policy routes contained summaries and a repository path instead of the full policy. Cookie disclosures omitted navigation, recent places, feature preferences and last-estimate persistence. Operator identity/contact details were not established.

## Implemented
- Public Privacy, Terms, Cookies, Service providers, conditional DPA, Accessibility and Operator details routes, with policy text loaded directly from docs/legal to prevent source/UI drift.
- Typed public legal configuration with explicit operator placeholders, data categories/bases/deletion triggers, integration locations/safeguard verification and storage inventory. No invented legal entity, region, certification or executed transfer agreement.
- Reusable legal footer on public/auth/legal screens and billing/privacy settings. Global legal access and changeable storage choices remain available on signed-in views.
- Default-denied optional persistent browser storage; choices retain functionality in page memory. Equal allow/reject actions and withdrawal remove persisted app preferences. Theme boot honours the same choice. Essential auth and the choice record remain separate.
- Billing and hosted Checkout disclose renewal, cancellation and statutory rights. No digital-content waiver is taken for the ongoing hosted service and no usage deduction is claimed.
- Regression coverage for pre-consent reads/writes, grant/withdrawal and unavailable storage; checkout disclosures and all public routes.

## Operator actions before commercial launch
1. Replace every TODO in apps/web/src/config/legal.ts with verified legal identity, address, monitored support/privacy contact, company/VAT/ICO status and representative/DPO assessment. A placeholder is not a compliant public disclosure.
2. Inventory actual deployed map hosts and vendor roles. Confirm hosting/storage regions, retention/logging, executed DPAs, SCCs/UK Addendum or other lawful safeguards. Do not claim Data Privacy Framework participation without checking it.
3. Verify upload/export cleanup and lifecycle expiry, Neon backup expiry, logs, auth-row expiry cleanup and statutory financial retention. Disclose the real schedule. Test deletion and restoration operationally.
4. Review the launch-date UK DMCC subscription regime and implementing rules, EU/local consumer requirements and US federal/state automatic-renewal laws. Configure Stripe prices, taxes, cancellation, confirmations and mandatory renewal reminders. The UI disclosures do not implement an unverified statutory reminder/refund workflow.
5. Obtain legal review of precise-location processing, sensitive inferences, DPIA requirements, US sensitive-data laws and actual territorial/size thresholds. Do not assume every named law applies globally. An adults-only term is not an age-assurance system.
6. Execute a completed Article 28 DPA and transfer schedules before authorized business third-party processing. No public-UGC or AI clauses are fabricated; reassess OSA/DSA/DMCA and AI duties before introducing those features.
7. Perform WCAG keyboard/screen-reader/contrast/mobile testing and maintain barrier handling. The accessibility statement identifies limitations rather than claiming tested conformance. Assess EAA/ADA scope against actual establishment and service.

## Primary legal references checked
- Consumer Contracts Regulations, service performance and cancellation: https://www.legislation.gov.uk/uksi/2013/3134/regulation/36/made
- UK subscription contracts guidance (check commencement and implementing rules at launch): https://www.gov.uk/government/publications/subscription-contracts
- ICO storage exceptions: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/
- ICO consent practice: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-manage-consent-in-practice/
- European Commission controller/processor guidance: https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en
- FTC subscription/cancellation guidance: https://consumer.ftc.gov/articles/getting-and-out-free-trials-auto-renewals-and-negative-option-subscriptions

## Validation
- Test placement passed. Full unit suite: 131 files, 694 tests passed. Billing integration regression: 11 tests passed.
- Workspace type checks and the final frontend type check passed. New legal/storage files pass targeted lint.
- Full frontend lint reports 105 errors and 10 warnings in the existing UI codebase; this work does not claim to clear that backlog.
- No database migrations, tenant query rewrites or deployment actions were performed. Live RLS tests were not required for the disclosure-only API change.
- Production web build passed. Nine Playwright checks passed against the built SPA, including every public legal route, consent grant/withdrawal, and phone layouts in both themes. The missing Playwright Chromium shell was installed locally before the successful run.
