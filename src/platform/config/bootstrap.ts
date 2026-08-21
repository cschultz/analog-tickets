/**
 * Startup decision: can the app mount, or must the remixer configure a backend
 * first? Kept tiny and side-effect free so `main.tsx` can call it before it
 * imports anything that constructs a backend client.
 */
import { hasRequiredPublicEnv, type RawEnv } from "./env";

/** True when required public backend configuration is missing or malformed. */
export function shouldRenderSetupScreen(source?: RawEnv): boolean {
  return !hasRequiredPublicEnv(source);
}
