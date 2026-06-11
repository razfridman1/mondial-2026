/* =====================================================================
 * Team-name → internal 3-letter code mapper.
 *
 * football-data.org uses English forms that don't always match our
 * TEAMS[code].nameEn. This module centralizes the synonyms so the
 * cron sync (live scores) and the diff endpoint share one source of
 * truth.
 *
 * Add a new entry here whenever a mismatch shows up in /api/admin/diff-schedule.
 * ===================================================================*/
import { TEAMS } from "./data";

/* Direct overrides — API name (exact, case-insensitive) → our code. */
const API_NAME_SYNONYMS: Record<string, string> = {
  "czechia":               "CZE",
  "czech republic":        "CZE",
  "congo dr":              "COD",
  "dr congo":              "COD",
  "democratic republic of congo": "COD",
  "bosnia-herzegovina":    "BIH",
  "bosnia and herzegovina":"BIH",
  "bosnia":                "BIH",
  "korea republic":        "KOR",
  "south korea":           "KOR",
  "republic of ireland":   "IRL",
  "ivory coast":           "CIV",
  "côte d'ivoire":         "CIV",
  "cote d'ivoire":         "CIV",
  "cape verde":            "CPV",
  "cabo verde":            "CPV",
  "türkiye":               "TUR",
  "turkiye":               "TUR",
  "turkey":                "TUR",
  "iran":                  "IRN",
  "ir iran":               "IRN",
  "curaçao":               "CUW",
  "curacao":               "CUW",
  "saudi arabia":          "KSA",
  "usa":                   "USA",
  "united states":         "USA",
  "usmnt":                 "USA",
  "england":               "ENG",
  "scotland":              "SCO",
  "panama":                "PAN",
  "ghana":                 "GHA",
  "colombia":              "COL",
  "uzbekistan":            "UZB",
  "portugal":              "POR",
  "jordan":                "JOR",
  "algeria":               "ALG",
  "austria":               "AUT",
  "argentina":             "ARG",
  "norway":                "NOR",
  "iraq":                  "IRQ",
  "senegal":               "SEN",
  "france":                "FRA",
  "uruguay":               "URU",
  "spain":                 "ESP",
  "new zealand":           "NZL",
  "egypt":                 "EGY",
  "belgium":               "BEL",
  "tunisia":               "TUN",
  "sweden":                "SWE",
  "japan":                 "JPN",
  "netherlands":           "NED",
  "ecuador":               "ECU",
  "germany":               "GER",
  "australia":             "AUS",
  "paraguay":              "PAR",
  "haiti":                 "HAI",
  "morocco":               "MAR",
  "brazil":                "BRA",
  "switzerland":           "SUI",
  "qatar":                 "QAT",
  "canada":                "CAN",
  "south africa":          "RSA",
  "mexico":                "MEX",
  "croatia":               "CRO",
};

/* Reverse map for fast lookup (lowercased). Built once at module load. */
const NAME_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [name, code] of Object.entries(API_NAME_SYNONYMS)) {
    m.set(name.toLowerCase(), code);
  }
  /* Also index every TEAMS[code].nameEn and Hebrew name. */
  for (const code of Object.keys(TEAMS)) {
    const t = TEAMS[code];
    m.set(t.nameEn.toLowerCase(), code);
    if (t.name) m.set(t.name.toLowerCase(), code);
  }
  return m;
})();

/**
 * Convert any team name (from football-data.org, FIFA feed, or admin
 * UI) into our internal 3-letter code. Returns null if unknown.
 */
export function teamCodeFromApiName(name: string | undefined | null): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (NAME_INDEX.has(n)) return NAME_INDEX.get(n)!;

  /* Fuzzy: try substring match against everything in the index. */
  for (const [key, code] of NAME_INDEX) {
    if (key.length < 4) continue; // avoid false positives on short tokens
    if (n === key) return code;
    if (n.includes(key) || key.includes(n)) return code;
  }
  return null;
}
