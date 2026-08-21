# Analog Commons Ticketing System - Manual Test Checklist

Use this checklist before any major launch or after significant changes to the ticketing system.

## Pre-Launch Verification

### 1. Environment Setup ✓
- [ ] All secrets configured (STRIPE_SECRET_KEY, RESEND_API_KEY, STRIPE_WEBHOOK_SECRET)
- [ ] Active event exists in database with correct date/venue
- [ ] Ticket inventory configured with appropriate quantities
- [ ] Stripe products and prices exist and are active

### 2. Health Check
- [ ] Run health check from Admin → Reminders → System Health
- [ ] All checks should show "passed" (green) or acceptable "warning" (yellow)
- [ ] Address any "failed" (red) items before proceeding

---

## Ticket Purchase Flow

### 3. Ticket Selection Page (`/jan/tickets`)
- [ ] Page loads without errors
- [ ] All ticket types display correctly (Krewe, VIP, GA)
- [ ] Prices are accurate
- [ ] "Select" buttons work
- [ ] Quantity can be adjusted (if applicable)
- [ ] Sold-out tickets show appropriate messaging

### 4. Checkout Form
- [ ] Form appears when ticket is selected
- [ ] Name field validates (required)
- [ ] Email field validates (required, email format)
- [ ] Policy checkbox must be checked
- [ ] "Continue to Payment" button is disabled until form is valid
- [ ] Loading state shows during checkout creation

### 5. Stripe Checkout
- [ ] Redirects to Stripe checkout page
- [ ] Correct ticket type and price shown
- [ ] Customer email pre-filled
- [ ] Test with Stripe test card: `4242 4242 4242 4242`
- [ ] Cancel returns to tickets page

### 6. Payment Success
- [ ] Redirects to success page (`/jan/success`)
- [ ] Order confirmation displays correctly
- [ ] "Add to Calendar" buttons work
- [ ] No console errors

### 7. Database Verification (Admin)
- [ ] Registration created with `payment_status: paid`
- [ ] Tickets created for each quantity purchased
- [ ] Ticket inventory decremented correctly

### 8. Email Delivery
- [ ] Confirmation email sent immediately
- [ ] Email contains correct event details
- [ ] Email explains 7-day ticket delivery policy
- [ ] QR code NOT included in initial confirmation (by design)

---

## Patrons Package Flow

### 9. Patrons Selection (`/jan/tickets` - scroll down)
- [ ] Ultimate and Premier packages display correctly
- [ ] Prices are accurate ($10,000 / $5,000)
- [ ] Benefits listed for each tier
- [ ] "Reserve Now" buttons work

### 10. Patrons Checkout
- [ ] Name and email form appears
- [ ] Redirects to Stripe checkout
- [ ] Correct package price shown
- [ ] Test payment completes successfully
- [ ] Confirmation email sent

---

## Ticket Delivery (7-Day Policy)

### 11. Scheduled Delivery (Admin → Reminders → Ticket Delivery)
- [ ] Delivery status table shows all registrations
- [ ] "Pending" badges for undelivered tickets
- [ ] "Delivered" badges for sent tickets
- [ ] "Send Test Ticket Email" works
- [ ] "Trigger Ticket Delivery" sends to eligible registrations

### 12. Ticket Email Content
- [ ] QR code included and scannable
- [ ] Event details correct
- [ ] Check-in instructions clear

---

## Edge Cases

### 13. Error Handling
- [ ] Network error shows user-friendly message
- [ ] Invalid email shows validation error
- [ ] Double-submit prevention works (button disabled)
- [ ] Payment failure returns to tickets page with message

### 14. Inventory Management
- [ ] Cannot purchase more than available inventory
- [ ] Inventory updates immediately after purchase
- [ ] Waitlist appears when sold out (if enabled)

### 15. Mobile Experience
- [ ] Tickets page responsive on mobile
- [ ] Checkout flow works on mobile
- [ ] Emails render correctly on mobile

---

## Webhook Verification

