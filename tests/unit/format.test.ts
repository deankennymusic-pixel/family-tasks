import { describe, expect, it } from "vitest";
import { displayName, firstName, initials, relativeTime } from "@/lib/format";

describe("format", () => {
  it("names people", () => {
    expect(displayName({ display_name: "Dean Kenny", email: "d@x.com" })).toBe("Dean Kenny");
    expect(displayName({ display_name: null, email: "lu@x.com" })).toBe("lu");
    expect(displayName(null)).toBe("Someone");
    expect(firstName({ display_name: "Dean Kenny", email: "d@x.com" })).toBe("Dean");
    expect(initials("Dean Kenny")).toBe("DK");
    expect(initials("lu")).toBe("L");
  });

  it("describes times relative to now", () => {
    const now = Date.parse("2026-10-17T12:00:00Z");
    expect(relativeTime("2026-10-17T11:59:50Z", now)).toBe("just now");
    expect(relativeTime("2026-10-17T11:30:00Z", now)).toBe("30 min ago");
    expect(relativeTime("2026-10-17T09:00:00Z", now)).toBe("3 hr ago");
    expect(relativeTime("2026-10-16T12:00:00Z", now)).toBe("yesterday");
  });
});
