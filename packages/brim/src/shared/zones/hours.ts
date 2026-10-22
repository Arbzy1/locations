import type { ChargeHoursJson, IsoWeekday } from "./types.js";

export const UK_BANK_HOLIDAYS_2026_2027: string[] = [
  "2026-01-01",
  "2026-04-03",
  "2026-04-06",
  "2026-05-04",
  "2026-05-25",
  "2026-08-31",
  "2026-12-28",
  "2027-01-01",
];

export const HOURS_ALWAYS_EXCEPT_CHRISTMAS: ChargeHoursJson = {
  timezone: "Europe/London",
  always: true,
  exemptDates: ["12-25"],
};

export const HOURS_LONDON_CC: ChargeHoursJson = {
  timezone: "Europe/London",
  windows: [
    { days: [1, 2, 3, 4, 5], start: "07:00", end: "18:00" },
    { days: [6, 7], start: "12:00", end: "18:00" },
  ],
  exemptDates: ["12-25"],
  weekendLikeDates: UK_BANK_HOLIDAYS_2026_2027,
};

export const HOURS_DART: ChargeHoursJson = {
  timezone: "Europe/London",
  windows: [{ days: [1, 2, 3, 4, 5, 6, 7], start: "06:00", end: "22:00" }],
};

export const HOURS_BRISTOL_CAZ: ChargeHoursJson = {
  timezone: "Europe/London",
  windows: [{ days: [1, 2, 3, 4, 5], start: "07:00", end: "15:00" }],
  exemptDates: ["12-25", ...UK_BANK_HOLIDAYS_2026_2027],
  exemptRanges: [{ start: "12-24", end: "01-01" }],
};

export const WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];
