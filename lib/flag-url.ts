/* =====================================================================
 * flag-url.ts — maps 3-letter team codes to flagcdn.com image URLs
 * Usage: flagUrl("BRA") → "https://flagcdn.com/24x18/br.png"
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
  SLV: "sv", BLR: "by", FIN: "fi", ISL: "is",
  ALB: "al", MNE: "me", MKD: "mk", BUL: "bg",
  MLI: "ml", CIV_: "ci", GNB: "gw", GAB: "ga",
  COD: "cd", ZAM: "zm", MOZ: "mz", ANG: "ao",
  LBY: "ly", TAN: "tz", ETH: "et", UGA: "ug",
  KEN: "ke", GNE: "gq", BEN: "bj", BUR: "bf",
  TOG: "tg", MDG: "mg", GUI: "gn", CAP: "cv",
  COM: "km", SWZ: "sz", NMI: "mp", THA: "th",
  VIE: "vn", MYA: "mm", IDN: "id", PHI: "ph",
  IND: "in", PAK: "pk", BAN: "bd", SRI: "lk",
  CHN: "cn", TAJ: "tj", UZB: "uz", KAZ: "kz",
  KGZ: "kg", TKM: "tm", AZE: "az", ARM: "am",
  GEO: "ge", ISR: "il", LBN: "lb", JOR: "jo",
  IRQ: "iq", YEM: "ye", OMA: "om", UAE: "ae",
  KUW: "kw", BAH: "bh", SYR: "sy", PAL: "ps",
  CYP: "cy", MLT: "mt", LUX: "lu", MON: "mc",
  AND: "ad", SMR: "sm", VAT: "va", LIE: "li",
  FIJ: "fj", PNG: "pg", SOL: "sb", VAN: "vu",
  WSA: "ws", TON: "to", MSR: "ms",
};

export function flagUrl(teamCode: string): string {
  const iso2 = CODE_TO_ISO2[teamCode];
  if (!iso2) return "";
  return \`https://flagcdn.com/24x18/\${iso2}.png\`;
}

export function flagImg(teamCode: string, teamName?: string): string {
  const url = flagUrl(teamCode);
  if (!url) return "";
  return url;
}
