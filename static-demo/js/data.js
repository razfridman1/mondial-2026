/* =====================================================================
 * MONDIAL 2026 — Match Schedule + Israel TV Broadcast Center
 * Data layer: Teams, Channels, Venues, Matches
 * =====================================================================
 * All match times stored as UTC ISO strings.
 * UI converts to Asia/Jerusalem with DST awareness.
 * ===================================================================*/

/* ---------- TEAMS (48 — Mondial 2026 full field) ---------- */
const TEAMS = {
  // Group A
  MEX: { code: "MEX", name: "מקסיקו",    nameEn: "Mexico",         flag: "🇲🇽", group: "A" },
  POL: { code: "POL", name: "פולין",      nameEn: "Poland",         flag: "🇵🇱", group: "A" },
  EGY: { code: "EGY", name: "מצרים",      nameEn: "Egypt",          flag: "🇪🇬", group: "A" },
  ECU: { code: "ECU", name: "אקוודור",    nameEn: "Ecuador",        flag: "🇪🇨", group: "A" },
  // Group B
  CAN: { code: "CAN", name: "קנדה",       nameEn: "Canada",         flag: "🇨🇦", group: "B" },
  NED: { code: "NED", name: "הולנד",      nameEn: "Netherlands",    flag: "🇳🇱", group: "B" },
  KOR: { code: "KOR", name: "דרום קוריאה", nameEn: "South Korea",    flag: "🇰🇷", group: "B" },
  SEN: { code: "SEN", name: "סנגל",       nameEn: "Senegal",        flag: "🇸🇳", group: "B" },
  // Group C
  USA: { code: "USA", name: "ארה״ב",      nameEn: "USA",            flag: "🇺🇸", group: "C" },
  GER: { code: "GER", name: "גרמניה",     nameEn: "Germany",        flag: "🇩🇪", group: "C" },
  AUS: { code: "AUS", name: "אוסטרליה",   nameEn: "Australia",      flag: "🇦🇺", group: "C" },
  CRC: { code: "CRC", name: "קוסטה ריקה", nameEn: "Costa Rica",     flag: "🇨🇷", group: "C" },
  // Group D
  ARG: { code: "ARG", name: "ארגנטינה",   nameEn: "Argentina",      flag: "🇦🇷", group: "D" },
  CRO: { code: "CRO", name: "קרואטיה",    nameEn: "Croatia",        flag: "🇭🇷", group: "D" },
  NGA: { code: "NGA", name: "ניגריה",     nameEn: "Nigeria",        flag: "🇳🇬", group: "D" },
  PAN: { code: "PAN", name: "פנמה",       nameEn: "Panama",         flag: "🇵🇦", group: "D" },
  // Group E
  FRA: { code: "FRA", name: "צרפת",       nameEn: "France",         flag: "🇫🇷", group: "E" },
  URU: { code: "URU", name: "אורוגוואי",  nameEn: "Uruguay",        flag: "🇺🇾", group: "E" },
  JPN: { code: "JPN", name: "יפן",        nameEn: "Japan",          flag: "🇯🇵", group: "E" },
  TUN: { code: "TUN", name: "תוניסיה",    nameEn: "Tunisia",        flag: "🇹🇳", group: "E" },
  // Group F
  ESP: { code: "ESP", name: "ספרד",       nameEn: "Spain",          flag: "🇪🇸", group: "F" },
  BEL: { code: "BEL", name: "בלגיה",      nameEn: "Belgium",        flag: "🇧🇪", group: "F" },
  IRN: { code: "IRN", name: "איראן",      nameEn: "Iran",           flag: "🇮🇷", group: "F" },
  JAM: { code: "JAM", name: "ג׳מייקה",    nameEn: "Jamaica",        flag: "🇯🇲", group: "F" },
  // Group G
  BRA: { code: "BRA", name: "ברזיל",      nameEn: "Brazil",         flag: "🇧🇷", group: "G" },
  SUI: { code: "SUI", name: "שווייץ",     nameEn: "Switzerland",    flag: "🇨🇭", group: "G" },
  MAR: { code: "MAR", name: "מרוקו",      nameEn: "Morocco",        flag: "🇲🇦", group: "G" },
  NZL: { code: "NZL", name: "ניו זילנד",  nameEn: "New Zealand",    flag: "🇳🇿", group: "G" },
  // Group H
  ENG: { code: "ENG", name: "אנגליה",     nameEn: "England",        flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", group: "H" },
  SRB: { code: "SRB", name: "סרביה",      nameEn: "Serbia",         flag: "🇷🇸", group: "H" },
  KSA: { code: "KSA", name: "ערב הסעודית", nameEn: "Saudi Arabia",  flag: "🇸🇦", group: "H" },
  ALG: { code: "ALG", name: "אלג׳יריה",   nameEn: "Algeria",        flag: "🇩🇿", group: "H" },
  // Group I
  POR: { code: "POR", name: "פורטוגל",    nameEn: "Portugal",       flag: "🇵🇹", group: "I" },
  COL: { code: "COL", name: "קולומביה",   nameEn: "Colombia",       flag: "🇨🇴", group: "I" },
  GHA: { code: "GHA", name: "גאנה",       nameEn: "Ghana",          flag: "🇬🇭", group: "I" },
  UZB: { code: "UZB", name: "אוזבקיסטן",  nameEn: "Uzbekistan",     flag: "🇺🇿", group: "I" },
  // Group J
  ITA: { code: "ITA", name: "איטליה",     nameEn: "Italy",          flag: "🇮🇹", group: "J" },
  DEN: { code: "DEN", name: "דנמרק",      nameEn: "Denmark",        flag: "🇩🇰", group: "J" },
  CIV: { code: "CIV", name: "חוף השנהב",  nameEn: "Ivory Coast",    flag: "🇨🇮", group: "J" },
  QAT: { code: "QAT", name: "קטאר",       nameEn: "Qatar",          flag: "🇶🇦", group: "J" },
  // Group K
  TUR: { code: "TUR", name: "טורקיה",     nameEn: "Turkey",         flag: "🇹🇷", group: "K" },
  AUT: { code: "AUT", name: "אוסטריה",    nameEn: "Austria",        flag: "🇦🇹", group: "K" },
  PER: { code: "PER", name: "פרו",        nameEn: "Peru",           flag: "🇵🇪", group: "K" },
  HAI: { code: "HAI", name: "האיטי",      nameEn: "Haiti",          flag: "🇭🇹", group: "K" },
  // Group L
  SCO: { code: "SCO", name: "סקוטלנד",    nameEn: "Scotland",       flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", group: "L" },
  CZE: { code: "CZE", name: "צ׳כיה",      nameEn: "Czech Republic", flag: "🇨🇿", group: "L" },
  CMR: { code: "CMR", name: "קמרון",      nameEn: "Cameroon",       flag: "🇨🇲", group: "L" },
  IRQ: { code: "IRQ", name: "עיראק",      nameEn: "Iraq",           flag: "🇮🇶", group: "L" },
};

/* ---------- VENUES (16 stadiums) ---------- */
const VENUES = {
  AZT: { name: "אצטדיון אסטקה",         city: "מקסיקו סיטי",   country: "מקסיקו",  flag: "🇲🇽", capacity: 87000 },
  GUA: { name: "אצטדיון אקרון",         city: "גוודלחרה",       country: "מקסיקו",  flag: "🇲🇽", capacity: 49850 },
  MTY: { name: "אצטדיון BBVA",          city: "מונטריי",        country: "מקסיקו",  flag: "🇲🇽", capacity: 53500 },
  TOR: { name: "BMO Field",              city: "טורונטו",        country: "קנדה",    flag: "🇨🇦", capacity: 45500 },
  VAN: { name: "BC Place",               city: "ונקובר",         country: "קנדה",    flag: "🇨🇦", capacity: 54500 },
  NYC: { name: "MetLife Stadium",        city: "ניו יורק/ניו ג׳רזי", country: "ארה״ב", flag: "🇺🇸", capacity: 82500 },
  LAX: { name: "SoFi Stadium",           city: "לוס אנג׳לס",     country: "ארה״ב",   flag: "🇺🇸", capacity: 70000 },
  DAL: { name: "AT&T Stadium",           city: "דאלאס",          country: "ארה״ב",   flag: "🇺🇸", capacity: 80000 },
  ATL: { name: "Mercedes-Benz Stadium",  city: "אטלנטה",         country: "ארה״ב",   flag: "🇺🇸", capacity: 71000 },
  MIA: { name: "Hard Rock Stadium",      city: "מיאמי",          country: "ארה״ב",   flag: "🇺🇸", capacity: 65000 },
  HOU: { name: "NRG Stadium",            city: "יוסטון",         country: "ארה״ב",   flag: "🇺🇸", capacity: 72000 },
  KAN: { name: "Arrowhead Stadium",      city: "קנזס סיטי",      country: "ארה״ב",   flag: "🇺🇸", capacity: 76400 },
  PHI: { name: "Lincoln Financial Field",city: "פילדלפיה",       country: "ארה״ב",   flag: "🇺🇸", capacity: 69000 },
  SFO: { name: "Levi’s Stadium",         city: "סן פרנסיסקו",    country: "ארה״ב",   flag: "🇺🇸", capacity: 68500 },
  SEA: { name: "Lumen Field",            city: "סיאטל",          country: "ארה״ב",   flag: "🇺🇸", capacity: 69000 },
  BOS: { name: "Gillette Stadium",       city: "בוסטון",         country: "ארה״ב",   flag: "🇺🇸", capacity: 65900 },
};

/* ---------- ISRAELI TV CHANNELS ---------- */
const CHANNELS = {
  KAN11: {
    id: "KAN11",
    name: "כאן 11",
    type: "פתוח",
    logo: "📺",
    color: "#0a4d8c",
    url: "https://www.kan.org.il/live/tv.aspx?stationId=2",
    digital: true,
  },
  SPORT5: {
    id: "SPORT5",
    name: "ספורט 5",
    type: "כבלים/לוויין",
    logo: "⚽",
    color: "#e30613",
    url: "https://www.sport5.co.il/live",
    digital: true,
  },
  SPORT1: {
    id: "SPORT1",
    name: "ספורט 1",
    type: "כבלים/לוויין",
    logo: "🏆",
    color: "#1e3a8a",
    url: "https://www.sport1.co.il/live",
    digital: true,
  },
  SPORT2: {
    id: "SPORT2",
    name: "ספורט 2",
    type: "כבלים/לוויין",
    logo: "🥇",
    color: "#0891b2",
    url: "https://www.sport1.co.il/live",
    digital: true,
  },
  SPORT5PLUS: {
    id: "SPORT5PLUS",
    name: "ספורט 5+",
    type: "כבלים/לוויין",
    logo: "✨",
    color: "#dc2626",
    url: "https://www.sport5.co.il/live",
    digital: true,
  },
  SPORT5LIVE: {
    id: "SPORT5LIVE",
    name: "Sport 5 Live",
    type: "סטרימינג",
    logo: "🌐",
    color: "#7c2d12",
    url: "https://www.sport5.co.il/live",
    digital: true,
  },
  KANSPORT: {
    id: "KANSPORT",
    name: "כאן ספורט",
    type: "סטרימינג",
    logo: "🎥",
    color: "#0a4d8c",
    url: "https://www.kan.org.il/sport/",
    digital: true,
  },
};

/* ---------- STAGES ---------- */
const STAGES = {
  GROUP:  { id: "GROUP",  name: "שלב הבתים",        order: 1 },
  R32:    { id: "R32",    name: "שלב 32",          order: 2 },
  R16:    { id: "R16",    name: "שלב 16",          order: 3 },
  QF:     { id: "QF",     name: "רבע גמר",         order: 4 },
  SF:     { id: "SF",     name: "חצי גמר",         order: 5 },
  THIRD:  { id: "THIRD",  name: "משחק על המקום השלישי", order: 6 },
  FINAL:  { id: "FINAL",  name: "הגמר",             order: 7 },
};

/* ---------- HELPERS for building matches ---------- */
/* Israeli time is UTC+3 (summer DST always active during June-July).
 * To produce a match starting at 21:00 Israel time on 2026-06-11, the UTC string is 18:00Z that day. */
function isr(dateStr, hhmm) {
  // dateStr e.g. "2026-06-11", hhmm e.g. "21:00" → return ISO UTC string
  const [h, m] = hhmm.split(":").map(Number);
  const utcHour = h - 3;
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCHours(utcHour, m, 0, 0);
  return d.toISOString();
}

/* Auto-pick channel pattern (deterministic distribution) */
function pickChannels(matchIdx, stageId, isHostMatch) {
  // Marquee matches get KAN11 (free-to-air) + Sport5
  const isMarquee = stageId !== "GROUP" || isHostMatch || matchIdx % 4 === 0;
  if (stageId === "FINAL" || stageId === "SF" || stageId === "THIRD") {
    return ["KAN11", "SPORT5", "SPORT5LIVE"];
  }
  if (stageId === "QF") return ["KAN11", "SPORT5", "SPORT5LIVE"];
  if (stageId === "R16" || stageId === "R32") {
    return matchIdx % 2 === 0 ? ["KAN11", "SPORT1"] : ["SPORT5", "SPORT5LIVE"];
  }
  if (isMarquee) return ["KAN11", "SPORT5"];
  const rota = [
    ["SPORT5"], ["SPORT1"], ["SPORT2"], ["SPORT5PLUS"], ["SPORT5LIVE"], ["KANSPORT"],
  ];
  return rota[matchIdx % rota.length];
}

/* ---------- MATCHES (Mondial 2026, 104 matches) ----------
 * Schedule modeled on FIFA's 2026 framework: 11 June – 19 July 2026.
 * Group stage: 12 groups × 6 matches each = 72 matches across 14 days.
 * Knockouts: R32 (16), R16 (8), QF (4), SF (2), 3rd-place (1), Final (1). */

const RAW_GROUP_FIXTURES = [
  // Format: [groupLetter, [pair1A, pair1B], [pair2A, pair2B], [pair3A, pair3B]] over 3 matchdays
  ["A", ["MEX","POL"], ["EGY","ECU"], ["MEX","EGY"], ["POL","ECU"], ["MEX","ECU"], ["POL","EGY"]],
  ["B", ["CAN","NED"], ["KOR","SEN"], ["CAN","KOR"], ["NED","SEN"], ["CAN","SEN"], ["NED","KOR"]],
  ["C", ["USA","GER"], ["AUS","CRC"], ["USA","AUS"], ["GER","CRC"], ["USA","CRC"], ["GER","AUS"]],
  ["D", ["ARG","CRO"], ["NGA","PAN"], ["ARG","NGA"], ["CRO","PAN"], ["ARG","PAN"], ["CRO","NGA"]],
  ["E", ["FRA","URU"], ["JPN","TUN"], ["FRA","JPN"], ["URU","TUN"], ["FRA","TUN"], ["URU","JPN"]],
  ["F", ["ESP","BEL"], ["IRN","JAM"], ["ESP","IRN"], ["BEL","JAM"], ["ESP","JAM"], ["BEL","IRN"]],
  ["G", ["BRA","SUI"], ["MAR","NZL"], ["BRA","MAR"], ["SUI","NZL"], ["BRA","NZL"], ["SUI","MAR"]],
  ["H", ["ENG","SRB"], ["KSA","ALG"], ["ENG","KSA"], ["SRB","ALG"], ["ENG","ALG"], ["SRB","KSA"]],
  ["I", ["POR","COL"], ["GHA","UZB"], ["POR","GHA"], ["COL","UZB"], ["POR","UZB"], ["COL","GHA"]],
  ["J", ["ITA","DEN"], ["CIV","QAT"], ["ITA","CIV"], ["DEN","QAT"], ["ITA","QAT"], ["DEN","CIV"]],
  ["K", ["TUR","AUT"], ["PER","HAI"], ["TUR","PER"], ["AUT","HAI"], ["TUR","HAI"], ["AUT","PER"]],
  ["L", ["SCO","CZE"], ["CMR","IRQ"], ["SCO","CMR"], ["CZE","IRQ"], ["SCO","IRQ"], ["CZE","CMR"]],
];

const HOST_TEAMS = new Set(["MEX","USA","CAN"]);
const VENUE_KEYS = Object.keys(VENUES);

const MATCHES = [];
let matchSeq = 1;

/* Group stage spread across June 11 – June 27 */
const GROUP_DAYS = [
  "2026-06-11","2026-06-12","2026-06-13","2026-06-14","2026-06-15","2026-06-16",
  "2026-06-17","2026-06-18","2026-06-19","2026-06-20","2026-06-21","2026-06-22",
  "2026-06-23","2026-06-24","2026-06-25","2026-06-26","2026-06-27",
];
const GROUP_KICKOFFS = ["19:00","22:00","01:00","23:00","20:00","17:00"];

function pushMatch(obj) {
  obj.id = "M" + String(matchSeq++).padStart(3, "0");
  MATCHES.push(obj);
}

let venueIdx = 0;
let dayIdx = 0;
let koIdx = 0;
RAW_GROUP_FIXTURES.forEach((row, grpIdx) => {
  const grp = row[0];
  const fixtures = [
    [row[1][0], row[1][1]], // MD1 game 1
    [row[2][0], row[2][1]], // MD1 game 2
    [row[3][0], row[3][1]], // MD2 game 1
    [row[4][0], row[4][1]], // MD2 game 2
    [row[5][0], row[5][1]], // MD3 game 1
    [row[6][0], row[6][1]], // MD3 game 2
  ];
  fixtures.forEach((pair, i) => {
    const dateStr = GROUP_DAYS[(grpIdx * 2 + Math.floor(i / 2)) % GROUP_DAYS.length];
    const time = GROUP_KICKOFFS[(grpIdx + i) % GROUP_KICKOFFS.length];
    const v = VENUE_KEYS[venueIdx++ % VENUE_KEYS.length];
    const isHost = HOST_TEAMS.has(pair[0]) || HOST_TEAMS.has(pair[1]);
    pushMatch({
      utc: isr(dateStr, time),
      stage: "GROUP",
      group: grp,
      home: pair[0],
      away: pair[1],
      venue: v,
      status: "scheduled",
      channels: pickChannels(matchSeq, "GROUP", isHost),
      preGameMinutes: 30,
      studioShow: isHost ? "אולפן מונדיאל 2026" : null,
      odds: generateOdds(pair[0], pair[1]),
      aiInsight: generateInsight(pair[0], pair[1], "GROUP"),
    });
  });
});

/* Knockout — Round of 32 (June 28 – July 3) */
const R32_PAIRS = [
  ["1A","2B"],["1C","2D"],["1E","2F"],["1G","2H"],["1I","2J"],["1K","2L"],
  ["1B","3A/C/D/E"],["1D","3B/E/F"],["1F","3A/B/C/G"],["1H","3C/F/I/J"],
  ["1J","3D/E/H/K"],["1L","3F/G/J/L"],
  ["2A","2C"],["2E","2G"],["2I","2K"],["3C/D/H","3I/J/L"],
];
const R32_DAYS = ["2026-06-28","2026-06-29","2026-06-30","2026-07-01","2026-07-02","2026-07-03"];
const KO_KICKOFFS = ["20:00","23:00","02:00"];
R32_PAIRS.forEach((pair, i) => {
  const dateStr = R32_DAYS[Math.floor(i / 3) % R32_DAYS.length];
  const time = KO_KICKOFFS[i % KO_KICKOFFS.length];
  const v = VENUE_KEYS[(venueIdx + i) % VENUE_KEYS.length];
  pushMatch({
    utc: isr(dateStr, time),
    stage: "R32",
    group: null,
    home: pair[0],
    away: pair[1],
    homeIsPlaceholder: true,
    awayIsPlaceholder: true,
    venue: v,
    status: "scheduled",
    channels: pickChannels(i, "R32", false),
    preGameMinutes: 45,
    studioShow: "אולפן נוקאאוט",
    odds: null,
    aiInsight: "שלב נוקאאוט — המנצח עולה הלאה.",
  });
});

/* Round of 16 — July 4 – July 7 */
const R16_DAYS = ["2026-07-04","2026-07-05","2026-07-06","2026-07-07"];
for (let i = 0; i < 8; i++) {
  const dateStr = R16_DAYS[i % R16_DAYS.length];
  const time = KO_KICKOFFS[i % 3];
  const v = VENUE_KEYS[(venueIdx + i + 5) % VENUE_KEYS.length];
  pushMatch({
    utc: isr(dateStr, time),
    stage: "R16",
    group: null,
    home: `W R32-${i*2+1}`,
    away: `W R32-${i*2+2}`,
    homeIsPlaceholder: true,
    awayIsPlaceholder: true,
    venue: v,
    status: "scheduled",
    channels: pickChannels(i, "R16", false),
    preGameMinutes: 45,
    studioShow: "אולפן שמינית הגמר",
    odds: null,
    aiInsight: "שמינית הגמר — שמונה זוגות לקראת רבע הגמר.",
  });
}

/* Quarter-Finals — July 9 – July 11 */
const QF_DATES = ["2026-07-09","2026-07-09","2026-07-11","2026-07-11"];
const QF_TIMES = ["19:00","23:00","19:00","23:00"];
for (let i = 0; i < 4; i++) {
  const v = VENUE_KEYS[(venueIdx + i + 9) % VENUE_KEYS.length];
  pushMatch({
    utc: isr(QF_DATES[i], QF_TIMES[i]),
    stage: "QF",
    group: null,
    home: `W R16-${i*2+1}`,
    away: `W R16-${i*2+2}`,
    homeIsPlaceholder: true,
    awayIsPlaceholder: true,
    venue: v,
    status: "scheduled",
    channels: pickChannels(i, "QF", false),
    preGameMinutes: 60,
    studioShow: "אולפן רבע הגמר",
    odds: null,
    aiInsight: "רבע הגמר — שמונה הקבוצות החזקות במונדיאל.",
  });
}

/* Semi-Finals — July 14 & 15 */
for (let i = 0; i < 2; i++) {
  pushMatch({
    utc: isr(i === 0 ? "2026-07-14" : "2026-07-15", "22:00"),
    stage: "SF",
    group: null,
    home: `W QF-${i*2+1}`,
    away: `W QF-${i*2+2}`,
    homeIsPlaceholder: true,
    awayIsPlaceholder: true,
    venue: i === 0 ? "DAL" : "ATL",
    status: "scheduled",
    channels: pickChannels(i, "SF", false),
    preGameMinutes: 90,
    studioShow: "אולפן חצי הגמר — שידור מורחב",
    odds: null,
    aiInsight: "חצי הגמר — שתי הקבוצות הסופיות לפני הגמר.",
  });
}

/* 3rd Place — July 18 */
pushMatch({
  utc: isr("2026-07-18", "18:00"),
  stage: "THIRD",
  group: null,
  home: "L SF-1",
  away: "L SF-2",
  homeIsPlaceholder: true,
  awayIsPlaceholder: true,
  venue: "MIA",
  status: "scheduled",
  channels: pickChannels(0, "THIRD", false),
  preGameMinutes: 60,
  studioShow: "אולפן ברונזה",
  odds: null,
  aiInsight: "המשחק על המקום השלישי.",
});

/* Final — July 19 */
pushMatch({
  utc: isr("2026-07-19", "22:00"),
  stage: "FINAL",
  group: null,
  home: "W SF-1",
  away: "W SF-2",
  homeIsPlaceholder: true,
  awayIsPlaceholder: true,
  venue: "NYC",
  status: "scheduled",
  channels: pickChannels(0, "FINAL", false),
  preGameMinutes: 120,
  studioShow: "אולפן הגמר — שידור מיוחד 3 שעות",
  odds: null,
  aiInsight: "גמר המונדיאל 2026 — הרגע הגדול ביותר בכדורגל.",
});

/* ---------- ODDS + AI helpers ---------- */
function generateOdds(homeCode, awayCode) {
  const seed = (homeCode.charCodeAt(0) + awayCode.charCodeAt(0)) % 100;
  const home = (1.4 + (seed % 25) / 10).toFixed(2);
  const draw = (3.0 + (seed % 12) / 10).toFixed(2);
  const away = (1.8 + ((seed + 7) % 30) / 10).toFixed(2);
  return { home, draw, away };
}

function generateInsight(homeCode, awayCode, stage) {
  const home = TEAMS[homeCode]?.name || homeCode;
  const away = TEAMS[awayCode]?.name || awayCode;
  const phrases = [
    `${home} מול ${away} — קרב טקטי שצפוי להיות צמוד מאוד.`,
    `שני יריבים שלא נפגשו בטורניר מאז שנים — צפויה התרגשות.`,
    `הקבוצה הביתית מגיעה למשחק עם מומנטום חיובי מהמחזורים האחרונים.`,
    `${home} מסתמכת על קו ההתקפה החזק שלה, ${away} בונה על הגנה איתנה.`,
    `משחק מפתח להעפלה — שתי הקבוצות זקוקות לנקודות.`,
    `דרבי יבשתי שמבטיח אווירה חמה ביציעים ובבית.`,
  ];
  return phrases[(home.length + away.length) % phrases.length];
}

/* ---------- EXPORTS (browser globals) ---------- */
window.MONDIAL = {
  TEAMS, VENUES, CHANNELS, STAGES, MATCHES,
  HOST_TEAMS,
};
