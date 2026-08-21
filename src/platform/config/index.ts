export {
  eventConfigSchema,
  parseEventConfig,
  safeParseEventConfig,
  defineEventConfig,
  type EventConfig,
  type EventConfigInput,
  type EventIdentity,
  type EventSchedule,
  type EventDay,
  type EventModules,
  type EventIntegrations,
  type DayKey,
} from "./eventConfig";

export {
  loadEventConfig,
  getEventConfig,
  EVENT_REGISTRY,
  DEFAULT_EVENT_SLUG,
  __setEventConfigForTests,
} from "./loadEventConfig";

export {
  EventConfigProvider,
  useEventConfig,
  useEventIdentity,
  useEventSchedule,
} from "./EventConfigProvider";

export {
  getSiteIdentity,
  buildCanonicalUrl,
  buildPageTitle,
  getSupportEmail,
  applyDefaultDocumentMeta,
} from "./siteIdentity";

export {
  publicEnvSchema,
  getPublicEnv,
  requirePublicEnv,
  hasRequiredPublicEnv,
  assertPublicEnv,
  getSupabaseUrl,
  getSupabaseAnonKey,
  getSupabaseOrigin,
  getFunctionUrl,
  getPublicStorageUrl,
  getPlatformModeSetting,
  getProductionHosts,
  type PublicEnv,
  type LenientPublicEnv,
} from "./env";
