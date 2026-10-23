CREATE UNIQUE INDEX IF NOT EXISTS checkout_attempts_one_active_reservation
  ON public.checkout_attempts (reservation_id)
  WHERE reservation_id IS NOT NULL AND status = 'pending';

CREATE INDEX IF NOT EXISTS checkout_attempts_reservation_id_idx
  ON public.checkout_attempts (reservation_id)
  WHERE reservation_id IS NOT NULL;