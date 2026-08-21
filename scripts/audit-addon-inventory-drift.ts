/**
 * Add-on inventory drift audit
 *
 * Compares `addon_inventory.sold_quantity` against the count of paid rows
 * in `addon_purchases` for each inventory_id. Reports any drift so the
 * auto-pilot self-healing job can be re-run or the row reconciled manually.
 *
 * Usage:
 *   bun scripts/audit-addon-inventory-drift.ts
 *
 * Requires: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or anon for
 * read-only mode). Service role is recommended so RLS doesn't hide rows.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or service role / anon key in env");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

type Inventory = {
  id: string;
  display_name: string;
  addon_type: string;
  total_quantity: number;
  sold_quantity: number;
  is_active: boolean;
};

type Purchase = {
  inventory_id: string;
  quantity: number;
  payment_status: string;
};

async function main() {
  const { data: inventory, error: invErr } = await supabase
    .from("addon_inventory")
    .select("id, display_name, addon_type, total_quantity, sold_quantity, is_active")
    .eq("is_active", true);
  if (invErr) throw invErr;

  const { data: purchases, error: purErr } = await supabase
    .from("addon_purchases")
    .select("inventory_id, quantity, payment_status")
    .in("payment_status", ["paid"]);
  if (purErr) throw purErr;

  const paidByInventory = new Map<string, number>();
  for (const p of (purchases || []) as Purchase[]) {
    if (!p.inventory_id) continue;
    paidByInventory.set(p.inventory_id, (paidByInventory.get(p.inventory_id) || 0) + (p.quantity || 0));
  }

  const drifted: Array<{
    id: string;
    name: string;
    type: string;
    sold: number;
    paid: number;
    drift: number;
    available: number;
  }> = [];

  for (const inv of (inventory || []) as Inventory[]) {
    const paid = paidByInventory.get(inv.id) || 0;
    const drift = inv.sold_quantity - paid;
    if (drift !== 0) {
      drifted.push({
        id: inv.id,
        name: inv.display_name,
        type: inv.addon_type,
        sold: inv.sold_quantity,
        paid,
        drift,
        available: inv.total_quantity - inv.sold_quantity,
      });
    }
  }

  console.log(`Checked ${inventory?.length ?? 0} active add-on inventory rows.`);
  if (drifted.length === 0) {
    console.log("✓ No drift detected — sold_quantity matches paid purchases for every row.");
    return;
  }

  console.log(`✗ Drift detected on ${drifted.length} row(s):`);
  console.table(drifted);
  console.log(
    "\nPositive drift = sold_quantity overcounts paid purchases (oversells protected).",
  );
  console.log(
    "Negative drift = sold_quantity undercounts paid purchases (RISK: oversell possible).",
  );
  process.exit(2);
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
