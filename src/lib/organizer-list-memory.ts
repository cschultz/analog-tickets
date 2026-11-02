import { emptyOrganizerFilters, type OrganizerFilters } from "./organizer-browse-core";
import type { OrganizerResource, OrganizerSearchField } from "./organizer-records-core";

export interface OrganizerListContext {
  field: OrganizerSearchField;
  query: string;
  filters: OrganizerFilters;
  history: (string | null)[];
}
const fresh = (): OrganizerListContext => ({
  field: "auto",
  query: "",
  filters: { ...emptyOrganizerFilters },
  history: [null],
});
const copy = (value: OrganizerListContext): OrganizerListContext => ({
  ...value,
  filters: { ...value.filters },
  history: [...value.history],
});

/** Workspace-lifetime criteria only, never records, tokens, URLs or browser storage.
 * Restoring a cursor is not restoring access: every list is requested again.
 */
export class OrganizerListMemory {
  private entries = new Map<string, OrganizerListContext>();
  save(
    userId: string,
    eventId: string,
    resource: OrganizerResource,
    context: OrganizerListContext,
  ) {
    const key = JSON.stringify([userId, eventId, resource]);
    this.entries.delete(key);
    this.entries.set(key, copy(context));
    if (this.entries.size > 32) this.entries.delete(this.entries.keys().next().value!);
  }
  read(userId: string, eventId: string, resource: OrganizerResource): OrganizerListContext {
    const value = this.entries.get(JSON.stringify([userId, eventId, resource]));
    return value ? copy(value) : fresh();
  }
  clear() {
    this.entries.clear();
  }
}
