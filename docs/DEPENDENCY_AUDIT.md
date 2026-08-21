# Dependency Security and License Inventory

**Date:** 2026-08-21 (UTC)
**Scope:** Read-only audit of the private `festival-platform` remixable source at the current commit. No dependency, lockfile, or application changes were made in this slice.
**Package manager:** npm (single authoritative lockfile `package-lock.json`; see [Open Source Release Baseline](./OPEN_SOURCE_RELEASE_BASELINE.md))

**Related docs:**
- [Publication Readiness Checklist](./PUBLICATION_READINESS_CHECKLIST.md) (items 4.1–4.4)
- [License Options](./LICENSE_OPTIONS.md) (Apache-2.0 selected and approved on 2026-08-21)


> This document records observed tooling output only. It is **not** a legal review and does **not** grant, choose, or clear any license.

---

## 1. Commands run

| # | Command | Outcome |
|---|---------|---------|
| 1 | `npm audit --json` (default sandbox registry mirror) | **Failed** — mirror does not implement the advisory endpoint: `404 Not Found - POST .../-/npm/v1/security/audits/quick — operation is not supported.` |
| 2 | `npm audit --json --registry=https://registry.npmjs.org` | **Succeeded** — public advisory registry reachable; report generated |
| 3 | Local license tally parsed from `package-lock.json` + installed `node_modules/*/package.json` metadata | Partial (see limitations) |

No secrets, tokens, or private registry credentials appear in this document.

### Registry reachability

- The sandbox default npm mirror is reachable for package downloads but **does not support audits**.
- `https://registry.npmjs.org` was reachable and returned a complete advisory report.
- Remixers on restricted networks should expect item 1 to fail and should pass an explicit public registry.

---

## 2. Vulnerability summary (`npm audit`, public registry)

Dependency graph: **1116 total** (prod 900, dev 131, optional 112, peer 9).

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 19 |
| Moderate | 6 |
| Low | 1 |
| **Total** | **27** |

`fixAvailable: true` was reported for **all 27** advisories.

### Advisories by package

| Package | Severity | Representative advisory | Graph position |
|---------|----------|-------------------------|----------------|
| vitest | critical | Vitest UI server allows arbitrary file read/execute when listening | build/test tooling |
| @babel/plugin-transform-modules-systemjs | high | Arbitrary code generation from malicious input | build tooling |
| @remix-run/router | high | XSS via open redirects; protocol-relative `//` redirect reinterpretation | runtime (routing) |
| react-router | high | Unexpected external redirect via untrusted paths | runtime (routing) |
| react-router-dom | high | Inherited from `react-router` / `@remix-run/router` | runtime (routing) |
| brace-expansion | high | Zero-step sequence process hang / memory exhaustion | dev tooling |
| fast-uri | high | Host confusion via backslash authority delimiter | transitive |
| flatted | high | Unbounded recursion DoS; prototype pollution in `parse()` | dev tooling |
| glob | high | CLI command injection via `-c/--cmd` | tooling |
| js-yaml | high | Prototype pollution in merge keys; quadratic DoS | dev tooling |
| linkify-it | high | Quadratic-complexity DoS in match scan loop | transitive (markdown) |
| lodash | high | Code injection via `_.template`; prototype pollution in `_.unset`/`_.omit` | transitive |
| minimatch | high | ReDoS via repeated wildcards | dev tooling |
| nanoid | high | Non-secure generators can loop indefinitely | transitive |
| picomatch | high | Method injection in POSIX character classes | tooling |
| postcss | high | XSS via unescaped `</style>`; file read via `sourceMappingURL` | build tooling |
| rollup | high | Arbitrary file write via path traversal | build tooling |
| serialize-javascript | high | RCE via `RegExp.flags`; CPU-exhaustion DoS | build tooling |
| vite | high | Public-directory name collision file serving; `server.fs` not applied to HTML | dev server |
| ws | high | Uninitialized memory disclosure; memory-exhaustion DoS | transitive |
| @rollup/plugin-terser | moderate | Inherited from `serialize-javascript` | build tooling |
| ajv | moderate | ReDoS with `$data` option | dev tooling |
| esbuild | moderate | Dev server accepts cross-origin requests and returns responses | dev tooling |
| markdown-it | moderate | ReDoS; quadratic complexity in smartquotes | transitive (markdown) |
| workbox-build | moderate | Inherited from `@rollup/plugin-terser` | build tooling |
| yaml | moderate | Stack overflow via deeply nested collections | tooling |
| @babel/core | low | Arbitrary file read via `sourceMappingURL` comment | build tooling |

### Interpretation

- The **critical** finding (`vitest` UI server) and the `esbuild`/`vite` dev-server findings affect **local development surfaces**, not the built static site, unless a developer exposes the dev/test server on an untrusted network.
- The **router advisories are the most release-relevant runtime items**: open-redirect / protocol-relative redirect handling is directly reachable by end users of a deployed remix. This overlaps checklist item 6.9 (unsafe/open redirects).
- `lodash`, `nanoid`, `ws`, `linkify-it`, `markdown-it`, and `fast-uri` are transitive; exposure depends on how the bundled code paths are reached and should be re-checked after any upgrade slice.
- Remediation (dependency upgrades) is intentionally **out of scope for this slice**; it is a separate change with regression risk to routing, build, and test tooling.

