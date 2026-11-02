import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "./require-supabase-auth.server";
import type { WorkspaceResult } from "./admin-workspace-core";
export const adminWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => data)
  .handler(async ({ data, context }): Promise<WorkspaceResult> => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { manageAdminWorkspace } = await import("./admin-workspace.server");
    return manageAdminWorkspace({
      input: data,
      userId: context.userId,
      userClient: context.supabase,
      env: {
        PAYMENTS_TEST_MODE: process.env["PAYMENTS_TEST_MODE"],
        PAYMENT_PROVIDER: process.env["PAYMENT_PROVIDER"],
        ADMIN_CATALOG_TEST_MODE: process.env["ADMIN_CATALOG_TEST_MODE"],
      },
      loadAdmin: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return supabaseAdmin;
      },
    });
  });
