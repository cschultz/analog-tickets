/** Server-side pilot door surface decision; the supplied read stays caller-scoped. */
import { hasOneDoorEvent } from "@/lib/box-office-core";

interface MembershipResult {
  data: unknown;
  error: unknown;
}

export async function pilotBoxOfficeSurfaceState(
  enabled: boolean,
  readMemberships: () => PromiseLike<MembershipResult>,
): Promise<{ enabled: boolean; authorized: boolean }> {
  if (!enabled) return { enabled: false, authorized: false };
  try {
    const { data, error } = await readMemberships();
    return { enabled: true, authorized: !error && hasOneDoorEvent(data) };
  } catch {
    return { enabled: true, authorized: false };
  }
}
