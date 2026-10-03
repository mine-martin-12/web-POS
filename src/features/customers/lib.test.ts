import { describe, expect, it } from "vitest";
import { pickerMode } from "./lib";

describe("pickerMode", () => {
  it.each([
    ["", "recent", ""],
    ["   ", "recent", ""],
    ["0712 345 678", "phone", "+254712345678"],
    ["0712", "keep-typing", "0712"],
    ["w", "keep-typing", "w"],
    ["wa", "name", "wa"],
    ["Wanjiku K", "name", "Wanjiku K"],
    ["Ömer", "name", "Ömer"],
    ["--", "keep-typing", "--"],
  ])("%j → %s", (query, mode, term) => {
    expect(pickerMode(query)).toEqual({ mode, term });
  });
});
