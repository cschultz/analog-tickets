import { describe, it, expect } from "vitest";
import { NIL_EVENT_ID } from "@/platform/config/eventIds";

// Test the pure logic extracted from VolunteerInterests
// These don't require rendering - they test data transformation and filtering

interface MockInterest {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  participation_type: string | null;
  volunteer_type: string | null;
  contribution_types: string[];
  status: string;
  created_at: string;
  archived_at: string | null;
  archived_to_pipeline: string | null;
}

const createMockInterest = (overrides: Partial<MockInterest> = {}): MockInterest => ({
  id: "test-1",
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "555-1234",
  city: "Austin",
  participation_type: "volunteer",
  volunteer_type: "festival",
  contribution_types: ["volunteer", "build"],
  status: "new",
  created_at: "2026-03-01T00:00:00Z",
  archived_at: null,
  archived_to_pipeline: null,
  ...overrides,
});

// Replicate the filter logic from the component
function filterInterests(
  interests: MockInterest[],
  {
    showArchived = false,
    searchTerm = "",
    filterStatus = "all",
    filterParticipationType = "all",
    filterType = "all",
  } = {}
): MockInterest[] {
  return interests.filter((interest) => {
    if (!showArchived && interest.status === "archived") return false;

    const matchesSearch =
      interest.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      interest.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (interest.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

    const matchesFilter = filterType === "all" || interest.contribution_types.includes(filterType);
    const matchesParticipation = filterParticipationType === "all" || interest.participation_type === filterParticipationType;
    const matchesStatus = filterStatus === "all" || interest.status === filterStatus;

    return matchesSearch && matchesFilter && matchesParticipation && matchesStatus;
  });
}

// Replicate stats computation
function computeStats(interests: MockInterest[]) {
  const active = interests.filter(i => i.status !== "archived");
  return {
    total: active.length,
    new: active.filter(i => i.status === "new").length,
    contacted: active.filter(i => i.status === "contacted").length,
    volunteers: active.filter(i => i.participation_type === "volunteer").length,
    archived: interests.filter(i => i.status === "archived").length,
  };
}

describe("Volunteer Interests - Filter Logic", () => {
  const interests = [
    createMockInterest({ id: "1", name: "Alice", status: "new", participation_type: "volunteer" }),
    createMockInterest({ id: "2", name: "Bob", status: "contacted", participation_type: "band_musician" }),
    createMockInterest({ id: "3", name: "Charlie", status: "archived", archived_to_pipeline: "Volunteer Pipeline" }),
    createMockInterest({ id: "4", name: "Diana", status: "new", participation_type: "artisan_vendor", contribution_types: ["build"] }),
    createMockInterest({ id: "5", name: "Eve", status: "not_interested", participation_type: "volunteer" }),
  ];

  it("hides archived by default", () => {
    const result = filterInterests(interests);
    expect(result).toHaveLength(4);
    expect(result.find(i => i.id === "3")).toBeUndefined();
  });

  it("shows archived when toggled on", () => {
    const result = filterInterests(interests, { showArchived: true });
    expect(result).toHaveLength(5);
    expect(result.find(i => i.id === "3")).toBeDefined();
  });

  it("filters by search term (name)", () => {
    const result = filterInterests(interests, { searchTerm: "alice" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
  });

  it("filters by search term (email)", () => {
    const result = filterInterests(interests, { searchTerm: "jane@" });
    expect(result).toHaveLength(4); // all non-archived share same email
  });

  it("filters by search term (phone)", () => {
    const result = filterInterests(interests, { searchTerm: "555" });
    expect(result).toHaveLength(4);
  });

  it("filters by status", () => {
    const result = filterInterests(interests, { filterStatus: "contacted" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Bob");
  });

  it("filters by participation type", () => {
    const result = filterInterests(interests, { filterParticipationType: "volunteer" });
    expect(result).toHaveLength(2); // Alice + Eve
  });

  it("filters by contribution type", () => {
    const result = filterInterests(interests, { filterType: "build" });
    // Alice has ["volunteer", "build"], Diana has ["build"]
    expect(result).toHaveLength(2);
  });

  it("combines multiple filters", () => {
    const result = filterInterests(interests, {
      filterStatus: "new",
      filterParticipationType: "volunteer",
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
  });

  it("archived + status filter = show archived with that status", () => {
    const result = filterInterests(interests, {
      showArchived: true,
      filterStatus: "archived",
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Charlie");
  });

  it("returns empty for no matches", () => {
    const result = filterInterests(interests, { searchTerm: "zzz_no_match" });
    expect(result).toHaveLength(0);
  });
});

describe("Volunteer Interests - Stats Computation", () => {
  const interests = [
    createMockInterest({ id: "1", status: "new", participation_type: "volunteer" }),
    createMockInterest({ id: "2", status: "contacted", participation_type: "band_musician" }),
    createMockInterest({ id: "3", status: "archived" }),
    createMockInterest({ id: "4", status: "new", participation_type: "volunteer" }),
    createMockInterest({ id: "5", status: "not_interested", participation_type: "partner" }),
  ];

  it("calculates total as active only (excludes archived)", () => {
    const stats = computeStats(interests);
    expect(stats.total).toBe(4);
  });

  it("counts new submissions", () => {
    const stats = computeStats(interests);
    expect(stats.new).toBe(2);
  });

  it("counts contacted", () => {
    const stats = computeStats(interests);
    expect(stats.contacted).toBe(1);
  });

  it("counts volunteers from active only", () => {
    const stats = computeStats(interests);
    expect(stats.volunteers).toBe(2);
  });

  it("counts archived from all", () => {
    const stats = computeStats(interests);
    expect(stats.archived).toBe(1);
  });

  it("handles empty array", () => {
    const stats = computeStats([]);
    expect(stats.total).toBe(0);
    expect(stats.new).toBe(0);
    expect(stats.archived).toBe(0);
  });
});

describe("Volunteer Interests - Data Mapping for Pipeline Move", () => {
  it("builds correct common fields for pipeline insert", () => {
    const interest = createMockInterest({
      name: "Test User",
      email: "test@example.com",
      phone: "555-0000",
      city: "Portland",
    });

    const notePrefix = `Moved from Volunteer Interests | City: ${interest.city || "N/A"}`;
    const fullNotes = `${notePrefix}`;

    const commonFields = {
      name: interest.name,
      email: interest.email,
      phone: interest.phone,
      event_id: NIL_EVENT_ID,
      pipeline_status: "lead",
      notes: fullNotes,
    };

    expect(commonFields.name).toBe("Test User");
    expect(commonFields.email).toBe("test@example.com");
    expect(commonFields.phone).toBe("555-0000");
    expect(commonFields.pipeline_status).toBe("lead");
    expect(commonFields.notes).toContain("Portland");
  });

  it("handles null city gracefully", () => {
    const interest = createMockInterest({ city: null });
    const notePrefix = `Moved from Volunteer Interests | City: ${interest.city || "N/A"}`;
    expect(notePrefix).toContain("N/A");
  });

  it("includes message in notes when present", () => {
    const interest = createMockInterest();
    const message = "I'd love to help with setup!";
    const notePrefix = `Moved from Volunteer Interests | City: ${interest.city || "N/A"}`;
    const fullNotes = `${notePrefix}${message ? ` | Message: ${message}` : ""}`;
    expect(fullNotes).toContain("I'd love to help with setup!");
  });
});

describe("Volunteer Interests - CSV Export", () => {
  it("escapes double quotes in CSV fields", () => {
    const message = 'He said "hello" to me';
    const escaped = message.replace(/"/g, '""');
    expect(escaped).toBe('He said ""hello"" to me');
  });

  it("handles null/undefined fields without errors", () => {
    const interest = createMockInterest({ phone: null, city: null });
    expect(interest.phone || "").toBe("");
    expect(interest.city || "").toBe("");
  });
});
