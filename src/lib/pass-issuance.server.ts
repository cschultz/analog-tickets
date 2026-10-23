/** Draft adapter. Never call without validated owner identity and explicit consent. */
import { generatePassCode, hashPassCode, PASS_CODE_RE } from "./checkin-core";
import { isUuid } from "./transfer-otp-core";

export interface PassIssuanceClient {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}
export type PassIssuanceResult =
  | { outcome: "issued"; passCode: string; passId: string }
  | { outcome: "not_eligible" | "state_changed" | "unavailable" };

/** Return the raw code once, only after a valid atomic success. No retry, log or persistence. */
export async function issueOwnerPass(
  admin: PassIssuanceClient,
  input: {
    ticketId: string;
    verifiedOwnerId: string;
    expectedActivePassId: string | null;
    confirmed: boolean;
  },
  randomBytes?: (n: number) => Uint8Array,
): Promise<PassIssuanceResult> {
  if (
    !input.confirmed ||
    !isUuid(input.ticketId) ||
    !isUuid(input.verifiedOwnerId) ||
    (input.expectedActivePassId !== null && !isUuid(input.expectedActivePassId))
  )
    return { outcome: "not_eligible" };
  try {
    const code = generatePassCode(randomBytes);
    if (!PASS_CODE_RE.test(code)) return { outcome: "unavailable" };
    const digest = await hashPassCode(code);
    const { data, error } = await admin.rpc("replace_owner_ticket_pass", {
      p_ticket_id: input.ticketId,
      p_owner_user_id: input.verifiedOwnerId,
      p_expected_active_pass_id: input.expectedActivePassId,
      p_new_code_digest: digest,
    });
    if (
      error ||
      !Array.isArray(data) ||
      data.length !== 1 ||
      !data[0] ||
      typeof data[0] !== "object"
    )
      return { outcome: "unavailable" };
    const row = data[0] as Record<string, unknown>;
    if (row["outcome"] === "issued" && isUuid(row["pass_id"]))
      return { outcome: "issued", passCode: code, passId: row["pass_id"] };
    if (
      (row["outcome"] === "not_eligible" || row["outcome"] === "state_changed") &&
      row["pass_id"] === null
    )
      return { outcome: row["outcome"] };
    return { outcome: "unavailable" };
  } catch {
    // Commit may have happened. Do not retry or claim no state changed.
    return { outcome: "unavailable" };
  }
}
