# Remixer Backend Contract

**Scope note.** This document is an *inventory derived from frontend call sites*
(`.from()`, `.rpc()`, `.functions.invoke()`, `storage.from()`, and `auth.*` usage in
`src/`). It is **not** a migration, not a schema, and not a verified backend
description. Nothing here has been recreated, executed, or validated against a
database. A remixer must design, implement, and security-review their own backend.
Schema/RLS work is a separate, later gate.

Related docs: [Open source release baseline](./OPEN_SOURCE_RELEASE_BASELINE.md),
[Platform modes](./PLATFORM_MODES.md),
[Sanitization status](./OPEN_SOURCE_SANITIZATION_STATUS.md).

---

## 1. Configuration surface

### Required public (client) environment variables

Validated in `src/platform/config/env.ts`; see `.env.example`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Backend project base URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Public anon/publishable key |
| `VITE_SUPABASE_PROJECT_ID` | optional | Convenience identifier for tooling |
| `VITE_PLATFORM_MODE` | optional | `site` \| `ticketing` \| `integrated` (default `integrated`) |
| `VITE_EVENT_SLUG` | optional | Selects the event config under `src/events/` |
| `VITE_PRODUCTION_HOSTS` | optional | Comma-separated canonical hosts |
| `VITE_ENABLE_TESTING` | optional | Enables test-only affordances |

These are public by design. No secret belongs in a `VITE_*` variable.

### Server-side secret **categories** (names only, never values)

Referenced by server code via `Deno.env.get(...)`. A minimal remix needs only the
first two rows; everything else is optional per integration.

