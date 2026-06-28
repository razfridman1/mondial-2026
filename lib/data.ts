/* =====================================================================
 * Mondial 2026 — static reference data (teams, venues, channels, stages)
 * and generated match schedule (104 matches).
 * ===================================================================*/
import type { Team, Venue, Channel, Stage, Match, StageId } from "./types";

/* =====================================================================
 * 48 teams as drawn at the FIFA World Cup 2026 Final Draw
 * (Washington DC, 5 December 2025) + intercontinental & UEFA play-offs
 * resolved on 31 March 2026.
 * Source: FIFA official + Wikipedia "2026 FIFA World Cup".
 * ===================================================================*/
export const TEAMS: Record<string, Team> = {
  /* ----- Group A ----- */
  MEX: { code: "MEX", name: "מקסיקו",      nameEn: "Mexico",         flag: "🇲🇽", group: "A" },
  RSA: { code: "RSA", name: "דרום אפריקה", nameEn: "South Africa",   flag: "🇿🇦", group: "A" },
  KOR: { code: "KOR", name: "דרום קוריאה", nameEn: "South Korea",    flag: "🇰🇷", group: "A" },
  CZE: { code: "CZE", name: "צ׳כיה",       nameEn: "Czech Republic", flag: "🇨🇿", group: "A" },
  /* ----- Group B ----- */
  CAN: { code: "CAN", name: "קנדה",        nameEn: "Canada",         flag: "🇨🇦", group: "B" },
  BIH: { code: "BIH", name: "בוסניה",      nameEn: "Bosnia and Herzegovina", flag: "🇧🇦", group: "B" },
  QAT: { code: "QAT", name: "קטאר",        nameEn: "Qatar",          flag: "🇶🇦", group: "B" },
  SUI: { code: "SUI", name: "שווייץ",      nameEn: "Switzerland",    flag: "🇨🇭", group: "B" },
  /* ----- Group C ----- */
  BRA: { code: "BRA", name: "ברזיל",       nameEn: "Brazil",         flag: "🇧🇷", group: "C" },
  MAR: { code: "MAR", name: "מרוקו",       nameEn: "Morocco",        flag: "🇲🇦", group: "C" },
  HAI: { code: "HAI", name: "האיטי",       nameEn: "Haiti",          flag: "🇭🇹", group: "C" },
  SCO: { code: "SCO", name: "סקוטלנד",     nameEn: "Scotland",       flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", group: "C" },
  /* ----- Group D ----- */
  USA: { code: "USA", name: "ארה״ב",       nameEn: "USA",            flag: "🇺🇸", group: "D" },
  PAR: { code: "PAR", name: "פרגוואי",     nameEn: "Paraguay",       flag: "🇵🇾", group: "D" },
  AUS: { code: "AUS", name: "אוסטרליה",    nameEn: "Australia",      flag: "🇦🇺", group: "D" },
  TUR: { code: "TUR", name: "טורקיה",      nameEn: "Turkey",         flag: "🇹🇷", group: "D" },
  /* ----- Group E ----- */
  GER: { code: "GER", name: "גרמניה",      nameEn: "Germany",        flag: "🇩🇪", group: "E" },
  CUW: { code: "CUW", name: "קוראסאו",     nameEn: "Curaçao",        flag: "🇨🇼", group: "E" },
  CIV: { code: "CIV", name: "חוף השנהב",   nameEn: "Ivory Coast",    flag: "🇨🇮", group: "E" },
  ECU: { code: "ECU", name: "אקוודור",     nameEn: "Ecuador",        flag: "🇪🇨", group: "E" },
  /* ----- Group F ----- */
  NED: { code: "NED", name: "הולנד",       nameEn: "Netherlands",    flag: "🇳🇱", group: "F" },
  JPN: { code: "JPN", name: "יפן",         nameEn: "Japan",          flag: "🇯🇵", group: "F" },
  SWE: { code: "SWE", name: "שוודיה",      nameEn: "Sweden",         flag: "🇸🇪", group: "F" },
  TUN: { code: "TUN", name: "תוניסיה",     nameEn: "Tunisia",        flag: "🇹🇳", group: "F" },
  /* ----- Group G ----- */
  BEL: { code: "BEL", name: "בלגיה",       nameEn: "Belgium",        flag: "🇧🇪", group: "G" },
  EGY: { code: "EGY", name: "מצרים",       nameEn: "Egypt",          flag: "🇪🇬", group: "G" },
  IRN: { code: "IRN", name: "איראן",       nameEn: "Iran",           flag: "🇮🇷", group: "G" },
  NZL: { code: "NZL", name: "ניו זילנד",   nameEn: "New Zealand",    flag: "🇳🇿", group: "G" },
  /* ----- Group H ----- */
  ESP: { code: "ESP", name: "ספרד",        nameEn: "Spain",          flag: "🇪🇸", group: "H" },
  CPV: { code: "CPV", name: "כף ורדה",     nameEn: "Cape Verde",     flag: "🇨🇻", group: "H" },
  KSA: { code: "KSA", name: "ערב הסעודית", nameEn: "Saudi Arabia",   flag: "🇸🇦", group: "H" },
  URU: { code: "URU", name: "אורוגוואי",   nameEn: "Uruguay",        flag: "🇺🇾", group: "H" },
  /* ----- Group I ----- */
  FRA: { code: "FRA", name: "צרפת",        nameEn: "France",         flag: "🇫🇷", group: "I" },
  SEN: { code: "SEN", name: "סנגל",        nameEn: "Senegal",        flag: "🇸🇳", group: "I" },
  IRQ: { code: "IRQ", name: "עיראק",       nameEn: "Iraq",           flag: "🇮🇶", group: "I" },
  NOR: { code: "NOR", name: "נורווגיה",    nameEn: "Norway",         flag: "🇳🇴", group: "I" },
  /* ----- Group J ----- */
  ARG: { code: "ARG", name: "ארגנטינה",    nameEn: "Argentina",      flag: "🇦🇷", group: "J" },
  ALG: { code: "ALG", name: "אלג׳יריה",    nameEn: "Algeria",        flag: "🇩🇿", group: "J" },
  AUT: { code: "AUT", name: "אוסטריה",     nameEn: "Austria",        flag: "🇦🇹", group: "J" },
  JOR: { code: "JOR", name: "ירדן",        nameEn: "Jordan",         flag: "🇯🇴", group: "J" },
  /* ----- Group K ----- */
  POR: { code: "POR", name: "פורטוגל",     nameEn: "Portugal",       flag: "🇵🇹", group: "K" },
  COD: { code: "COD", name: "דר״ק (קונגו)", nameEn: "DR Congo",      flag: "🇨🇩", group: "K" },
  UZB: { code: "UZB", name: "אוזבקיסטן",   nameEn: "Uzbekistan",     flag: "🇺🇿", group: "K" },
  COL: { code: "COL", name: "קולומביה",    nameEn: "Colombia",       flag: "🇨🇴", group: "K" },
  /* ----- Group L ----- */
  ENG: { code: "ENG", name: "אנגליה",      nameEn: "England",        flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", group: "L" },
  CRO: { code: "CRO", name: "קרואטיה",     nameEn: "Croatia",        flag: "🇭🇷", group: "L" },
  GHA: { code: "GHA", name: "גאנה",        nameEn: "Ghana",          flag: "🇬🇭", group: "L" },
  PAN: { code: "PAN", name: "פנמה",        nameEn: "Panama",         flag: "🇵🇦", group: "L" },
};

export const VENUES: Record<string, Venue> = {
  AZT: { name: "אצטדיון אסטקה", city: "מקסיקו סיטי", country: "מקסיקו", flag: "🇲🇽", capacity: 87000 },
  GUA: { name: "אצטדיון אקרון", city: "גוודלחרה",   country: "מקסיקו", flag: "🇲🇽", capacity: 49850 },
  MTY: { name: "אצטדיון BBVA",  city: "מונטריי",   country: "מקסיקו", flag: "🇲🇽", capacity: 53500 },
  TOR: { name: "BMO Field",     city: "טורונטו",   country: "קנדה",   flag: "🇨🇦", capacity: 45500 },
  VAN: { name: "BC Place",      city: "ונקובר",    country: "קנדה",   flag: "🇨🇦", capacity: 54500 },
  NYC: { name: "MetLife Stadium",        city: "ניו יורק/ניו ג׳רזי", country: "ארה״ב", flag: "🇺🇸", capacity: 82500 },
  LAX: { name: "SoFi Stadium",           city: "לוס אנג׳לס",         country: "ארה״ב", flag: "🇺🇸", capacity: 70000 },
  DAL: { name: "AT&T Stadium",           city: "דאלאס",              country: "ארה״ב", flag: "🇺🇸", capacity: 80000 },
  ATL: { name: "Mercedes-Benz Stadium",  city: "אטלנטה",             country: "ארה״ב", flag: "🇺🇸", capacity: 71000 },
  MIA: { name: "Hard Rock Stadium",      city: "מיאמי",              country: "ארה״ב", flag: "🇺🇸", capacity: 65000 },
  HOU: { name: "NRG Stadium",            city: "יוסטון",             country: "ארה״ב", flag: "🇺🇸", capacity: 72000 },
  KAN: { name: "Arrowhead Stadium",      city: "קנזס סיטי",          country: "ארה״ב", flag: "🇺🇸", capacity: 76400 },
  PHI: { name: "Lincoln Financial Field",city: "פילדלפיה",           country: "ארה״ב", flag: "🇺🇸", capacity: 69000 },
  SFO: { name: "Levi’s Stadium",         city: "סן פרנסיסקו",        country: "ארה״ב", flag: "🇺🇸", capacity: 68500 },
  SEA: { name: "Lumen Field",            city: "סיאטל",              country: "ארה״ב", flag: "🇺🇸", capacity: 69000 },
  BOS: { name: "Gillette Stadium",       city: "בוסטון",             country: "ארה״ב", flag: "🇺🇸", capacity: 65900 },
  /* Marker for matches where venue is not yet exposed by football-data.org.
   * UI shows "אצטדיון יוכרז". Will be replaced by the real venue once the
   * API populates it (typically after the bracket is set). */
  TBD: { name: "אצטדיון יוכרז",         city: "—",                   country: "—",     flag: "❓", capacity: 0 },
};

export const CHANNELS: Record<string, Channel> = {
  KAN11:      { id:"KAN11",      name:"כאן 11",       type:"פתוח",          logo:"📺", color:"#0a4d8c", url:"https://www.kan.org.il/live/tv.aspx?stationId=2", digital:true },
  SPORT5:     { id:"SPORT5",     name:"ספורט 5",      type:"כבלים/לוויין",  logo:"⚽", color:"#e30613", url:"https://www.sport5.co.il/live", digital:true },
  SPORT1:     { id:"SPORT1",     name:"ספורט 1",      type:"כבלים/לוויין",  logo:"🏆", color:"#1e3a8a", url:"https://www.sport1.co.il/live", digital:true },
  SPORT2:     { id:"SPORT2",     name:"ספורט 2",      type:"כבלים/לוויין",  logo:"🥇", color:"#0891b2", url:"https://www.sport1.co.il/live", digital:true },
  SPORT5PLUS: { id:"SPORT5PLUS", name:"ספורט 5+",     type:"כבלים/לוויין",  logo:"✨", color:"#dc2626", url:"https://www.sport5.co.il/live", digital:true },
  SPORT5LIVE: { id:"SPORT5LIVE", name:"Sport 5 Live", type:"סטרימינג",      logo:"🌐", color:"#7c2d12", url:"https://www.sport5.co.il/live", digital:true },
  KANSPORT:   { id:"KANSPORT",   name:"כאן ספורט",    type:"סטרימינג",      logo:"🎥", color:"#0a4d8c", url:"https://www.kan.org.il/sport/", digital:true },
};

export const STAGES: Record<StageId, Stage> = {
  GROUP: { id: "GROUP", name: "שלב הבתים",            order: 1 },
  R32:   { id: "R32",   name: "שלב 32",              order: 2 },
  R16:   { id: "R16",   name: "שלב 16",              order: 3 },
  QF:    { id: "QF",    name: "רבע גמר",             order: 4 },
  SF:    { id: "SF",    name: "חצי גמר",             order: 5 },
  THIRD: { id: "THIRD", name: "משחק על המקום השלישי",  order: 6 },
  FINAL: { id: "FINAL", name: "הגמר",                 order: 7 },
};

/* ----- match generation ----- */
const HOST_TEAMS = new Set(["MEX", "USA", "CAN"]);

/* UK BST (UTC+1) → UTC. Used for group-stage fixtures sourced from FIFA's
 * officially published schedule (which is listed in UK time). */
function uk(dateStr: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const utcHour = h - 1;
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCHours(utcHour, m, 0, 0);
  return d.toISOString();
}

function pickChannels(matchIdx: number, stageId: StageId, isHostMatch: boolean): string[] {
  const isMarquee = stageId !== "GROUP" || isHostMatch || matchIdx % 4 === 0;
  if (stageId === "FINAL" || stageId === "SF" || stageId === "THIRD")
    return ["KAN11", "SPORT5", "SPORT5LIVE"];
  if (stageId === "QF") return ["KAN11", "SPORT5", "SPORT5LIVE"];
  if (stageId === "R16" || stageId === "R32")
    return matchIdx % 2 === 0 ? ["KAN11", "SPORT1"] : ["SPORT5", "SPORT5LIVE"];
  if (isMarquee) return ["KAN11", "SPORT5"];
  const rota = [["SPORT5"], ["SPORT1"], ["SPORT2"], ["SPORT5PLUS"], ["SPORT5LIVE"], ["KANSPORT"]];
  return rota[matchIdx % rota.length];
}

/* =====================================================================
 * GROUP-STAGE FIXTURES — the OFFICIAL FIFA 2026 match calendar
 * (published 6 December 2025, the day after the Final Draw).
 *
 * Sourced from the Sky Sports day-by-day breakdown of all 104 matches
 * (which mirrors fifa.com/scores-fixtures). Times are UK BST (UTC+1).
 * Venue is the city served by one of the 16 host stadia — mapped to the
 * VENUES table above. The app converts UTC → Asia/Jerusalem at render.
 * ===================================================================*/
interface GroupFixture {
  group: string;
  date: string;     // YYYY-MM-DD
  ukTime: string;   // HH:MM in UK BST
  home: string;
  away: string;
  venue: string;    // VENUES key
}

const GROUP_FIXTURES: GroupFixture[] = [
  /* ---------- Matchday 1 (June 11–17) ---------- */
  { group:"A", date:"2026-06-11", ukTime:"20:00", home:"MEX", away:"RSA", venue:"AZT" },
  { group:"A", date:"2026-06-12", ukTime:"03:00", home:"KOR", away:"CZE", venue:"GUA" },
  { group:"B", date:"2026-06-12", ukTime:"20:00", home:"CAN", away:"BIH", venue:"TOR" },
  { group:"D", date:"2026-06-13", ukTime:"02:00", home:"USA", away:"PAR", venue:"LAX" },
  { group:"B", date:"2026-06-13", ukTime:"20:00", home:"QAT", away:"SUI", venue:"SFO" },
  { group:"C", date:"2026-06-13", ukTime:"23:00", home:"BRA", away:"MAR", venue:"NYC" },
  { group:"C", date:"2026-06-14", ukTime:"02:00", home:"HAI", away:"SCO", venue:"BOS" },
  { group:"D", date:"2026-06-14", ukTime:"05:00", home:"AUS", away:"TUR", venue:"VAN" },
  { group:"E", date:"2026-06-14", ukTime:"18:00", home:"GER", away:"CUW", venue:"HOU" },
  { group:"F", date:"2026-06-14", ukTime:"21:00", home:"NED", away:"JPN", venue:"DAL" },
  { group:"E", date:"2026-06-15", ukTime:"00:00", home:"CIV", away:"ECU", venue:"PHI" },
  { group:"F", date:"2026-06-15", ukTime:"03:00", home:"SWE", away:"TUN", venue:"MTY" },
  { group:"H", date:"2026-06-15", ukTime:"17:00", home:"ESP", away:"CPV", venue:"ATL" },
  { group:"G", date:"2026-06-15", ukTime:"20:00", home:"BEL", away:"EGY", venue:"SEA" },
  { group:"H", date:"2026-06-15", ukTime:"23:00", home:"KSA", away:"URU", venue:"MIA" },
  { group:"G", date:"2026-06-16", ukTime:"02:00", home:"IRN", away:"NZL", venue:"LAX" },
  { group:"I", date:"2026-06-16", ukTime:"20:00", home:"FRA", away:"SEN", venue:"NYC" },
  { group:"I", date:"2026-06-16", ukTime:"23:00", home:"IRQ", away:"NOR", venue:"BOS" },
  { group:"J", date:"2026-06-17", ukTime:"02:00", home:"ARG", away:"ALG", venue:"KAN" },
  { group:"J", date:"2026-06-17", ukTime:"05:00", home:"AUT", away:"JOR", venue:"SFO" },
  { group:"K", date:"2026-06-17", ukTime:"18:00", home:"POR", away:"COD", venue:"HOU" },
  { group:"L", date:"2026-06-17", ukTime:"21:00", home:"ENG", away:"CRO", venue:"DAL" },
  { group:"L", date:"2026-06-18", ukTime:"00:00", home:"GHA", away:"PAN", venue:"TOR" },
  { group:"K", date:"2026-06-18", ukTime:"03:00", home:"UZB", away:"COL", venue:"AZT" },

  /* ---------- Matchday 2 (June 18–23) ---------- */
  { group:"A", date:"2026-06-18", ukTime:"17:00", home:"CZE", away:"RSA", venue:"ATL" },
  { group:"B", date:"2026-06-18", ukTime:"20:00", home:"SUI", away:"BIH", venue:"LAX" },
  { group:"B", date:"2026-06-18", ukTime:"23:00", home:"CAN", away:"QAT", venue:"VAN" },
  { group:"A", date:"2026-06-19", ukTime:"02:00", home:"MEX", away:"KOR", venue:"GUA" },
  { group:"D", date:"2026-06-19", ukTime:"20:00", home:"USA", away:"AUS", venue:"SEA" },
  { group:"C", date:"2026-06-19", ukTime:"23:00", home:"SCO", away:"MAR", venue:"BOS" },
  { group:"C", date:"2026-06-20", ukTime:"01:30", home:"BRA", away:"HAI", venue:"PHI" },
  { group:"D", date:"2026-06-20", ukTime:"04:00", home:"TUR", away:"PAR", venue:"SFO" },
  { group:"F", date:"2026-06-20", ukTime:"18:00", home:"NED", away:"SWE", venue:"HOU" },
  { group:"E", date:"2026-06-20", ukTime:"21:00", home:"GER", away:"CIV", venue:"TOR" },
  { group:"E", date:"2026-06-21", ukTime:"01:00", home:"ECU", away:"CUW", venue:"KAN" },
  { group:"F", date:"2026-06-21", ukTime:"05:00", home:"TUN", away:"JPN", venue:"MTY" },
  { group:"H", date:"2026-06-21", ukTime:"17:00", home:"ESP", away:"KSA", venue:"ATL" },
  { group:"G", date:"2026-06-21", ukTime:"20:00", home:"BEL", away:"IRN", venue:"LAX" },
  { group:"H", date:"2026-06-21", ukTime:"23:00", home:"URU", away:"CPV", venue:"MIA" },
  { group:"G", date:"2026-06-22", ukTime:"02:00", home:"NZL", away:"EGY", venue:"VAN" },
  { group:"J", date:"2026-06-22", ukTime:"18:00", home:"ARG", away:"AUT", venue:"DAL" },
  { group:"I", date:"2026-06-22", ukTime:"22:00", home:"FRA", away:"IRQ", venue:"PHI" },
  { group:"I", date:"2026-06-23", ukTime:"01:00", home:"NOR", away:"SEN", venue:"TOR" },
  { group:"J", date:"2026-06-23", ukTime:"04:00", home:"JOR", away:"ALG", venue:"SFO" },
  { group:"K", date:"2026-06-23", ukTime:"18:00", home:"POR", away:"UZB", venue:"HOU" },
  { group:"L", date:"2026-06-23", ukTime:"21:00", home:"ENG", away:"GHA", venue:"BOS" },
  { group:"L", date:"2026-06-24", ukTime:"00:00", home:"PAN", away:"CRO", venue:"BOS" },
  { group:"K", date:"2026-06-24", ukTime:"03:00", home:"COL", away:"COD", venue:"GUA" },

  /* ---------- Matchday 3 (June 24–28, simultaneous kick-offs) ---------- */
  { group:"B", date:"2026-06-24", ukTime:"20:00", home:"SUI", away:"CAN", venue:"VAN" },
  { group:"B", date:"2026-06-24", ukTime:"20:00", home:"BIH", away:"QAT", venue:"SEA" },
  { group:"C", date:"2026-06-24", ukTime:"23:00", home:"MAR", away:"HAI", venue:"ATL" },
  { group:"C", date:"2026-06-24", ukTime:"23:00", home:"SCO", away:"BRA", venue:"MIA" },
  { group:"A", date:"2026-06-25", ukTime:"02:00", home:"RSA", away:"KOR", venue:"MTY" },
  { group:"A", date:"2026-06-25", ukTime:"02:00", home:"CZE", away:"MEX", venue:"AZT" },
  { group:"E", date:"2026-06-25", ukTime:"21:00", home:"CUW", away:"CIV", venue:"PHI" },
  { group:"E", date:"2026-06-25", ukTime:"21:00", home:"ECU", away:"GER", venue:"NYC" },
  { group:"F", date:"2026-06-26", ukTime:"00:00", home:"TUN", away:"NED", venue:"KAN" },
  { group:"F", date:"2026-06-26", ukTime:"00:00", home:"JPN", away:"SWE", venue:"DAL" },
  { group:"D", date:"2026-06-26", ukTime:"03:00", home:"TUR", away:"USA", venue:"LAX" },
  { group:"D", date:"2026-06-26", ukTime:"03:00", home:"PAR", away:"AUS", venue:"SFO" },
  { group:"I", date:"2026-06-26", ukTime:"20:00", home:"NOR", away:"FRA", venue:"BOS" },
  { group:"I", date:"2026-06-26", ukTime:"20:00", home:"SEN", away:"IRQ", venue:"TOR" },
  { group:"H", date:"2026-06-27", ukTime:"01:00", home:"CPV", away:"KSA", venue:"HOU" },
  { group:"H", date:"2026-06-27", ukTime:"01:00", home:"URU", away:"ESP", venue:"GUA" },
  { group:"G", date:"2026-06-27", ukTime:"04:00", home:"NZL", away:"BEL", venue:"VAN" },
  { group:"G", date:"2026-06-27", ukTime:"04:00", home:"EGY", away:"IRN", venue:"SEA" },
  { group:"L", date:"2026-06-27", ukTime:"22:00", home:"PAN", away:"ENG", venue:"NYC" },
  { group:"L", date:"2026-06-27", ukTime:"22:00", home:"CRO", away:"GHA", venue:"PHI" },
  { group:"K", date:"2026-06-28", ukTime:"00:30", home:"COL", away:"POR", venue:"MIA" },
  { group:"K", date:"2026-06-28", ukTime:"00:30", home:"COD", away:"UZB", venue:"ATL" },
  { group:"J", date:"2026-06-28", ukTime:"03:00", home:"ALG", away:"AUT", venue:"KAN" },
  { group:"J", date:"2026-06-28", ukTime:"03:00", home:"JOR", away:"ARG", venue:"DAL" },
];

/* =====================================================================
 * KNOCKOUT STAGE — UTC kick-off times sourced ONLY from football-data.org
 * (competition WC, season 2026, as of May 2026). The API does NOT expose
 * venues for any World Cup match, so venue is "TBD" until the API
 * starts to populate it (typically after the bracket is set). Real teams
 * are likewise filled in by football-data.org's match data once group
 * stage finishes; until then we use the bracket placeholders below
 * ("1A","2B", "W R32-1", etc.) so the UI can still show fixture slots.
 * ===================================================================*/
interface KnockoutFixture {
  stage: StageId;
  utc: string;       // ISO UTC
  home: string;      // team code OR bracket placeholder (e.g., "1A", "W R32-1")
  away: string;      // team code OR bracket placeholder
  venue?: string;    // optional venue code when known
}

const KNOCKOUT_FIXTURES: KnockoutFixture[] = [
  /* ---- R32 / LAST_32 (16 matches) ---- */
  /* Confirmed fixtures (verified 27 June 2026 — FIFA/ESPN/Sky Sports): */
  { stage: "R32", utc: "2026-06-28T19:00:00Z", home: "RSA", away: "CAN", venue: "LAX" },
  { stage: "R32", utc: "2026-06-29T17:00:00Z", home: "BRA", away: "JPN", venue: "HOU" },
  { stage: "R32", utc: "2026-06-29T20:30:00Z", home: "GER", away: "PAR", venue: "BOS" },
  { stage: "R32", utc: "2026-06-30T01:00:00Z", home: "NED", away: "MAR", venue: "MTY" },
  { stage: "R32", utc: "2026-06-30T17:00:00Z", home: "CIV", away: "NOR", venue: "DAL" },
  { stage: "R32", utc: "2026-06-30T21:00:00Z", home: "FRA", away: "SWE", venue: "NYC" },
  /* All R32 fixtures confirmed after group stage (verified 28 June 2026): */
  { stage: "R32", utc: "2026-07-01T01:00:00Z", home: "MEX", away: "ECU", venue: "AZT" },
  { stage: "R32", utc: "2026-07-01T16:00:00Z", home: "ENG", away: "COD", venue: "ATL" },
  { stage: "R32", utc: "2026-07-01T20:00:00Z", home: "BEL", away: "SEN", venue: "SEA" },
  { stage: "R32", utc: "2026-07-02T00:00:00Z", home: "USA", away: "BIH", venue: "SFO" },

  { stage: "R32", utc: "2026-07-02T19:00:00Z", home: "ESP", away: "AUT", venue: "TOR" },
  { stage: "R32", utc: "2026-07-02T23:00:00Z", home: "POR", away: "CRO", venue: "LAX" },
  { stage: "R32", utc: "2026-07-03T03:00:00Z", home: "SUI", away: "ALG", venue: "VAN" },
  { stage: "R32", utc: "2026-07-03T18:00:00Z", home: "AUS", away: "EGY", venue: "DAL" },
  { stage: "R32", utc: "2026-07-03T22:00:00Z", home: "ARG", away: "CPV", venue: "MIA" },
  { stage: "R32", utc: "2026-07-04T01:30:00Z", home: "COL", away: "GHA", venue: "KAN" },

  /* ---- R16 / LAST_16 (8 matches) ---- */
  /*
   * R32→R16 pairings per official FIFA bracket (Wikipedia confirmed).
   * "W R32-N" = winner of the Nth R32 match in UTC chronological order:
   *   R32-1=M073 RSA/CAN  R32-2=M074 BRA/JPN  R32-3=M075 GER/PAR
   *   R32-4=M076 NED/MAR  R32-5=M077 CIV/NOR  R32-6=M078 FRA/SWE
   *   R32-7=M079 MEX/TBD  R32-8=M080 ENG/TBD  R32-9=M081 BEL/TBD
   *   R32-10=M082 USA/BIH R32-11=M083 H1/J2   R32-12=M084 K2/L2
   *   R32-13=M085 SUI/ALG R32-14=M086 AUS/EGY R32-15=M087 ARG/CPV
   *   R32-16=M088 K1/TBD
   *
   * Bracket halves (feeds QF via "W R16-N"):
   *   LEFT-TOP  (→QF M097): M089 W(GER) vs W(FRA)    +  M090 W(RSA) vs W(NED)
   *   LEFT-BOT  (→QF M098): M091 W(K2L2) vs W(H1J2)  +  M092 W(USA) vs W(BEL)
   *   RIGHT-TOP (→QF M099): M093 W(BRA) vs W(CIV)    +  M094 W(MEX) vs W(ENG)
   *   RIGHT-BOT (→QF M100): M095 W(ARG) vs W(AUS)    +  M096 W(SUI) vs W(K1)
   */
  /* LEFT-TOP (→ QF M097) */
  { stage: "R16", utc: "2026-07-04T17:00:00Z", home: "W R32-3",  away: "W R32-6"  },
  { stage: "R16", utc: "2026-07-04T21:00:00Z", home: "W R32-1",  away: "W R32-4"  },
  /* LEFT-BOTTOM (→ QF M098) */
  { stage: "R16", utc: "2026-07-05T20:00:00Z", home: "W R32-12", away: "W R32-11" },
  { stage: "R16", utc: "2026-07-06T00:00:00Z", home: "W R32-10", away: "W R32-9"  },
  /* RIGHT-TOP (→ QF M099) */
  { stage: "R16", utc: "2026-07-06T19:00:00Z", home: "W R32-2",  away: "W R32-5"  },
  { stage: "R16", utc: "2026-07-07T00:00:00Z", home: "W R32-7",  away: "W R32-8"  },
  /* RIGHT-BOTTOM (→ QF M100) */
  { stage: "R16", utc: "2026-07-07T16:00:00Z", home: "W R32-15", away: "W R32-14" },
  { stage: "R16", utc: "2026-07-07T20:00:00Z", home: "W R32-13", away: "W R32-16" },

  /* ---- Quarter-finals (4 matches) ---- */
  { stage: "QF",  utc: "2026-07-09T20:00:00Z", home: "W R16-1",     away: "W R16-2"      },
  { stage: "QF",  utc: "2026-07-10T19:00:00Z", home: "W R16-3",     away: "W R16-4"      },
  { stage: "QF",  utc: "2026-07-11T21:00:00Z", home: "W R16-5",     away: "W R16-6"      },
  { stage: "QF",  utc: "2026-07-12T01:00:00Z", home: "W R16-7",     away: "W R16-8"      },

  /* ---- Semi-finals (2 matches) ---- */
  { stage: "SF",  utc: "2026-07-14T19:00:00Z", home: "W QF-1",      away: "W QF-2"       },
  { stage: "SF",  utc: "2026-07-15T19:00:00Z", home: "W QF-3",      away: "W QF-4"       },

  /* ---- Third-place play-off ---- */
  { stage: "THIRD", utc: "2026-07-18T21:00:00Z", home: "L SF-1",    away: "L SF-2"       },

  /* ---- Final ---- */
  { stage: "FINAL", utc: "2026-07-19T19:00:00Z", home: "W SF-1",    away: "W SF-2"       },
];

const STAGE_STUDIO_SHOW: Record<StageId, string | null> = {
  GROUP: null,
  R32:   "אולפן נוקאאוט",
  R16:   "אולפן שמינית הגמר",
  QF:    "אולפן רבע הגמר",
  SF:    "אולפן חצי הגמר — שידור מורחב",
  THIRD: "אולפן ברונזה",
  FINAL: "אולפן הגמר — שידור מיוחד 3 שעות",
};

const STAGE_PRE_GAME_MINUTES: Record<StageId, number> = {
  GROUP: 30, R32: 45, R16: 45, QF: 60, SF: 90, THIRD: 60, FINAL: 120,
};

function buildMatches(): Match[] {
  const matches: Match[] = [];
  let seq = 1;
  const push = (obj: Omit<Match, "id">) => matches.push({ id: "M" + String(seq++).padStart(3, "0"), ...obj });

  /* Group stage — explicit FIFA-published schedule (72 matches).
   * Teams, dates and kick-off times verified 100% against football-data.org.
   * Venues are from FIFA's officially published match schedule (not API). */
  GROUP_FIXTURES.forEach((fx, i) => {
    const isHost = HOST_TEAMS.has(fx.home) || HOST_TEAMS.has(fx.away);
    push({
      utc: uk(fx.date, fx.ukTime),
      stage: "GROUP",
      group: fx.group,
      home: fx.home,
      away: fx.away,
      venue: fx.venue,
      status: "scheduled",
      channels: pickChannels(i, "GROUP", isHost),
      preGameMinutes: 30,
      studioShow: isHost ? "אולפן מונדיאל 2026" : null,
      odds: null,        // odds removed — no verified source via football-data.org
      aiInsight: null,   // insights removed — were generated, not real
    });
  });

  /* Knockout stages — UTC times direct from football-data.org. Venue
   * starts as "TBD"; the sync-results cron will fill it once the API
   * exposes it (typically after the bracket is decided). */
  KNOCKOUT_FIXTURES.forEach((kf, i) => {
    push({
      utc: kf.utc,
      stage: kf.stage,
      group: null,
      home: kf.home,
      away: kf.away,
      homeIsPlaceholder: !TEAMS[kf.home],
      awayIsPlaceholder: !TEAMS[kf.away],
      venue: kf.venue ?? "TBD",
      status: "scheduled",
      channels: pickChannels(i, kf.stage, false),
      preGameMinutes: STAGE_PRE_GAME_MINUTES[kf.stage],
      studioShow: STAGE_STUDIO_SHOW[kf.stage],
      odds: null,
      aiInsight: null,
    });
  });

  return matches;
}

export const MATCHES: Match[] = buildMatches();
