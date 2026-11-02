import { isUuid } from "./checkout-core";
import { object } from "./admin-workspace-core";
import { organizerTimestamp } from "./organizer-browse-core";
import { RECONCILIATION_VISIBLE_STATES } from "./reconciliation-visibility-core";

export type SetupSettingState = "configured" | "needs_setup" | "disabled";
export interface SetupConfiguration {
  eventId: string;
  mode: "TEST";
  checkout: Exclude<SetupSettingState, "disabled">;
  webhook: Exclude<SetupSettingState, "disabled">;
  email: SetupSettingState;
  recovery: SetupSettingState;
  promotions: SetupSettingState;
}
export type DeliverySummary =
  | { state: "available"; pending: number; sending: number; sent: number; uncertain: number }
  | { state: "setup_required" | "unavailable" };
export type SetupResult =
  | { ok: true; configuration: SetupConfiguration; delivery: DeliverySummary }
  | { ok: false; code: "invalid_request" | "unavailable" | "test_mode_required" };
const exact = (row: Record<string, unknown>, keys: string[]) =>
  Object.keys(row).sort().join() === keys.sort().join();
export function parseSetupInput(raw: unknown): { eventId: string } | null {
  const row = object(raw);
  return row && exact(row, ["eventId"]) && isUuid(row["eventId"])
    ? { eventId: row["eventId"].toLowerCase() }
    : null;
}
/** Explicit projection: never accept a settings object containing values/extra fields. */
export function parseSetupResult(raw: unknown, eventId: string): SetupResult | null {
  const row = object(raw);
  if (!row) return null;
  if (
    row["ok"] === false &&
    exact(row, ["ok", "code"]) &&
    ["invalid_request", "unavailable", "test_mode_required"].includes(String(row["code"]))
  )
    return { ok: false, code: row["code"] as Extract<SetupResult, { ok: false }>["code"] };
  const config = object(row["configuration"]),
    delivery = object(row["delivery"]);
  if (
    row["ok"] !== true ||
    !exact(row, ["ok", "configuration", "delivery"]) ||
    !config ||
    !delivery ||
    !exact(config, ["eventId", "mode", "checkout", "webhook", "email", "recovery", "promotions"]) ||
    config["eventId"] !== eventId ||
    !isUuid(config["eventId"]) ||
    config["mode"] !== "TEST" ||
    ["checkout", "webhook", "email", "recovery", "promotions"].some(
      (key) => !["configured", "needs_setup", "disabled"].includes(String(config[key])),
    ) ||
    config["checkout"] === "disabled" ||
    config["webhook"] === "disabled"
  )
    return null;
  let summary: DeliverySummary;
  if (delivery["state"] === "available") {
    if (
      !exact(delivery, ["state", "pending", "sending", "sent", "uncertain"]) ||
      ["pending", "sending", "sent", "uncertain"].some(
        (key) => !Number.isSafeInteger(delivery[key]) || Number(delivery[key]) < 0,
      ) ||
      ["pending", "sending", "sent", "uncertain"].reduce(
        (sum, key) => sum + Number(delivery[key]),
        0,
      ) > 1000
    )
      return null;
    summary = {
      state: "available",
      pending: Number(delivery["pending"]),
      sending: Number(delivery["sending"]),
      sent: Number(delivery["sent"]),
      uncertain: Number(delivery["uncertain"]),
    };
  } else if (
    exact(delivery, ["state"]) &&
    ["setup_required", "unavailable"].includes(String(delivery["state"]))
  )
    summary =
      delivery["state"] === "setup_required"
        ? { state: "setup_required" }
        : { state: "unavailable" };
  else return null;
  return {
    ok: true,
    configuration: {
      eventId,
      mode: "TEST",
      checkout: config["checkout"] as SetupConfiguration["checkout"],
      webhook: config["webhook"] as SetupConfiguration["webhook"],
      email: config["email"] as SetupSettingState,
      recovery: config["recovery"] as SetupSettingState,
      promotions: config["promotions"] as SetupSettingState,
    },
    delivery: summary,
  };
}

/** Count the existing event-scoped projection only when its read is complete and coherent. */
export function setupReconciliationCount(raw: unknown): number | null {
  const result = object(raw);
  if (
    result?.["ok"] !== true ||
    !exact(result, ["ok", "cases"]) ||
    !Array.isArray(result["cases"]) ||
    result["cases"].length > 1000
  )
    return null;
  const ids = new Set<string>();
  for (const value of result["cases"]) {
    const row = object(value);
    if (
      !row ||
      !exact(row, [
        "caseId",
        "state",
        "reason",
        "ticketCount",
        "ticketIds",
        "createdAt",
        "updatedAt",
      ]) ||
      !isUuid(row["caseId"]) ||
      ids.has(row["caseId"]) ||
      !(RECONCILIATION_VISIBLE_STATES as readonly unknown[]).includes(row["state"]) ||
      ![
        "refund_outcome_unconfirmed",
        "internal_completion_unconfirmed",
        "internal_reversal_unconfirmed",
        "unspecified",
      ].includes(String(row["reason"])) ||
      !Array.isArray(row["ticketIds"]) ||
      row["ticketIds"].length < 1 ||
      row["ticketIds"].length > 100 ||
      row["ticketIds"].some((id) => !isUuid(id)) ||
      new Set(row["ticketIds"]).size !== row["ticketIds"].length ||
      row["ticketCount"] !== row["ticketIds"].length ||
      !organizerTimestamp(row["createdAt"]) ||
      !organizerTimestamp(row["updatedAt"])
    )
      return null;
    ids.add(row["caseId"]);
  }
  return ids.size;
}
