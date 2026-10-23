/** Recovery credentials never enter source/logs/URLs sent to the server. */
export const RECOVERY_SECRET_RE = /^[0-9a-f]{64}$/;
export function newRecoverySecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function recoveryDigest(secret: string): Promise<string> {
  if (!RECOVERY_SECRET_RE.test(secret)) throw new Error("invalid proof");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, "0")).join("");
}
