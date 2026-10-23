/** Unapplied proposal builder. No connection, environment, or file writes. */
export function buildPassRevocationTriggerSql() {
  return `
-- DRAFT ONLY: apply solely in the isolated synthetic harness, not staging.
CREATE OR REPLACE FUNCTION public.revoke_ticket_passes_on_state_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $proposal$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'issued') THEN
    UPDATE public.ticket_pass_codes SET status = 'revoked'
      WHERE ticket_id = NEW.id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$proposal$;
REVOKE ALL ON FUNCTION public.revoke_ticket_passes_on_state_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_ticket_passes_on_state_change() TO service_role;
CREATE TRIGGER tickets_revoke_passes_on_state_change
  AFTER UPDATE OF owner_user_id, status ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.revoke_ticket_passes_on_state_change();`;
}

export function buildPassInvalidationSql(attendanceSource) {
  const functions = attendanceSource.match(
    /CREATE OR REPLACE FUNCTION public\.(?:check_in_ticket|reverse_ticket_check_in)\([\s\S]*?\$function\$;/g,
  );
  if (!functions || functions.length !== 2) throw new Error("unexpected attendance source");
  const marker =
    "IF NOT FOUND OR v_ticket.event_id <> v_pass.event_id THEN\n    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;\n  END IF;";
  const hardened = functions.map((fn) => {
    if (fn.split(marker).length !== 2) throw new Error("unexpected ticket-lock guard");
    return fn.replace(
      marker,
      `${marker}

  -- Ticket lock is acquired first; revalidate and lock the pass afterward.
  -- A revoked snapshot read before waiting for the ticket cannot admit entry.
  SELECT * INTO v_pass FROM public.ticket_pass_codes
    WHERE id = v_pass.id AND ticket_id = v_ticket.id
      AND event_id = v_ticket.event_id
      AND code_digest = p_code_digest AND status = 'active'
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_pass'::text, NULL::timestamp with time zone; RETURN;
  END IF;`,
    );
  });
  return `${buildPassRevocationTriggerSql()}
${hardened.join("\n")}
REVOKE ALL ON FUNCTION public.check_in_ticket(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_ticket_check_in(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_ticket_check_in(text, uuid, text) TO service_role;
`;
}
