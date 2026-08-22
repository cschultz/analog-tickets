import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

Deno.test({
  name: "lodging-inventory - accommodation zones should exist and have valid inventory",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { data: zones, error } = await supabase
      .from("accommodation_zones")
      .select("zone_key, zone_name, inventory_total, inventory_available, night_price, is_publicly_available");

    assertEquals(error, null, "Should not have error fetching zones");
    assertExists(zones, "Zones should exist");
    assertEquals(zones.length > 0, true, "Should have at least one accommodation zone");

    // Verify each zone has valid inventory configuration
    for (const zone of zones) {
      assertEquals(
        zone.inventory_available >= 0,
        true,
        `Zone ${zone.zone_key} should have non-negative available inventory`
      );
      assertEquals(
        zone.inventory_available <= zone.inventory_total,
        true,
        `Zone ${zone.zone_key} available (${zone.inventory_available}) should not exceed total (${zone.inventory_total})`
      );
      assertEquals(
        zone.night_price > 0,
        true,
        `Zone ${zone.zone_key} should have positive price`
      );
    }
  },
});

Deno.test({
  name: "lodging-inventory - zone inventory_available matches NON-family-style available units",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Get all zones
    const { data: zones, error: zonesError } = await supabase
      .from("accommodation_zones")
      .select("zone_key, inventory_total, inventory_available");

    assertEquals(zonesError, null, "Should fetch zones without error");
    assertExists(zones, "Zones should exist");

    // For each zone, verify available count matches NON-family-style units only
    // Family-style units are sold individually and not part of zone inventory
    for (const zone of zones) {
      const { count: availableUnits, error: availError } = await supabase
        .from("accommodation_units")
        .select("id", { count: "exact", head: true })
        .eq("zone_key", zone.zone_key)
        .eq("inventory_status", "available")
        .eq("is_family_style", false);

      assertEquals(availError, null, `Should count available units for ${zone.zone_key}`);
      assertEquals(
        availableUnits,
        zone.inventory_available,
        `Zone ${zone.zone_key}: available non-family units (${availableUnits}) should match inventory_available (${zone.inventory_available})`
      );
    }
  },
});

Deno.test({
  name: "lodging-inventory - zone inventory_total matches total NON-family-style units",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { data: zones, error: zonesError } = await supabase
      .from("accommodation_zones")
      .select("zone_key, inventory_total");

    assertEquals(zonesError, null, "Should fetch zones without error");
    assertExists(zones, "Zones should exist");

    for (const zone of zones) {
      // Count only non-family-style units (family-style sold separately)
      const { count: totalUnits, error: totalError } = await supabase
        .from("accommodation_units")
        .select("id", { count: "exact", head: true })
        .eq("zone_key", zone.zone_key)
        .eq("is_family_style", false);

      assertEquals(totalError, null, `Should count units for ${zone.zone_key}`);
      assertEquals(
        totalUnits,
        zone.inventory_total,
        `Zone ${zone.zone_key}: non-family unit count (${totalUnits}) should match inventory_total (${zone.inventory_total})`
      );
    }
  },
});

Deno.test({
  name: "lodging-inventory - paid bookings with assigned units have valid unit references",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Get all paid lodging bookings with assigned units
    const { data: bookings, error: bookingsError } = await supabase
      .from("lodging_bookings")
      .select("id, zone_key, quantity, payment_status, assignment_status, assigned_unit_id")
      .eq("payment_status", "paid")
      .not("assigned_unit_id", "is", null);

    assertEquals(bookingsError, null, "Should fetch bookings without error");

    if (!bookings || bookings.length === 0) {
      console.log("No paid lodging bookings with assigned units to verify");
      return;
    }

    // Verify each assigned unit exists and is properly marked
    for (const booking of bookings) {
      const { data: unit, error: unitError } = await supabase
        .from("accommodation_units")
        .select("id, unit_name, inventory_status, zone_key")
        .eq("id", booking.assigned_unit_id)
        .maybeSingle();

      assertEquals(unitError, null, `Should fetch unit for booking ${booking.id}`);
      assertExists(unit, `Unit ${booking.assigned_unit_id} should exist for booking ${booking.id}`);
      
      // Unit should be in reserved or assigned status
      assertEquals(
        ["reserved", "assigned"].includes(unit.inventory_status),
        true,
        `Unit ${unit.unit_name} should be reserved/assigned, got: ${unit.inventory_status}`
      );
      
      // Unit should be in same zone as booking
      assertEquals(
        unit.zone_key,
        booking.zone_key,
        `Unit zone (${unit.zone_key}) should match booking zone (${booking.zone_key})`
      );
    }
  },
});

