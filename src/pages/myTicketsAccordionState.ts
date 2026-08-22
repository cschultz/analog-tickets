export interface SavedAccordionPreference {
  eligibilitySignature?: string;
  expanded?: boolean;
}

export interface ResolveAccordionStateInput {
  addonIds: string[];
  cartCount: number;
  loading: boolean;
  lodgingIds: string[];
  savedPreference: SavedAccordionPreference | null;
}

export interface ResolveAccordionStateResult {
  eligibilitySignature: string;
  expanded: boolean;
  hasEligibleOptions: boolean;
  shouldPersist: boolean;
  showEligibilityAutoExpandNote: boolean;
}

export function createEligibilitySignature(lodgingIds: string[], addonIds: string[]) {
  return JSON.stringify({
    lodging: [...lodgingIds].sort(),
    addons: [...addonIds].sort(),
  });
}

export function resolveAccordionState({
  addonIds,
  cartCount,
  loading,
  lodgingIds,
  savedPreference,
}: ResolveAccordionStateInput): ResolveAccordionStateResult | null {
  if (loading) return null;

  const eligibilitySignature = createEligibilitySignature(lodgingIds, addonIds);
  const hasEligibleOptions = lodgingIds.length > 0 || addonIds.length > 0;

  if (cartCount > 0) {
    return {
      eligibilitySignature,
      expanded: true,
      hasEligibleOptions,
      shouldPersist: true,
      showEligibilityAutoExpandNote: false,
    };
  }

  if (
    savedPreference &&
    savedPreference.eligibilitySignature === eligibilitySignature &&
    typeof savedPreference.expanded === "boolean"
  ) {
    return {
      eligibilitySignature,
      expanded: savedPreference.expanded,
      hasEligibleOptions,
      shouldPersist: false,
      showEligibilityAutoExpandNote: false,
    };
  }

  return {
    eligibilitySignature,
    expanded: false,
    hasEligibleOptions,
    shouldPersist: true,
    showEligibilityAutoExpandNote: false,
  };
}