### 16. Stripe Webhooks (Admin → Webhooks)
- [ ] Webhook logs show recent events
- [ ] `checkout.session.completed` events processed
- [ ] No errors in webhook processing
- [ ] Payment status updates correctly

---

## Automated Tests

### 17. Automated Protection Summary

#### A. E2E Tests (`e2e/ticketing.spec.ts`) - Runs on every deploy
| Test Suite | Coverage |
|------------|----------|
| Ticket Display | All ticket types render, prices show |
| Checkout Form | Form appears, validation works |
| Required Fields | Can't submit without name/email/checkbox |
| Stripe Redirect | Payment flow reaches checkout.stripe.com |
| Patrons Packages | Ultimate/Premier display correctly |
| Mobile Responsive | Works on iPhone SE viewport |
| Accessibility | Form inputs have proper labels |
| Error Handling | Network errors show user-friendly messages |
| Double-Submit | Button disables to prevent duplicates |
| Email Validation | Invalid emails rejected |
| HTTPS Security | Production uses secure connection |
| Pricing Display | Dollar amounts render correctly |
| Full Smoke Test | Complete flow reaches Stripe |

#### B. Integration Tests (`test-ticketing-flow` edge function)
1. Go to Admin → Reminders → System Health
2. Click "Run Full Test Suite"
3. Verify all suites pass:
   - [ ] Database Access (event_details, ticket_inventory, registrations, tickets, email_logs)
   - [ ] Stripe Integration (API connection, all price IDs valid, session create/expire)
   - [ ] Inventory Validation (no overselling, tickets available)
   - [ ] Registration Integrity (paid registrations have tickets)
   - [ ] Email Delivery (confirmation emails logged)

#### C. Health Checks (`health-check-checkout` edge function)
| Check | What It Validates |
|-------|-------------------|
| Environment Variables | STRIPE_SECRET_KEY, RESEND_API_KEY configured |
| Stripe API Connection | Can retrieve account balance |
| Database Connection | Can query event_details |
| Active Event | At least one is_active=true event |
| Ticket Inventory | Tickets available for sale |
| Stripe Ticket Prices | Krewe/VIP price IDs valid |
| Stripe Patrons Prices | Ultimate/Premier price IDs valid |
| Email Service | Resend API key format valid |
| Webhook Secret | STRIPE_WEBHOOK_SECRET configured |
| Stale Payments | No excessive pending registrations |
| Edge Functions | All checkout functions deployed |
| Session Creation | Can create Stripe checkout session |
| Idempotency | Duplicate payment protection active |
| Ticket Generation | Paid registrations have tickets |

#### D. CI/CD Protection (`.github/workflows/e2e-tests.yml`)
- ✅ Runs on every push to main/master
- ✅ Runs on every pull request  
- ✅ Blocks merge if E2E tests fail
- ✅ Sends email notification on failure
- ✅ Uploads Playwright report for debugging

---

## Post-Launch Monitoring

### 18. First Hour After Launch
- [ ] Monitor webhook logs for errors
- [ ] Check email delivery logs
- [ ] Verify first few purchases complete successfully
- [ ] Check inventory counts are accurate

### 19. Ongoing Monitoring
- [ ] Daily: Check for stale pending payments
- [ ] Daily: Verify inventory counts
- [ ] Weekly: Review email delivery success rate
- [ ] Pre-event: Verify ticket delivery emails sent

---

## Quick Reference: Test Credit Card Numbers

| Card Number | Result |
|------------|--------|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 0002` | Card declined |
| `4000 0000 0000 9995` | Insufficient funds |
| `4000 0000 0000 3220` | 3D Secure required |

Use any future expiry date, any 3-digit CVC, any ZIP code.

---

## Rollback Procedures

If critical issues are found:

1. **Disable ticket sales:** Set all ticket inventory to 0
2. **Pause webhooks:** Contact Stripe support or disable in Stripe Dashboard
3. **Communicate:** Send notification to any affected customers
4. **Investigate:** Check logs in Admin → Webhooks and Admin → Emails

---

*Last updated: December 2024*
