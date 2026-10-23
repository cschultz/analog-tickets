-- Draft only. A reservation may have any number of failed retries, but only
-- one attempt that is pending or has settled. Keeping completed and abandoned
-- rows in the uniqueness predicate closes the interval after finalization or
-- abandonment removes a row from the older pending-only partial index.
--
-- An existing reservation with multiple non-failed attempts makes this
-- migration fail without changing data. Review such rows explicitly before
-- any authorized application; do not automatically delete/repoint attempts.
CREATE UNIQUE INDEX IF NOT EXISTS checkout_attempts_one_nonfailed_reservation
  ON public.checkout_attempts (reservation_id)
  WHERE reservation_id IS NOT NULL
    AND status IN ('pending', 'completed', 'abandoned');
