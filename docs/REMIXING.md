# Remix Analog Tickets in TEST mode

## Start from the clean template

Open the [Analog Tickets TEST-beta template](https://lovable.dev/projects/21f8f796-5112-4000-b555-8ffdda832bd8)
and choose **Remix** to make your own copy. Lovable requires an account to create
the copy; viewing a public-remix preview does not make you a collaborator.
The original project stays unchanged. This template is separate from the
Cosmico demonstration and contains no festival media, operational records or
provider credentials.

Read the [license](../LICENSE.md), [additional permissions](../ADDITIONAL_PERMISSIONS.md)
and [prior-source licensing](PRIOR_SOURCE_LICENSES.md) before distributing a
derivative. Organizer use and paid installation/customization are permitted as
described there; competing platforms require a separate commercial agreement
unless independently authorized by other applicable rights.

## A copy is not an installed ticketing service

Follow the [first-run guide](RELEASE_FIRST_RUN.md). A blank or unconfigured
catalog is not a failed purchase; no event exists until you install and configure
your isolated backend. Keep workflow flags disabled until the relevant setup
is complete. Use only TEST funds and synthetic `@example.test` recipients.
Do not copy settings from the Cosmico demo or another organizer.

Lovable's [remix documentation](https://docs.lovable.dev/features/projects/remix)
describes the current copy behavior: code and database structure carry over,
while records, secrets, custom domains, publish state, collaborators and service
connections do not. Public-link remixes do not copy project chat history or
Files-tab attachments. Your copy starts unpublished. Verify its actual state
rather than assuming the source template's settings transferred.

Before applying the fresh-only installer, verify that Auth has zero users and
the public application schema is empty. A remixed schema with tables but no
records is not empty: run the read-only verifier to identify it and use the
appropriate reviewed path. Never reset a schema to force installation. A visual
remix does not prove Auth, RLS, checkout or webhook behavior, and it grants no
staff role or provider access.

If the template contains no application schema, apply the exact reviewed fresh
installer after its rollback rehearsal, then opt into the synthetic sample seed.
Use supported Auth administration and the documented actor/staff mapping. Keep
service keys server-only. Stripe and Mailtrap setup is optional for read-only
catalog work and is always TEST-only for this release.

## Source-only alternative and recovery path

The [GitHub releases](https://github.com/cschultz/analog-tickets/releases) include
the curated source archive, checksum and source manifest. You can install it
locally without Lovable. For a manual Lovable import, its current
[Upload code workflow](https://docs.lovable.dev/features/projects/import-project)
accepts a source ZIP. Exclude dependencies, build output, Git history and
populated settings. Preserve the license and notices.

Lovable may migrate or regenerate code during import. Compare every manifested
file and inventory extras before treating a copy as source-faithful. Do not
silently replace the reviewed Auth/payment contracts with generated alternatives
or add dependencies solely to make inherited starter tests compile. Keep the
successful exact-tree audit **before** building; the route tree is generated
during build. Git sync creates a new repository; it does not import an existing
one. Do not connect this template to the canonical repository expecting an import.

## Keep the beta limits visible

Physical-phone camera scanning and unaided independent human installation remain
unverified, explicitly accepted TEST-beta limits. No offline scanning, real-money
readiness, real-recipient email or shared service is promised. Validate your own
deployment; do not call a successful remix an event-launch certification.
