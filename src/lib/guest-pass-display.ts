import type { createOwnerPassController } from "./owner-pass-client";
/** One customer action may create a first pass, but never silently replace one. */
export async function showGuestPass(
  controller: ReturnType<typeof createOwnerPassController>,
  ticketId: string,
) {
  controller.select(ticketId);
  await controller.inspect();
  const state = controller.getSnapshot();
  if (state.ticketId === ticketId && state.phase === "ready" && state.canIssue && !state.replacing)
    await controller.issue(true);
}
