/* =====================================================================
 * flag-url.ts — maps 3-letter team codes to flagcdn.com image URLs
 * ===================================================================*/

const CODE_TO_ISO2: Record<string, string> = {
  MEX: "mx", RSA: "za", KOR: "kr", CZE: "cz",
  CAN: "ca", BIH: "ba", QAT: "qa", SUI: "ch",
  BRA: "br", MAR: "ma", HAI: "ht", SCO: "gb-sct",
  USA: "us", PAR: "py", AUS: "au", TUR: "tr",
  GER: "de", CUW: "cw", CIV: "ci", ECU: "ec",
  POR: "pt", ARG: "ar", NGA: "ng", POL: "pl",
  FRA: "fr", COL: "co", URU: "uy", JPN: "jp",
  ENG: "gb-eng", NED: "nl", SEN: "sn", SLO: "si",
  ITA: "it", CRO: "hr", GRE: "gr", TUN: "tn",
  ESP: "es", CMR: "cm", PAN: "pa", VEN: "ve",
  BEL: "be", UKR: "ua", ALG: "dz", NZL: "nz",
  DEN: "dk", SWE: "se", NOR: "no", IRN: "ir",
  KSA: "sa", EGY: "eg", GHA: "gh", CRC: "cr",
  HON: "hn", JAM: "jm", TRI: "tt", CUB: "cu",
  WAL: "gb-wls", NIR: "gb-nir", IRL: "ie", SVK: "sk",
  AUT: "at", HUN: "hu", ROU: "ro", SRB: "rs",
  CHL: "cl", BOL: "bo", PER: "pe", GUA: "gt",
  SLV: "sv", FIN: "fi", ISL: "is", ALB: "al",
  MNE: "me", MKD: "mk", BUL: "bg", MLI: "ml",
  COD: "cd", ZAM: "zm", ANG: "ao", LBY: "ly",
  TAN: "tz", ETH: "et", UGA: "ug", KEN: "ke",
  BEN: "bj", TOG: "tg", GUI: "gn", CAP: "cv",
  THA: "th", VIE: "vn", IDN: "id", PHI: "ph",
  IND: "in", PAK: "pk", CHN: "cn", UZB: "uz",
  KAZ: "kz", AZE: "az", ARM: "am", GEO: "ge",
  ISR: "il", LBN: "lb", JOR: "jo", IRQ: "iq",
  OMA: "om", UAE: "ae", KUW: "kw", BAH: "bh",
  CYP: "cy", LUX: "lu", FIJ: "fj",
};

export function flagUrl(teamCode: string): string {
  const iso2 = CODE_TO_ISO2[teamCode];
  if (!iso2) return "";
  return "https://flagcdn.com/24x18/" + iso2 + ".png";
}
