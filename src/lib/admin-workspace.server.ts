import { isUuid } from "./checkout-core";
import { loadCallerMemberships } from "./refund-policy.server";
import { evaluateRefundPolicyAuthorization } from "./refund-policy-core";
import {
  parseWorkspaceInput,
  parseAdminWorkspace,
  object,
  type WorkspaceResult,
  type WorkspaceError,
} from "./admin-workspace-core";
interface RpcClient {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}
export async function manageAdminWorkspace(o: {
  input: unknown;
  userId: string;
  userClient: unknown;
  env: {
    PAYMENTS_TEST_MODE?: string | undefined;
    PAYMENT_PROVIDER?: string | undefined;
    ADMIN_CATALOG_TEST_MODE?: string | undefined;
  };
  loadAdmin: () => Promise<unknown>;
}): Promise<WorkspaceResult> {
  const input = parseWorkspaceInput(o.input),
    unavailable: WorkspaceResult = { ok: false, code: "unavailable" };
  if (!input) return { ok: false, code: "invalid_request" };
  if (
    o.env.PAYMENTS_TEST_MODE !== "true" ||
    o.env.PAYMENT_PROVIDER !== "stripe_test" ||
    !isUuid(o.userId)
  )
    return unavailable;
  if (input.action !== "read" && o.env.ADMIN_CATALOG_TEST_MODE !== "true")
    return { ok: false, code: "writes_disabled" };
  try {
    const memberships = await loadCallerMemberships(o.userClient, input.eventId);
    if (
      !evaluateRefundPolicyAuthorization({ memberships, eventId: input.eventId, userId: o.userId })
        .ok
    )
      return unavailable;
    const admin = (await o.loadAdmin()) as RpcClient;
    const name =
      input.action === "read"
        ? "read_admin_event_workspace"
        : input.action === "save_event"
          ? "save_admin_event_details"
          : "save_admin_ticket_tier";
    const args: Record<string, unknown> = { p_actor: o.userId, p_event: input.eventId };
    if (input.action !== "read") {
      args["p_revision"] = input.revision;
      args["p_values"] = input.values;
      if (input.action === "save_tier") args["p_id"] = input.id;
    }
    const result = await admin.rpc(name, args);
    if (result.error) {
      const err = object(result.error);
      return {
        ok: false,
        code:
          input.action === "read" && err?.["code"] === "PGRST202"
            ? "setup_required"
            : "unavailable",
      };
    }
    if (!Array.isArray(result.data) || result.data.length !== 1) return unavailable;
    const row = object(result.data[0]);
    if (input.action === "read" && row?.["outcome"] === "ready") {
      const workspace = parseAdminWorkspace(row["payload"], input.eventId);
      return workspace
        ? { ok: true, action: "read", workspace, canEdit: o.env.ADMIN_CATALOG_TEST_MODE === "true" }
        : unavailable;
    }
    if (input.action !== "read" && row?.["outcome"] === "saved")
      return { ok: true, action: "saved" };
    const allowed: WorkspaceError[] = [
      "invalid_request",
      "version_conflict",
      "capacity_below_committed",
      "immutable_slug",
      "slug_taken",
      "too_many_tiers",
    ];
    return typeof row?.["outcome"] === "string" &&
      allowed.includes(row["outcome"] as WorkspaceError)
      ? { ok: false, code: row["outcome"] as WorkspaceError }
      : unavailable;
  } catch {
    return unavailable;
  }
}
