/**
 * React binding for the event contract.
 *
 * The config itself is resolved synchronously by `getEventConfig()`; this
 * provider exists so components can read it through context (and so tests and
 * future multi-tenant hosts can inject a different one) rather than importing
 * the loader directly.
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { EventConfig } from "./eventConfig";
import { getEventConfig } from "./loadEventConfig";
import { applyDefaultDocumentMeta } from "./siteIdentity";

const EventConfigContext = createContext<EventConfig | null>(null);

interface EventConfigProviderProps {
  children: ReactNode;
  /** Override the resolved config. Used by tests and Storybook-style harnesses. */
  config?: EventConfig;
}

export function EventConfigProvider({ children, config }: EventConfigProviderProps) {
  const value = useMemo(() => config ?? getEventConfig(), [config]);

  // Document-level defaults come from the event contract, not hardcoded copy.
  useEffect(() => {
    applyDefaultDocumentMeta(value.identity);
  }, [value.identity]);

  return <EventConfigContext.Provider value={value}>{children}</EventConfigContext.Provider>;
}

/**
 * Read the active event configuration.
 *
 * Falls back to the module-level config when no provider is mounted, so a
 * component rendered in isolation (a test, a printable page) still works.
 */
export function useEventConfig(): EventConfig {
  const fromContext = useContext(EventConfigContext);
  return fromContext ?? getEventConfig();
}

/** Convenience selectors for the two sections consumed in this slice. */
export function useEventIdentity() {
  return useEventConfig().identity;
}

export function useEventSchedule() {
  return useEventConfig().schedule;
}
