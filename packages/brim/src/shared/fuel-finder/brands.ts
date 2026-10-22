const ALIASES: Array<{ test: RegExp; name: string }> = [
  { test: /\bSHELL\b/, name: "Shell" },
  { test: /\bESSO\b|\bEXXON\b/, name: "Esso" },
  { test: /\bTEXACO\b|\bVALERO\b/, name: "Texaco" },
  { test: /\bAPPLEGREEN\b/, name: "Applegreen" },
  { test: /\bSAINSBURY/, name: "Sainsbury's" },
  { test: /\bMORRISON/, name: "Morrisons" },
  { test: /\bWAITROSE\b|\bJOHN LEWIS\b/, name: "Waitrose" },
  { test: /\bTESCO\b/, name: "Tesco" },
  { test: /\bASDA\b/, name: "Asda" },
  { test: /\bCOSTCO\b/, name: "Costco" },
  { test: /\bCO[- ]?OP\b|\bCOOPERATIVE\b|\bCO OPERATIVE\b/, name: "Co-op" },
  { test: /\bGULF\b/, name: "Gulf" },
  { test: /\bMURCO\b/, name: "Murco" },
  { test: /\bJET\b|\bPHILLIPS 66\b/, name: "Jet" },
  { test: /\bTOTAL/, name: "Total" },
  { test: /\bMFG\b|\bMOTOR FUEL\b/, name: "MFG" },
  { test: /\bHARVEST ENERGY\b/, name: "Harvest Energy" },
  { test: /\bCERTAS\b/, name: "Certas" },
  { test: /\bMAXOL\b/, name: "Maxol" },
  { test: /\bSPAR\b/, name: "Spar" },
  { test: /\bBP\b/, name: "BP" },
  { test: /\bINDEPENDENT\b|\bUNBRANDED\b|\bNO BRAND\b/, name: "Independent" },
];

export function canonicalBrand(raw: string | undefined | null): string {
  const trimmed = raw?.trim();
  if (!trimmed) return "Independent";
  const haystack = trimmed.toUpperCase().replace(/[.]/g, " ");
  for (const row of ALIASES) {
    if (row.test.test(haystack)) return row.name;
  }
  return titleCaseBrand(trimmed);
}

function titleCaseBrand(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b([a-z])/g, (ch) => ch.toUpperCase())
    .replace(/\bLtd\b/g, "Ltd")
    .replace(/\bUk\b/g, "UK");
}
