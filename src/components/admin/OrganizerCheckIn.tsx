import { Button } from "../ui/button";

/** Entry only: the existing door surface and command retain all authorization. */
export function OrganizerCheckIn({ onAttendees }: { onAttendees: () => void }) {
  return (
    <section className="admin-check-in" aria-label="Door operations">
      <p className="checkout-note">
        Use attendee lookup to help someone find their ticket. Use the door tool only when you are
        ready to record a TEST admission.
      </p>
      <div className="admin-check-in-options">
        <article>
          <h2>Find an attendee</h2>
          <p>
            Search by name, email, full ticket ID or order ID. Review ticket and check-in status
            without recording admission.
          </p>
          <Button type="button" variant="outline" onClick={onAttendees}>
            Open attendee lookup
          </Button>
        </article>
        <article>
          <h2>Scan or enter a pass</h2>
          <p>
            The existing door tool supports QR scanning and manual pass entry. Opening it does not
            request camera access or check anyone in.
          </p>
          <a
            className="admin-door-link"
            href="/staging/box-office/check-in"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open TEST door tool ↗
          </a>
          <p className="checkout-note">Opens in a new tab. Keep this workspace open for lookup.</p>
        </article>
      </div>
      <aside className="admin-check-in-limits" aria-label="Current check-in limits">
        <h2>Before using the door tool</h2>
        <p>
          This is TEST only, not real admission. The Box Office module must be enabled and your
          account must have existing door access to exactly one eligible event. This pilot does not
          yet offer multi-event scanning.
        </p>
        <p>
          The door tool resolves the event from the pass and rechecks permission for every attempt.
          The event selected in this workspace does not grant or override that access. Duplicate,
          voided and unauthorized passes remain rejected.
        </p>
        <p>
          If it says “Not available” or “Not permitted,” ask the installation owner to check module
          setup and existing event access. Do not create a replacement ticket or assume someone was
          admitted. If a submission outcome is unclear, check its recorded status before taking
          another action.
        </p>
      </aside>
    </section>
  );
}
