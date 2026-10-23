/** Contact is delivery data, never authentication or order-ownership authority. */
export interface GuestCheckoutContact {
  name: string;
  email: string;
}

export function parseGuestCheckoutContact(input: unknown): GuestCheckoutContact | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).length !== 2 ||
    Object.keys(value).some((key) => !["name", "email"].includes(key))
  )
    return null;
  if (typeof value["name"] !== "string" || typeof value["email"] !== "string") return null;
  if (
    Array.from(value["name"] + value["email"]).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return null;
  const name = value["name"].trim();
  const email = value["email"].trim();
  // Deliberately modest form validation, not proof of mailbox ownership.
  // Preserve email spelling; verified delivery/claim owns canonical matching.
  if (
    !name ||
    name.length > 120 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)
  )
    return null;
  return { name, email };
}
