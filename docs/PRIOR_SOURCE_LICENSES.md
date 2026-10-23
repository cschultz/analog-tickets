# Earlier public source and retained licenses

Before this TEST beta, this repository published a different React/Vite festival
application under Apache-2.0. Its last pre-beta main revision is
[`c5a1dcfd12590d9797c4cce549fa6a782a8370b4`](https://github.com/cschultz/analog-tickets/tree/c5a1dcfd12590d9797c4cce549fa6a782a8370b4).
The beta replaces the working tree through an ordinary commit; that earlier
source remains in Git history. No history rewrite or withdrawal of its grant
is intended. The prior license, including the Foundation copyright notice, is
preserved verbatim in [Apache-2.0-prior-source.txt](../licenses/Apache-2.0-prior-source.txt).

## Which terms apply?

- The beta's Foundation grant is described in [LICENSE.md](../LICENSE.md) and
  [ADDITIONAL_PERMISSIONS.md](../ADDITIONAL_PERMISSIONS.md).
- Earlier Apache-2.0 grants remain valid for the earlier work and applicable
  retained portions. The beta's platform restriction must not be represented as
  retroactively restricting those portions or preventing use of the earlier app
  under its existing grant. Do not strip its copyright/license notices.
- Third-party software retains its own terms. Read the collected notices and
  inventory; neither Foundation license overrides third-party rights.
- Excluded festival marks, photography, fonts and Artist Assets are not granted
  by publication of this beta. Earlier publication is not new media clearance.

## Source comparison, not a provenance opinion

A comparison with that pinned public tree found two byte-identical retained
paths: `src/components/ui/aspect-ratio.tsx` and `src/hooks/use-mobile.tsx`.
Other shared paths differ, including the UI component library, `src/lib/utils.ts`,
generated integration types and build/configuration files. A path or hash match
does not establish exclusive authorship, the scope of all derived portions, or
that a nonmatching file has no prior grant. Applicable earlier rights are
preserved regardless of that comparison. The new transactional ticketing source
must not be described as having revoked the older application's permissions.

The earlier application had different installation commands, UI contracts and
backend functions. Do not combine its migrations, dependencies or workflows
with this beta. Follow this version's [first-run guide](RELEASE_FIRST_RUN.md).
The current root tree intentionally excludes those old runtime files and media;
their history is retained, not repackaged into this release or remix template.