---

## 3. License inventory

Derived from `package-lock.json` (1116 entries) cross-referenced with the `license`/`licenses` field of installed `node_modules` package manifests (959 entries had a readable manifest).

| Declared license | Packages |
|------------------|----------|
| MIT | 828 |
| ISC | 60 |
| Apache-2.0 | 32 |
| BSD-2-Clause | 11 |
| BSD-3-Clause | 10 |
| BlueOak-1.0.0 | 4 |
| MIT-0 | 2 |
| Apache-2.0 AND MIT | 2 |
| (MIT OR CC0-1.0) | 2 |
| Python-2.0 | 1 |
| CC-BY-4.0 | 1 |
| (AFL-2.1 OR BSD-3-Clause) | 1 |
| (MIT OR GPL-3.0-or-later) | 1 |
| CC0-1.0 | 1 |
| (MIT AND Zlib) | 1 |
| MIT AND ISC | 1 |
| 0BSD | 1 |
| Not determinable locally | 157 |

### Notable / non-plain-permissive entries

| Package | Declared license | Note |
|---------|------------------|------|
| `jszip` | (MIT OR GPL-3.0-or-later) | Dual-licensed; MIT election is available, but the election should be recorded once a project license is chosen |
| `argparse` | Python-2.0 | Permissive, but not a standard MIT/BSD form; requires notice review |
| `caniuse-lite` | CC-BY-4.0 | Data package with attribution obligations |
| `mdn-data` | CC0-1.0 | Public-domain dedication |
| `json-schema` | (AFL-2.1 OR BSD-3-Clause) | Dual-licensed; BSD-3-Clause election is available |
| `pako` | (MIT AND Zlib) | Combined terms |
| `victory-vendor` | MIT AND ISC | Combined terms |
| `@swc/core-linux-x64-*` | Apache-2.0 AND MIT | Combined terms |
| `jackspeak`, `lru-cache`, `path-scurry`, `package-json-from-dist` | BlueOak-1.0.0 | Permissive but uncommon; may require reviewer familiarity |
| `type-fest` | (MIT OR CC0-1.0) | Dual-licensed |

**No strong copyleft (GPL-only or AGPL) dependency was observed.** The only GPL reference is the `jszip` dual license where MIT may be elected.

### Limitations of this scan

- **No complete license scan tool was available.** No `license-checker`, `licensee`, or SBOM generator is installed, and this slice forbids adding dependencies. The tally was produced by reading manifest metadata directly.
- **157 packages could not be resolved locally.** These are almost entirely platform-specific optional binaries not installed on this machine (`@esbuild/*`, `@rollup/rollup-*`, `@swc/core-*`, `@tailwindcss/oxide-*`, etc.). Their upstream licenses are typically MIT or Apache-2.0 but were **not verified here**.
- Declared `license` fields were trusted as-is. **No LICENSE file text, NOTICE requirement, or dual-license election was verified.**
- **Fonts, photography, video, and other binary media are out of scope of npm metadata** and remain unresolved (checklist items 3.1–3.6, and 4.3).
- No SPDX-validated SBOM was produced.

---

## 4. Unresolved items

| # | Item | Blocks |
|---|------|--------|
| 4.1 | 27 open npm advisories (1 critical, 19 high) not remediated | Public release; upgrade slice required |
| 4.2 | Router open-redirect advisories overlap with unverified redirect hardening (checklist 6.9) | Public release |
| 4.3 | 157 optional/platform packages have unverified licenses | Formal license clearance |
| 4.4 | No SBOM and no verified license-text review | Formal license clearance |
| 4.5 | Dual-license elections (`jszip`, `json-schema`, `type-fest`) not recorded | Depends on project license choice (Apache-2.0 selected 2026-08-21); elections still need to be recorded |
| 4.6 | Attribution/NOTICE obligations (`caniuse-lite` CC-BY-4.0, Apache-2.0 packages) not compiled | Public release |
| 4.7 | Font and media licensing wholly unresolved | Public release |

---

## 5. Release recommendation

**NOT READY for public release on dependency grounds, even though the project license (Apache-2.0) has been selected and approved.**

- **Private GitHub source:** acceptable, provided the audit findings above are tracked. Advisories are largely tooling-scoped and no strong-copyleft dependency was found.
- **Lovable remix template:** not recommended until the runtime router advisories are remediated and the redirect-hardening question (checklist 6.9) is answered, since remixers inherit the dependency graph as-is.
- **Public release:** blocked until (a) a dependency upgrade slice clears or explicitly accepts the critical/high advisories, (b) a complete license/SBOM scan is run with proper tooling, (c) attribution obligations are compiled, and (d) third-party dependency and license clearance (including dual-license elections, media/font clearance, and any required NOTICE files) is complete. The selection and approval of the project license (Apache-2.0) is a distinct prerequisite that is now satisfied.

This document does not constitute legal advice or license clearance. Project license selection (Apache-2.0) is recorded in [License Options](./LICENSE_OPTIONS.md); this document does not itself grant or verify third-party licenses.
