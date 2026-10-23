# Contributing to the TEST beta

Read the [license](../LICENSE.md), [additional permissions](../ADDITIONAL_PERMISSIONS.md)
and [earlier-source terms](../docs/PRIOR_SOURCE_LICENSES.md). Do not assume an
unrestricted open-source grant or change third-party/earlier grants by inference.

Keep changes generic, reviewable and TEST-only. Never commit populated settings,
credentials, customer data, real recipient information or uncleared media. Use
synthetic fixtures. Describe any Auth, RLS, SQL, pricing, payment/refund, webhook,
email or permission implications and the checks actually performed. Do not apply
SQL or call providers from CI. Ordinary fixes do not require a standing server.

Before installing/building the exact unmodified release, run its import audit
and SQL artifact verification. Then follow [first run](../docs/RELEASE_FIRST_RUN.md)
for frozen install, build and both typechecks. Build generates the route tree;
retain the pre-build audit rather than interpreting that generated file as a
source change. The full private engineering test suite is not shipped in this
curated release; public CI checks the source/import/SQL/build/type contracts.

When intentionally changing a release file, document the diff against the
published manifest; the old exact-tree audit is supposed to report changed
bytes. Do not silently regenerate a manifest to hide drift or present a modified
copy as the original release. Report security issues through
[SECURITY.md](../SECURITY.md), not a public issue.