| Category | Secret names |
| --- | --- |
| Backend platform (auto-provided) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Transactional email | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` |
| SMS | `SIMPLYTEXT_API_KEY` |
| AI features | `LOVABLE_API_KEY` |
| Marketing/analytics | `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_PIXEL_ID`, `META_TEST_EVENT_CODE`, `FLODESK_API_KEY`, `CONVERTKIT_API_KEY` |
| Social publishing | `CUE_API_KEY`, `CUE_PROFILE_ID`, `CUE_INSTAGRAM_ACCOUNT_ID` |
| Media sync | `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`, `DROPBOX_ACCESS_TOKEN` |
| Wallet passes | `APPLE_PASS_TEAM_ID`, `APPLE_PASS_TYPE_ID`, `APPLE_PASS_P12_BASE64`, `APPLE_PASS_P12_PASSWORD`, `APPLE_PASS_WWDR_PEM_BASE64` |
| Ops/alerting | `SLACK_ALERT_WEBHOOK_URL`, `SITE_URL` |

---

## 2. Core tables and views

The frontend touches roughly 130 relations. Grouped by purpose; the **Tier** column
marks what a minimal *site + ticketing* remix needs (**Core**) versus what is
admin-only or integration-specific (**Optional**).

### Event and identity — Core
| Relation | Purpose (inferred from usage) |
| --- | --- |
| `event_details` | Singleton-style active event record: dates, copy, capacity |
| `profiles` | User profile data linked to auth users |
| `user_roles` | Role assignments; read via the `has_role` RPC |

### Ticketing and inventory — Core
| Relation | Purpose |
| --- | --- |
| `ticket_types`, `ticket_tiers` | Sellable ticket definitions and pricing tiers |
| `ticket_inventory`, `capacity_tracker` | Remaining allocation / attendance cap |
| `registrations` | Orders: purchaser, payment status, quantities |
| `tickets` | Individual issued tickets tied to a registration |
| `promo_codes` | Discount codes, stackability, allowed ticket types |
| `checkout_fees`, `payment_plan_config`, `payment_plan_enrollments`, `scheduled_payments` | Fees and split-payment plans |
| `ticket_waitlist` | Waitlist for sold-out tiers |
| `addon_inventory`, `addon_purchases`, `addon_redemptions` | Add-on products |

### Payments and reliability — Core (ticketing)
`refunds`, `webhook_logs`, `checkout_errors`, `dead_letter_queue`,
`edge_function_incidents`, `incident_alert_config`, `canary_run_history`,
`sync_jobs`, `scheduled_job_history`, `stripe_payment_health_alert_settings`,
`stripe_payment_health_alert_runs`.

### Ticket lifecycle — Optional
`ticket_transfers`, `pending_ticket_transfers`, `upgrade_offers`, `custom_offers`,
`crew_bids`, `crew_campaign_settings`, `raffle_entries`, `preview_signups`,
`preview_access_tokens`.

### Box office — Optional (required if you run door check-in)
`check_in_events`, plus reads of `registrations` / `tickets`.

### Lodging and accommodations — Optional
`lodging_bookings`, `lodging_inventory`, `lodging_settings`, `lodging_invite_tokens`,
`lodging_visual_assets`, `accommodations`, `accommodation_units`,
`accommodation_zones`, `accommodation_waitlist`.

### Programming and partners — Optional
`artists`, `artist_contacts`, `artist_assets`, `artist_offers`, `artist_emails`,
`artist_email_*`, `artist_workflow_*`, `pending_artist_imports`, `vendors`,
`vendor_contacts`, `partners`, `partner_contacts`, `artisans`, `artisan_contacts`,
`contracts`, `contract_templates`, `contract_signatures`, `session_rsvps`.

### Volunteers and community — Optional
`volunteers`, `volunteer_interests`, `volunteer_roles`, `volunteer_shifts`,
`volunteer_shift_assignments`, `street_team`, `community_requests`,
`contact_submissions`, `survey_config`, `survey_responses`, `event_reflections`,
`winecamp_attendees`.

### Email and notifications — Optional
`email_settings`, `email_templates`, `email_template_versions`,
`email_template_config`, `saved_email_templates`, `production_email_templates`,
`production_email_threads`, `production_email_messages`,
`production_email_recipients`, `pending_email_imports`, `email_logs`,
`email_send_log`, `email_bounces`, `email_unsubscribes`, `email_rate_limits`,
`email_sequences`, `email_sequence_steps`, `email_sequence_logs`,
`bulk_email_campaigns`, `admin_email_aliases`, `admin_notifications`,
`sms_delivery_logs`, `event_reminders`, `recovery_email_unsubscribes`.

### Marketing, CRM and analytics — Optional
`lead_tracking`, `lead_notes`, `newsletter_leads`, `checkout_abandonment`,
`cart_intent_signals`, `funnel_events`, `funnel_step_alerts`, `chat_logs`,
`pipeline_configs`, `pipeline_fields`, `pipeline_stages`, `pipeline_stage_configs`,
`pipeline_notes`, `pipeline_payments`, `pipeline_saved_views`, `entity_ownership`,
`activity_logs`, `admin_audit_logs`, `admin_invitations`, `event_sales_summary` (view-like
reporting relation), `event_photo_links`.

### Social/media — Optional
`social_photos`, `social_photo_sources`, `social_post_photos`,
`social_scheduled_posts`, `social_caption_examples`, `social_brand_voice`,
`social_locations`, `avatars`.

### Storage buckets
`artist-assets`, `artist-attachments` (both admin-facing; not needed for a minimal remix).

---

## 3. RPC contracts

| RPC | Group | Notes |
| --- | --- | --- |
| `has_role(user_id, role)` | Auth | Security-definer role check used by guards and RLS |
| `log_admin_action` | Admin | Audit trail write |
| `verify_admin_invitation` | Admin | Validates an admin invite token |
| `validate_preview_token`, `validate_ticket_access_token`, `validate_contract_token` | Tokens | Unauthenticated token validation for gated routes |
| `mint_my_tickets_session`, `mint_my_tickets_session_from_token`, `mint_my_tickets_session_for_auth` | Ticketing | Issues a scoped session for the self-serve tickets page |
| `get_active_popup_promo_code` | Ticketing | Returns the currently active behavioral promo |
| `addon_lookup`, `addon_redeem` | Add-ons | Look up and redeem an add-on |
| `increment_zone_inventory` | Lodging | Inventory adjustment |
| `box_office_validate_pin`, `box_office_pin_valid`, `box_office_admin_auto_unlock` | Box office | PIN gate for the scanner |
| `box_office_search`, `box_office_lookup_order` | Box office | Attendee/order lookup |
| `box_office_check_in`, `box_office_undo_check_in`, `box_office_today_count` | Box office | Check-in mutations and counters |

---

## 4. Edge-function contracts by group

### Ticketing and checkout/payments — **required for a ticketing remix**
`create-cosmico-checkout` (primary checkout session; called by URL, not `invoke`),
`create-payment-plan-checkout`, `create-payment-update-session`,
`create-upgrade-checkout`, `create-self-serve-kids-checkout`,
`create-raffle-checkout`, `validate-promo-code`, `verify-payment`,
`verify-pending-payments`, `process-scheduled-payments`,
`process-upgrade-payment`, `cancel-payment-plan`, `refund-ticket`,
`refund-lodging`, `sync-pending-checkouts`, `process-webhook-retries`,
`log-checkout-error`, `upsert-checkout-abandonment`, `get-client-ip`.

> A Stripe-style webhook receiver is implied by `webhook_logs` /
> `process-webhook-retries`, even though the frontend never calls it directly.

### Ticket lifecycle and delivery — Core-adjacent
`assign-ticket`, `update-ticket-holder`, `issue-comp-ticket`, `transfer-ticket`,
`confirm-transfer`, `undo-transfer`, `send-transfer-otp`, `verify-transfer-otp`,
`send-ticket-email`, `send-tickets-delivery`, `generate-apple-wallet-pass`,
`generate-test-tickets`, `notify-waitlist`, `send-waitlist-upgrade-offer`.

### Box office — Optional
Check-in is RPC-driven; no dedicated edge function beyond ticket lookup.

### Lodging — Optional
`create-self-service-lodging`, `create-lodging-from-invite`,
`validate-lodging-invite`, `validate-lodging-offer`, `send-lodging-invites`,
`send-direct-lodging-invite`, `send-lodging-followup`, `cleanup-abandoned-lodging`.

### Email and notifications — Optional
`send-individual-email`, `send-bulk-announcement`, `send-contact-email`,
`send-admin-notification`, `send-admin-invitation`, `grant-first-admin`,
`grant-invitation-admin`, `send-artist-email`, `send-production-email`,
`send-production-email-individual`, `confirm-email-import`, `draft-email-ai`,
`send-payment-reminder`, `send-event-reminders`, `send-daily-sales-report`,
`send-weekly-community-digest`, `send-volunteer-confirmation`,
`send-assignment-notification`, `send-session-rsvp-confirmation`,
`send-crew-confirmation`, `accept-crew-bid`, `send-raffle-confirmation`,
`send-winecamp-info`, `send-test-email`, `send-test-drip-email`,
`send-abandoned-ticket-email`, `send-high-intent-promo-email`,
`send-giveaway-promo`, `send-sms`, `send-promo-sms-batch`,
`sms-webhook-register`, `submit-attendee-feedback`, `send-chat-escalation`.

### Offers and contracts — Optional
`create-custom-offer`, `get-custom-offer`, `accept-custom-offer`,
`resend-custom-offer`, `send-offer-expiry-reminders`, `send-offer-urgency-nudge`,
`parse-artist-offer`, `send-contract`, `send-upgrade-invitation`.

### Optional integrations
- CRM/email lists: `sync-flodesk`, `register-flodesk-webhook`,
  `cross-reference-flodesk`, `sync-convertkit`, `sync-simpletexting`,
  `cross-reference-simpletexting`.
- Analytics/ads: `meta-capi`.
- AI: `support-chat`, `score-leads-ai`, `generate-captions`,
  `generate-post-drafts`, `draft-email-ai`.
- Social publishing: `publish-to-cue`, `fetch-instagram-captions`.
- Media: `sync-dropbox-photos`, `sync-dropbox-background`, `refresh-dropbox-links`,
  `list-dropbox-folders`, `photo-gallery`, `manage-photo-cron`,
  `export-marketing-images`, `extract-artist-assets`, `get-lineup`.
- Ops: `checkout-canary`, `health-check-checkout`, `test-ticketing-flow`,
  `update-cron-schedule`, `cancel-sync-job`, `log-client-error`, `do-thing`.

---

## 5. Minimal remix vs optional

**Minimal festival site (mode `site`)** — no backend strictly required beyond the
public env variables; content is driven by `src/events/<slug>/config.ts`. Optional
reads: `event_details`, `artists`.

**Minimal site + ticketing (mode `integrated`)** requires:
- Tables: `event_details`, `profiles`, `user_roles`, `ticket_types`,
  `ticket_inventory`, `registrations`, `tickets`, `promo_codes`, `refunds`,
  `webhook_logs`.
- RPCs: `has_role`, `get_active_popup_promo_code`, `mint_my_tickets_session*`.
- Functions: a checkout-session creator, a payment webhook receiver,
  `verify-payment`, `validate-promo-code`, `send-ticket-email`.
- Secrets: backend platform + Stripe + one email provider.

**Everything else is optional**: lodging, add-ons, transfers, wallet passes,
volunteers, artists/contracts, pipelines/CRM, social publishing, media sync, AI.
Admin and box-office modules are operator tooling, not visitor-facing.

---

## 6. Auth and RLS assumptions

The frontend assumes, without verifying:

1. Email/password plus OTP sign-in, password reset, and session persistence
   (`signUp`, `signInWithPassword`, `signInWithOtp`, `resetPasswordForEmail`,
   `onAuthStateChange`).
2. Roles live in a dedicated `user_roles` table and are checked through the
   security-definer `has_role` function — never from a profile column.
3. Route guards (`AdminGuard`, `BoxOfficeGuard` in `src/routes/RouteWrappers.tsx`)
   are **UX only**. Real authorization must be enforced by RLS and by server-side
   checks inside each edge function.
4. Unauthenticated public paths exist for checkout, contract signing, ticket
   access, lodging invites, and the box-office PIN gate; these rely on
   server-validated tokens (`validate_*_token`, `box_office_validate_pin`).
5. Every table in the public schema needs explicit `GRANT`s in addition to RLS.

### Security questions to answer in the schema/backend gate

- Which tables expose PII (`registrations`, `profiles`, `lead_tracking`,
  `checkout_abandonment`, `contact_submissions`) and what exact RLS restricts them?
- Are token-validating RPCs rate-limited and constant-time on comparison?
- Do payment functions verify webhook signatures and treat client-supplied
  prices/quantities as untrusted?
- Is the box-office PIN brute-force protected and scoped to an operator role?
- Do admin-only edge functions re-check `has_role` server-side rather than
  trusting the caller?
- Are storage buckets private with signed URLs, and who may upload?
- Are inventory decrements atomic/transactional to prevent oversell?
- Is the service-role key confined to server code only?

---

## 7. Suggested build order for a fresh backend

1. Create your own backend project; fill `.env` from `.env.example`.
2. Auth: enable providers, add `profiles`, `user_roles`, the `app_role` enum, and
   `has_role`, with grants and RLS.
3. Event core: `event_details` (single active record) and its read policy.
4. Ticket catalogue: `ticket_types`, `ticket_tiers`, `ticket_inventory`.
5. Orders: `registrations` and `tickets`, with strict owner-scoped RLS.
6. Payments: checkout-session function, webhook receiver + `webhook_logs`,
   `verify-payment`, `refunds`.
7. Promotions: `promo_codes` + `validate-promo-code` + `get_active_popup_promo_code`.
8. Delivery: email provider secret + `send-ticket-email`.
9. Admin surface: audit tables, `log_admin_action`, admin invitations.
10. Box office: `check_in_events` and the `box_office_*` RPCs.
11. Only then layer optional modules (lodging, add-ons, CRM, social, AI, media).

Validate each step against the app before moving on. Treat this list as a starting
outline, not a guarantee of parity with any existing deployment.
