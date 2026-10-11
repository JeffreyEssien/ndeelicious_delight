import { expect, it } from "vitest";
import { formatPreparationTime } from "./pricing";
it("formats short and mixed preparation durations in owner/customer language", () => {
  expect(formatPreparationTime(1 / 60)).toBe("1 minute");
  expect(formatPreparationTime(45 / 60)).toBe("45 minutes");
  expect(formatPreparationTime(1)).toBe("1 hour");
  expect(formatPreparationTime(1.5)).toBe("1 hour 30 min");
});
