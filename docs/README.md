# Locations documentation

Index of product, architecture, security, legal, and engineering docs. Agent conventions live in [`AGENTS.md`](../AGENTS.md), not here.

## Product

- [Overview](product/overview.md)
- [Features](product/features.md)
- [Further features and pages](product/ideas.md) (ideas, not a build commitment)
- [Onboarding](product/onboarding.md)
- [Takeout import](product/takeout-import.md)

## Architecture

- [Overview](architecture/overview.md)
- [Tenancy and RLS](architecture/tenancy-and-rls.md)
- [Import pipeline](architecture/import-pipeline.md)
- [Maps and routing](architecture/maps-and-routing.md)
- [Auth and billing](architecture/auth-and-billing.md)

## Security

- [Catalog](security/README.md)
- [Threat model](security/threat-model.md)
- [PR checklist](security/checklist.md)
- [Incident response](security/incident-response.md)
- [Subprocessors](security/subprocessors.md)

## Legal (source for public pages)

- [Privacy](legal/privacy.md)
- [Terms](legal/terms.md)
- [Cookies](legal/cookies.md)
- [DPA](legal/dpa.md)

## API and engineering

- [HTTP routes](api/routes.md)
- [Local setup](engineering/local-setup.md)
- [Deploy](engineering/deploy.md)
- [Testing](engineering/testing.md)
- [UI (shadcn + Motion)](engineering/ui.md)
- Runbooks: [rotate secrets](engineering/runbooks/rotate-secrets.md), [restore tenant](engineering/runbooks/restore-tenant.md), [stuck import](engineering/runbooks/stuck-import.md), [Stripe webhook replay](engineering/runbooks/stripe-webhook-replay.md)

## Changelog

- [changelog.md](changelog.md)

The previous `docs/OWN_DATA.md` and `docs/SECURITY.md` content now lives under product/takeout-import and security/.
