import { describe, expect, it } from "vitest";
import { clampPage, pageWindow } from "./pagination";

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(0, 4)).toEqual([0, 1, 2, 3]);
  });

  it("collapses distant pages into gaps", () => {
    expect(pageWindow(9, 20)).toEqual([0, "…", 7, 8, 9, 10, 11, "…", 19]);
    expect(pageWindow(0, 20)).toEqual([0, 1, 2, "…", 19]);
    expect(pageWindow(19, 20)).toEqual([0, "…", 17, 18, 19]);
  });

  it("handles a single page", () => {
    expect(pageWindow(0, 1)).toEqual([0]);
    expect(pageWindow(0, 0)).toEqual([0]);
  });
});

describe("clampPage", () => {
  it("keeps the page inside the available rows", () => {
    expect(clampPage(5, 30, 25)).toBe(1);
    expect(clampPage(-1, 30, 25)).toBe(0);
    expect(clampPage(3, 0, 25)).toBe(0);
  });
});
