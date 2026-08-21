import { describe, it, expect, afterEach } from "vitest";
import {
  dayOrder,
  dayLabel,
  dayShortLabel,
  dayBadge,
  festivalTimezone,
  normalizeDayKey,
  normalizeValidDays,
  getEventDayKey,
} from "@/lib/festivalDays";
import { parseEventConfig } from "@/platform/config/eventConfig";
import { __setEventConfigForTests, loadEventConfig } from "@/platform/config/loadEventConfig";
import { analogCommonsConfig } from "@/events/analog-commons/config";

/**
 * These tests prove the day helpers are driven by the event contract, not by a
 * hardcoded Fri/Sat/Sun Pacific assumption: a two-day event in a different
 * timezone must produce different keys, labels, ordering, and date mapping.
 */
const twoDayTokyo = parseEventConfig({
  ...analogCommonsConfig,
  identity: { ...analogCommonsConfig.identity, slug: "two-day-tokyo" },
  schedule: {
    timezone: "Asia/Tokyo",
    days: [
      { key: "opening", label: "Opening Night", shortLabel: "Op", date: "2027-03-05" },
      { key: "closing", label: "Closing Day", shortLabel: "Cl", date: "2027-03-06" },
    ],
    dayAliases: { day1: "opening", night: "opening", day2: "closing" },
  },
});

afterEach(() => {
  __setEventConfigForTests(null);
});

describe("festivalDays with the demo three-day event", () => {
  it("derives order, labels and timezone from config", () => {
    const config = loadEventConfig("analog-commons");
    __setEventConfigForTests(config);

    expect(dayOrder()).toEqual(config.schedule.days.map((d) => d.key));
    expect(dayOrder().length).toBe(3);
    expect(festivalTimezone()).toBe(config.schedule.timezone);
    expect(dayLabel(dayOrder()[0])).toBe(config.schedule.days[0].label);
  });
});

describe("festivalDays with a two-day Tokyo event", () => {
  it("uses the configured day count, keys and labels", () => {
    __setEventConfigForTests(twoDayTokyo);

    expect(dayOrder()).toEqual(["opening", "closing"]);
    expect(dayLabel("opening")).toBe("Opening Night");
    expect(dayShortLabel("closing")).toBe("Cl");
    expect(festivalTimezone()).toBe("Asia/Tokyo");
  });

  it("resolves aliases and labels to canonical keys", () => {
    __setEventConfigForTests(twoDayTokyo);

    expect(normalizeDayKey("day1")).toBe("opening");
    expect(normalizeDayKey("NIGHT")).toBe("opening");
    expect(normalizeDayKey("Closing Day")).toBe("closing");
    expect(normalizeDayKey("opening")).toBe("opening");
  });

  it("returns null for unknown or empty day tokens instead of throwing", () => {
    __setEventConfigForTests(twoDayTokyo);

    expect(normalizeDayKey("friday")).toBeNull();
    expect(normalizeDayKey("")).toBeNull();
    expect(normalizeDayKey(null)).toBeNull();
    expect(normalizeDayKey(undefined)).toBeNull();
  });

  it("drops unknown days and sorts survivors into config order", () => {
    __setEventConfigForTests(twoDayTokyo);

    expect(normalizeValidDays(["closing", "sunday", "day1", "closing"])).toEqual([
      "opening",
      "closing",
    ]);
    expect(normalizeValidDays([])).toEqual([]);
    expect(normalizeValidDays(null)).toEqual([]);
  });

  it("humanizes labels for day keys outside the schedule", () => {
    __setEventConfigForTests(twoDayTokyo);

    expect(dayLabel("load_in")).toBe("Load In");
    expect(dayShortLabel("load_in")).toBe("Lo");
  });

  it("maps an instant to a day using the event timezone, not local time", () => {
    __setEventConfigForTests(twoDayTokyo);

    // 2027-03-05 16:00Z is still 2027-03-06 01:00 in Tokyo -> closing day.
    expect(getEventDayKey("2027-03-05T16:00:00Z")).toBe("closing");
    // 2027-03-05 01:00Z is 2027-03-05 10:00 in Tokyo -> opening day.
    expect(getEventDayKey("2027-03-05T01:00:00Z")).toBe("opening");
    // Outside the scheduled dates and not a matching weekday name.
    expect(getEventDayKey("2027-04-01T01:00:00Z")).toBeNull();
    expect(getEventDayKey("not-a-date")).toBeNull();
  });

  it("renders a badge in canonical order", () => {
    __setEventConfigForTests(twoDayTokyo);

    expect(dayBadge(["closing", "day1"])).toBe("Op·Cl");
    expect(dayBadge([])).toBe("—");
  });
});
