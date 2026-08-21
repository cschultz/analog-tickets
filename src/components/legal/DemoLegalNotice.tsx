/**
 * Illustrative-only banner for legal surfaces.
 *
 * The legal copy shipped with this open-source demo is placeholder language
 * for the inactive Cosmico demonstration site. It is not legal advice and must be
 * reviewed and replaced by the organizer's own counsel before any real use.
 */
const DemoLegalNotice = () => (
  <div
    role="note"
    data-testid="demo-legal-notice"
    className="mb-10 rounded-sm border border-current/30 px-5 py-4 text-sm leading-relaxed opacity-80"
  >
    <strong className="uppercase tracking-widest text-xs block mb-1">
      Illustrative demo language
    </strong>
    This page is placeholder text for the inactive Cosmico demonstration site. It is
    not legal advice and is not enforceable. Organizers must replace it with policies
    reviewed by their own legal counsel before publishing.
  </div>
);

export default DemoLegalNotice;
