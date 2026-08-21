# License Options

**Status:** Apache License 2.0 has been selected by Chris Schultz and added to the repository as `LICENSE`. This document retains the comparison for reference and notes that third-party dependency, media, and font obligations remain separate from the project license choice.

**Scope:** For the `festival-platform` remixable festival website + ticketing platform currently being prepared for an open-source release decision.

**Related:** [Publication Readiness Checklist](./PUBLICATION_READINESS_CHECKLIST.md)

---

## Candidates under consideration

| License | Family | Permissive / Copyleft | Patent grant | Attribution style | Network copyleft |
|---------|--------|-----------------------|--------------|-------------------|------------------|
| MIT | Permissive | Permissive | Implied, not explicit | Preserve copyright notice | No |
| Apache-2.0 | Permissive | Permissive | Explicit patent grant | Preserve NOTICE file + copyright | No |
| AGPL-3.0 | Copyleft | Strong copyleft | Explicit patent grant | Preserve copyright + license notice | Yes |

---

## 1. MIT License

### What rights it grants to remixers

- Use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software.
- No requirement to share modifications.
- Remixers can use it in free, commercial, proprietary, or SaaS products without restriction.

### Attribution / notice obligations

- Must include the original copyright notice in all copies or substantial portions.
- Must include the permission notice (the license text).
- No requirement to preserve a NOTICE file or list changes.

### Patent and copyleft implications

- No explicit patent grant or patent retaliation clause.
- No copyleft; derivative works can remain closed source.
- Submarine patent risk is not addressed by the license text.

### Compatibility with Lovable remixing and downstream hosted instances

- Very compatible: Lovable remixes, hosted instances, and private deployments can all use the code without exposing source.
- Downstream festival producers can host their own branded event sites without sharing code.

### Practical fit for a nonprofit/festival ecosystem

- Simple and familiar to most contributors and remixers.
- Low friction; greatest adoption likely.
- Does not protect the commons from proprietary forks that improve the platform without contributing back.

---

## 2. Apache-2.0 License

### What rights it grants to remixers

- Same broad usage rights as MIT, plus an explicit patent license from contributors.
- Allows remixers to use, modify, distribute, and sublicense the code.

### Attribution / notice obligations

- Must preserve copyright notices and a NOTICE file if one exists.
- Must state modifications if the original has a NOTICE file.
- Slightly heavier compliance than MIT but still minimal.

### Patent and copyleft implications

- Explicit patent grant: contributors license patent rights needed to use their contributions.
- Patent retaliation: if a licensee sues alleging the software infringes a patent, the patent license terminates.
- No copyleft; proprietary derivatives are allowed.

### Compatibility with Lovable remixing and downstream hosted instances

- Highly compatible with Lovable and other hosting platforms.
- Downstream hosts do not need to publish source.
- Slightly more attribution overhead than MIT but manageable.

### Practical fit for a nonprofit/festival ecosystem

- Stronger legal protection for the project against patent claims than MIT.
- Slightly more text, which can intimidate non-technical contributors.
- Recommended by many open-source foundations and corporate legal teams.

---

## 3. AGPL-3.0 License

### What rights it grants to remixers

- Grants the same basic rights as GPL/AGPL, but adds a network-use clause.
- Anyone who modifies the software and runs it on a network must offer the modified source to users interacting with it over the network.

### Attribution / notice obligations

- Must preserve copyright and license notices.
- Must include a copy of the AGPL license and source code offer.
- Must disclose modifications to users who interact with the program over a network.

### Patent and copyleft implications

- Explicit patent grant and retaliation clause.
- Strong copyleft: derivative works must be licensed under AGPL-3.0.
- Network copyleft: merely hosting the application triggers source distribution obligations.

### Compatibility with Lovable remixing and downstream hosted instances

- **Problematic for Lovable remixing.** If a festival producer uses a Lovable remix to host their own event site, AGPL may require them to share the source of any modifications to the platform itself when users interact with it over the network.
- Creates legal friction for non-technical festival organizers who just want to customize their own site.
- Lovable and similar platforms can host AGPL code, but downstream remixers may find obligations burdensome.

### Practical fit for a nonprofit/festival ecosystem

- Maximizes contribution back to the commons.
- Could deter adoption by small festivals, nonprofits, and commercial partners who want to customize without sharing code.
- Risk of "license incompatibility" with permissive libraries and design assets.

---

## Comparison summary

| Concern | MIT | Apache-2.0 | AGPL-3.0 |
|---|---|---|---|
| Ease of remixer adoption | Best | Very good | Poor |
| Lovable / hosted-instance friction | None | Minimal | High |
| Contribution back to commons | None | None | Strong |
| Patent protection | None | Explicit | Explicit |
| Attribution burden | Minimal | Low | High |
| Defense against proprietary forks | None | None | Strong |
| Corporate / nonprofit legal comfort | Good | Best | Low |
| Fits festival ecosystem pragmatism | Best | Best | Poor |

---

## Recommendation

For `festival-platform`, the recommended licenses were **Apache-2.0** or **MIT**, with a slight preference for **Apache-2.0** because of its explicit patent grant and broader legal acceptance by nonprofits and institutional partners.

### Selected license

**Apache License 2.0** has been selected by Chris Schultz and recorded in the root `LICENSE` file (Copyright 2026 Launch Pad Foundation).

### Tradeoffs

- **Apache-2.0** protects the project and contributors better against patent claims and gives the project more legitimacy with organizations that require an explicit patent grant. The NOTICE-file obligation is minor.
- **MIT** was an acceptable alternative and would have been even simpler, maximizing adoption by individual remixers and small festivals. It was not selected.
- **AGPL-3.0** was not recommended for this project because it conflicts with the goal of a low-friction, remixable festival platform: downstream event producers would face source-sharing obligations simply by hosting their own customized event sites, which is likely to reduce adoption and create legal uncertainty for non-technical users.

### Third-party obligations remain separate

The project `LICENSE` applies to code authored for `festival-platform`. It does not resolve:
- Dependency license compatibility (see [Dependency Audit](./DEPENDENCY_AUDIT.md)).
- Font, photography, video, or partner-logo redistribution rights (see [Publication Readiness Checklist](./PUBLICATION_READINESS_CHECKLIST.md)).
- Backend/service provider terms of use for Supabase, Stripe, Resend, or other integrations.

---

## Chris decision field

I, Chris Schultz, have reviewed the license options for `festival-platform` and choose:

- [ ] MIT License
- [x] Apache-2.0 License — approved **2026-08-21**
- [ ] AGPL-3.0 License
- [ ] Other: _________________________________
- [ ] Defer / no license selected at this time

**Signature / Date:** ___________________ Chris Schultz, _______________

**Note:** The `LICENSE` file has been added and the [Publication Readiness Checklist](./PUBLICATION_READINESS_CHECKLIST.md) has been updated. Overall publication readiness still depends on unresolved items in that checklist.
