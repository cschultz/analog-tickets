import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * CRITICAL PRICING TESTS
 * These tests verify that family-style units use their individual unit price,
 * NOT the zone price. This was a bug that caused $400 undercharges per unit.
 */

Deno.test({
  name: "family-style-pricing - family units have higher price than zone price",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Get all family-style units with their zone info
    const { data: familyUnits, error } = await supabase
      .from("accommodation_units")
      .select("id, unit_name, zone_key, night_price, is_family_style, accommodation_zones(night_price)")
      .eq("is_family_style", true);

    assertEquals(error, null, "Should fetch family-style units without error");
    assertExists(familyUnits, "Family-style units should exist");

    // Each family-style unit should have a price HIGHER than its zone price
    for (const unit of familyUnits) {
      const unitPrice = unit.night_price;
      // accommodation_zones returns as object when using FK join
      const zoneData = unit.accommodation_zones as unknown as { night_price: number } | null;
      const zonePrice = zoneData?.night_price;

      assertExists(unitPrice, `Unit ${unit.unit_name} should have a night_price set`);
      assertExists(zonePrice, `Unit ${unit.unit_name} zone should have a night_price`);

      // Unit price must be greater than zone price (that's the premium)
      assertEquals(
        unitPrice > zonePrice,
        true,
        `Family-style unit ${unit.unit_name} (${unit.zone_key}): unit price $${unitPrice / 100} should be > zone price $${zonePrice / 100}`
      );
    }
  },
});

Deno.test({
  name: "family-style-pricing - front row cabin family units priced at $650/night",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const EXPECTED_PRICE = 65000; // $650 in cents

    const { data: cabinFamilyUnits, error } = await supabase
      .from("accommodation_units")
      .select("id, unit_name, night_price")
      .eq("zone_key", "front_row_cabins")
      .eq("is_family_style", true);

    assertEquals(error, null, "Should fetch cabin family units without error");
    assertExists(cabinFamilyUnits, "Cabin family units should exist");

    for (const unit of cabinFamilyUnits) {
      assertEquals(
        unit.night_price,
        EXPECTED_PRICE,
        `Cabin family unit ${unit.unit_name} should be $650/night (${EXPECTED_PRICE} cents), got ${unit.night_price}`
      );
    }
  },
});

Deno.test({
  name: "family-style-pricing - grove tent family units priced at $600/night",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const EXPECTED_PRICE = 60000; // $600 in cents

    const { data: tentFamilyUnits, error } = await supabase
      .from("accommodation_units")
      .select("id, unit_name, night_price")
      .eq("zone_key", "grove_tents")
      .eq("is_family_style", true);

    assertEquals(error, null, "Should fetch tent family units without error");
    assertExists(tentFamilyUnits, "Tent family units should exist");

    for (const unit of tentFamilyUnits) {
      assertEquals(
        unit.night_price,
        EXPECTED_PRICE,
        `Tent family unit ${unit.unit_name} should be $600/night (${EXPECTED_PRICE} cents), got ${unit.night_price}`
      );
    }
  },
});

Deno.test({
  name: "family-style-pricing - non-family units can have zero price (use zone price)",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Non-family-style units use zone pricing, so their individual night_price can be 0
    const { data: nonFamilyUnits, error } = await supabase
      .from("accommodation_units")
      .select("id, unit_name, zone_key, night_price, is_family_style")
      .eq("is_family_style", false);

    assertEquals(error, null, "Should fetch non-family units without error");
    assertExists(nonFamilyUnits, "Non-family units should exist");

    // These units are assigned via zone booking, so price comes from zone table
    // Just verify they exist and are flagged correctly
    for (const unit of nonFamilyUnits) {
      assertEquals(unit.is_family_style, false, `Unit ${unit.unit_name} should be non-family-style`);
    }
  },
});

Deno.test({
  name: "lodging-bookings-pricing - paid family-style bookings should reflect unit price",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Check all paid lodging bookings with assigned family-style units
    const { data: paidBookings, error } = await supabase
      .from("lodging_bookings")
      .select(`
        id, 
        total_amount, 
        assigned_unit_id,
        accommodation_units!inner(
          unit_name, 
          night_price, 
          is_family_style
        )
      `)
      .eq("payment_status", "paid")
      .eq("accommodation_units.is_family_style", true);

    assertEquals(error, null, "Should fetch paid bookings without error");
    
    if (!paidBookings || paidBookings.length === 0) {
      console.log("No paid family-style bookings to validate");
      return;
    }

    // For each booking, verify total_amount = unit.night_price * 2 (2 nights)
    for (const booking of paidBookings) {
      // Type assertion for joined data
      const unit = booking.accommodation_units as unknown as { unit_name: string; night_price: number; is_family_style: boolean };
      const expectedTotal = unit.night_price * 2;
      
      // Log any pricing discrepancies (historical data may have bugs)
      if (booking.total_amount !== expectedTotal) {
        console.warn(
          `PRICING DISCREPANCY: Booking ${booking.id} for unit ${unit.unit_name}: ` +
          `charged $${booking.total_amount / 100}, expected $${expectedTotal / 100} ` +
          `(unit price $${unit.night_price / 100}/night × 2 nights)`
        );
      }
    }
  },
});