Deno.test({
  name: "lodging-inventory - no double-booked units",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Get all units that are reserved or assigned
    const { data: bookedUnits, error: unitsError } = await supabase
      .from("accommodation_units")
      .select("id, unit_name, inventory_status, zone_key")
      .in("inventory_status", ["reserved", "assigned"]);

    assertEquals(unitsError, null, "Should fetch booked units");

    if (!bookedUnits || bookedUnits.length === 0) {
      console.log("No reserved/assigned units to check for double-booking");
      return;
    }

    // Check each unit is linked to at most one non-refunded booking
    for (const unit of bookedUnits) {
      const { data: linkedBookings, error: bookingError } = await supabase
        .from("lodging_bookings")
        .select("id, payment_status")
        .eq("assigned_unit_id", unit.id)
        .neq("payment_status", "refunded");

      assertEquals(bookingError, null, `Should check bookings for unit ${unit.id}`);
      assertEquals(
        linkedBookings && linkedBookings.length <= 1,
        true,
        `Unit ${unit.unit_name} should have at most 1 active booking, found: ${linkedBookings?.length}`
      );
    }
  },
});

Deno.test({
  name: "lodging-inventory - lodging settings configured",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { data: settings, error } = await supabase
      .from("lodging_settings")
      .select("lodging_invite_enabled")
      .limit(1)
      .maybeSingle();

    assertEquals(error, null, "Should fetch lodging settings");
    assertExists(settings, "Lodging settings should exist");
    assertEquals(
      typeof settings.lodging_invite_enabled === "boolean",
      true,
      "lodging_invite_enabled should be a boolean"
    );
  },
});

Deno.test({
  name: "lodging-inventory - public zones have valid pricing",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { data: publicZones, error } = await supabase
      .from("accommodation_zones")
      .select("zone_key, zone_name, stripe_price_id, night_price, is_publicly_available")
      .eq("is_publicly_available", true);

    assertEquals(error, null, "Should fetch public zones");

    if (!publicZones || publicZones.length === 0) {
      console.log("No publicly available zones configured");
      return;
    }

    for (const zone of publicZones) {
      const hasValidPricing = zone.stripe_price_id || zone.night_price > 0;
      assertEquals(
        hasValidPricing,
        true,
        `Public zone ${zone.zone_key} must have stripe_price_id or positive night_price`
      );
    }
  },
});

Deno.test({
  name: "lodging-inventory - reserved/assigned units match paid booking count",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    // Count paid bookings with unit assignments
    const { count: paidBookingsWithUnits, error: bookingError } = await supabase
      .from("lodging_bookings")
      .select("id", { count: "exact", head: true })
      .eq("payment_status", "paid")
      .not("assigned_unit_id", "is", null);

    assertEquals(bookingError, null, "Should count paid bookings");

    // Count reserved/assigned units
    const { count: bookedUnits, error: unitError } = await supabase
      .from("accommodation_units")
      .select("id", { count: "exact", head: true })
      .in("inventory_status", ["reserved", "assigned"]);

    assertEquals(unitError, null, "Should count booked units");
    assertEquals(
      bookedUnits,
      paidBookingsWithUnits,
      `Reserved/assigned units (${bookedUnits}) should match paid bookings with assignments (${paidBookingsWithUnits})`
    );
  },
});
