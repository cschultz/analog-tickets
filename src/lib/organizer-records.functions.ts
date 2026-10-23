import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "./require-supabase-auth.server";
import type { OrganizerRecordsResult } from "./organizer-records-core";
import type { OrganizerEventChoices } from "./organizer-records.server";

export const getOrganizerEventChoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrganizerEventChoices> => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { readOrganizerEvents } = await import("./organizer-records.server");
    return readOrganizerEvents({
      userClient: context.supabase,
      userId: context.userId,
      env: {
        PAYMENTS_TEST_MODE: process.env["PAYMENTS_TEST_MODE"],
        PAYMENT_PROVIDER: process.env["PAYMENT_PROVIDER"],
      },
    });
  });

export const getOrganizerRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => data)
  .handler(async ({ data, context }): Promise<OrganizerRecordsResult> => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { readOrganizerRecords } = await import("./organizer-records.server");
    return readOrganizerRecords({
      userClient: context.supabase,
      userId: context.userId,
      input: data,
      env: {
        PAYMENTS_TEST_MODE: process.env["PAYMENTS_TEST_MODE"],
        PAYMENT_PROVIDER: process.env["PAYMENT_PROVIDER"],
      },
    });
  });
