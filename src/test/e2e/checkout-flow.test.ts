/**
 * E2E Checkout Flow Tests
 * 
 * These tests verify the complete checkout flow works from UI to edge function.
 * Run with: npx vitest run src/test/e2e/checkout-flow.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

describe('Checkout Flow E2E', () => {
  beforeAll(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Missing Supabase environment variables');
    }
  });

  describe('create-cosmico-checkout edge function', () => {
    it('should reject requests with missing required fields', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('should reject invalid ticket types', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          ticketType: 'fake_ticket',
          quantity: 1,
          name: 'Test User',
          email: 'test@example.com',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject quantities over 4', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          ticketType: 'tier_1_vip_3day',
          quantity: 10,
          name: 'Test User',
          email: 'test@example.com',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject invalid email formats', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          ticketType: 'tier_1_vip_3day',
          quantity: 1,
          name: 'Test User',
          email: 'not-an-email',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should accept valid checkout requests and return Stripe URL', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          ticketType: 'tier_1_krewe_3day',
          quantity: 1,
          name: 'E2E Test User',
          email: 'e2e-test@example.com',
          donationAmount: 0,
          accommodationWaitlist: false,
        }),
      });

      // Should succeed and return a Stripe checkout URL
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.url).toBeDefined();
      expect(data.url).toContain('checkout.stripe.com');
      expect(data.sessionId).toBeDefined();
    });

    it('should handle donation amounts correctly', async () => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-cosmico-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          ticketType: 'tier_1_ga_2day',
          quantity: 2,
          name: 'Donation Test User',
          email: 'donation-test@example.com',
          donationAmount: 5000, // $50 in cents
          accommodationWaitlist: true,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.url).toContain('checkout.stripe.com');
    });
  });

  describe('Database integrity', () => {
    it('should have active event configured', async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/event_details?title=eq.Analog%20Reunion%202026&is_active=eq.true&select=id,title`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });

      expect(response.status).toBe(200);
      const events = await response.json();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].title).toBe('Analog Commons 2026');
    });

    it('should have ticket inventory for tier 1 tickets', async () => {
      // First get the event ID
      const eventResponse = await fetch(`${SUPABASE_URL}/rest/v1/event_details?title=eq.Analog%20Reunion%202026&is_active=eq.true&select=id`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      const events = await eventResponse.json();
      const eventId = events[0]?.id;
      expect(eventId).toBeDefined();

      // Check inventory exists for each tier 1 ticket type
      const ticketTypes = ['tier_1_krewe_3day', 'tier_1_vip_3day', 'tier_1_ga_2day'];
      
      for (const ticketType of ticketTypes) {
        const inventoryResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/ticket_inventory?ticket_type=eq.${ticketType}&event_id=eq.${eventId}&select=ticket_type,total_quantity,sold_quantity`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
          }
        );
        
        expect(inventoryResponse.status).toBe(200);
        const inventory = await inventoryResponse.json();
        expect(inventory.length).toBeGreaterThan(0);
      }
    });
  });
});
