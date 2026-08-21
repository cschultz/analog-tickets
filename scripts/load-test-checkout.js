/**
 * k6 load test for the two hot checkout paths.
 *
 * Run on STAGING only. Do NOT point this at production.
 *
 *   k6 run -e BASE_URL=https://<supabase-project-ref>.supabase.co \
 *          -e ANON_KEY=<staging-anon-key> \
 *          -e REGISTRATION_ID=<existing-paid-reg> \
 *          -e EMAIL=<owner-email> \
 *          scripts/load-test-checkout.js
 *
 * Targets ~50 concurrent users for 60s. Validates that the Stripe customer
 * lookup inside both functions does not serialize under load.
 */
import http from "k6/http";
import { check, group, sleep } from "k6";

export const options = {
  scenarios: {
    create_checkout: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 25 },
        { duration: "60s", target: 50 },
        { duration: "10s", target: 0 },
      ],
      exec: "createCheckout",
      gracefulRampDown: "10s",
    },
    create_addon_checkout: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 10 },
        { duration: "60s", target: 25 },
        { duration: "10s", target: 0 },
      ],
      exec: "createAddonCheckout",
      gracefulRampDown: "10s",
      startTime: "5s",
    },
  },
  thresholds: {
    "http_req_duration{scenario:create_checkout}": ["p(95)<2500"],
    "http_req_duration{scenario:create_addon_checkout}": ["p(95)<2500"],
    "http_req_failed": ["rate<0.02"],
  },
};

const BASE_URL = __ENV.BASE_URL;
const ANON_KEY = __ENV.ANON_KEY;
const REGISTRATION_ID = __ENV.REGISTRATION_ID;
const EMAIL = __ENV.EMAIL;

if (!BASE_URL || !ANON_KEY) {
  throw new Error("BASE_URL and ANON_KEY env vars are required");
}

const headers = {
  "Content-Type": "application/json",
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
};

export function createCheckout() {
  group("create-checkout", () => {
    const body = JSON.stringify({
      // Minimal valid shape — adjust to match your function's contract.
      // Goal here is to measure cold/warm latency and concurrency, not to
      // create real Stripe sessions. Use a Stripe test key on staging.
      tickets: [{ ticketType: "tier_1_ga_friday", quantity: 1 }],
      email: `loadtest+${__VU}-${__ITER}@example.com`,
      name: "Load Test",
      addons: [],
      promoCode: null,
    });
    const res = http.post(`${BASE_URL}/functions/v1/create-checkout`, body, { headers });
    check(res, {
      "status is 2xx or 4xx (not 5xx)": (r) => r.status < 500,
      "responded under 5s": (r) => r.timings.duration < 5000,
    });
  });
  sleep(1);
}

export function createAddonCheckout() {
  if (!REGISTRATION_ID || !EMAIL) {
    return; // skip if not configured
  }
  group("create-addon-checkout", () => {
    const body = JSON.stringify({
      registrationId: REGISTRATION_ID,
      customerEmail: EMAIL,
      items: [], // empty cart -> 400, but exercises the auth + lookup path
    });
    const res = http.post(`${BASE_URL}/functions/v1/create-addon-checkout`, body, { headers });
    check(res, {
      "status is 2xx or 4xx (not 5xx)": (r) => r.status < 500,
      "responded under 5s": (r) => r.timings.duration < 5000,
    });
  });
  sleep(1);
}
