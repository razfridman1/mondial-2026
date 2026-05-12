/* =====================================================================
 * Mondial 2026 — static reference data (teams, venues, channels, stages)
 * and generated match schedule (104 matches).
 * ===================================================================*/
import type { Team, Venue, Channel, Stage, Match, Odds, StageId } from "./types";

export const TEAMS: Record<string, Team> = {
  MEX: { code: "MEX", name: "מקסיקו",    nameEn: "Mexico",         flag: "🇲🇽", group: "A" },
  POL: { code: "POL", name: "פולין",      nameEn: "Poland",         flag: "🇵🇱", group: "A" },
  EGY: { code: "EGY", name: "מצרים",      nameEn: "Egypt",          flag: "🇪🇬", group: "A" },
  ECU: { code: "ECU", name: "אקוודור",    nameEn: "Ecuador",        flag: "🇪🇨", group: "A" },
  CAN: { code: "CAN", name: "קנדה",       nameEn: "Canada",         flag: "🇨🇦", group: "B" },
  NED: { code: "NED", name: "הולנד",      nameEn: "Netherlands",    flag: "🇳🇱", group: "B" },
  KOR: { code: "KOR", name: "דרום קוריאה", nameEn: "South Korea",   flag: "🇰🇷", group: "B" },
  SEN: { code: "SEN", name: "סנגל",       nameEn: "Senegal",        flag: "🇸🇳", group: "B" },
  USA: { code: "USA", name: "ארה״ב",      nameEn: "USA",            flag: "🇺🇸", group: "C" },
  GER: { code: "GER", name: "גרמניה",     nameEn: "Germany",        flag: "🇩🇪", group: "C" },
  AUS: { code: "AUS", name: "אוסטרליה",   nameEn: "Australia",      flag: "🇦🇺", group: "C" },
  CRC: { code: "CRC", name: "קוסטה ריקה", nameEn: "Costa Rica",     flag: "🇨🇷", group: "C" },
  ARG: { code: "ARG", name: "ארגנטינה",   nameEn: "Argentina",      flag: "🇦🇷", group: "D" },
  CRO: { code: "CRO", name: "קרואטיה",    nameEn: "Croatia",        flag: "🇭🇷", group: "D" },
  NGA: { code: "NGA", name: "ניגריה",     nameEn: "Nigeria",        flag: "🇳🇬", group: "D" },
  PAN: { code: "PAN", name: "פנמה",       nameEn: "Panama",         flag: "🇵🇦", group: "D" },
  FRA: { code: "FRA", name: "צרפת",       nameEn: "France",         flag: "🇫🇷", group: "E" },
  URU: { code: "URU", name: "אורוגוואי",  nameEn: "Uruguay",        flag: "🇺🇾", group: "E" },
  JPN: { code: "JPN", name: "יפן",        nameEn: "Japan",          flag: "🇯🇵", group: "E" },
  TUN: { code: "TUN", name: "תוניסיה",    nameEn: "Tunisia",        flag: "🇹🇳", group: "E" },
  ESP: { code: "ESP", name: "ספרד",       nameEn: "Spain",          flag: "🇪🇸", group: "F" },
  BEL: { code: "BEL", name: "בלגיה",      nameEn: "Belgium",        flag: "🇧🇪", group: "F" },
  IRN: { code: "IRN", name: "איראן",      nameEn: "Iran",           flag: "🇮🇷", group: "F" },
  JAM: { code: "JAM", name: "ג׳מייקה",    nameEn: "Jamaica",        flag: "🇯🇲", group: "F" },
  BRA: { code: "BRA", name: "ברזיל",      nameEn: "Brazil",         flag: "🇧🇷", group: "G" },
  SUI: { code: "SUI", name: "שווייץ",     nameEn: "Switzerland",    flag: "🇨🇭", group: "G" },
  MAR: { code: "MAR", name: "מרוקו",      nameEn: "Morocco",        flag: "🇲🇦", group: "G" },
  NZL: { code: "NZL", name: "ניו זילנד",  nameEn: "New Zealand",    flag: "🇳🇿", group: "G" },
  ENG: { code: "ENG", name: "אנגליה",     nameEn: "England",        flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", group: "H" },
  SRB: { code: "SRB", name: "סרביה",      nameEn: "Serbia",         flag: "🇷🇸", group: "H" },
  KSA: { code: "KSA", name: "ערב הסעודית", nameEn: "Saudi Arabia",  flag: "🇸🇦", group: "H" },
  ALG: { code: "ALG", name: "אלג׳יריה",   nameEn: "Algeria",        flag: "🇩🇿", group: "H" },
  POR: { code: "POR", name: "פורטוגל",    nameEn: "Portugal",       flag: "🇵🇹", group: "I" },
  COL: { code: "COL", name: "קולומביה",   nameEn: "Colombia",       flag: "🇨🇴", group: "I" },
  GHA: { code: "GHA", name: "גאנה",       nameEn: "Ghana",          flag: "🇬🇭", group: "I" },
  UZB: { code: "UZB", name: "אוזבקיסטן",  nameEn: "Uzbekistan",     flag: "🇺🇿", group: "I" },
  ITA: { code: "ITA", name: "איטליה",     nameEn: "Italy",          flag: "🇮🇹", group: "J" },
  DEN: { code: "DEN", name: "דנמרק",      nameEn: "Denmark",        flag: "🇩🇰", group: "J" },
  CIV: { code: "CIV", name: "חוף השנהב",  nameEn: "Ivory Coast",    flag: "🇨🇮", group: "J" },
  QAT: { code: "QAT", name: "קטאר",       nameEn: "Qatar",          flag: "🇶🇦", group: "J" },
  TUR: { code: "TUR", name: "טורקיה",     nameEn: "Turkey",         flag: "🇹🇷", group: "K" },
  AUT: { code: "AUT", name: "אוסטריה",    nameEn: "Austria",        flag: "🇦🇹", group: "K" },
  PER: { code: "PER", name: "פרו",        nameEn: "Peru",           flag: "🇵🇪", group: "K" },
  HAI: { code: "HAI", name: "האיטי",      nameEn: "Haiti",          flag: "🇭🇹", group: "K" },
  SCO: { code: "SCO", name: "סקוטלנד",    nameEn: "Scotland",       flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", group: "L" },
  CZE: { code: "CZE", name: "צ׳כיה",      nameEn: "Czech Republic", flag: "🇨🇿", group: "L" },
  CMR: { code: "CMR", name: "קמרון",      nameEn: "Cameroon",       flag: "🇨🇲", group: "L" },
  IRQ: { code: "IRQ", name: "עיראק",      nameEn: "Iraq",           flag: "🇮🇶", group: "L" },
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

function isr(dateStr: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const utcHour = h - 3;
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

function generateOdds(homeCode: string, awayCode: string): Odds {
  const seed = (homeCode.charCodeAt(0) + awayCode.charCodeAt(0)) % 100;
  return {
    home: (1.4 + (seed % 25) / 10).toFixed(2),
    draw: (3.0 + (seed % 12) / 10).toFixed(2),
    away: (1.8 + ((seed + 7) % 30) / 10).toFixed(2),
  };
}

function generateInsight(homeCode: string, awayCode: string): string {
  const home = TEAMS[homeCode]?.name || homeCode;
  const away = TEAMS[awayCode]?.name || awayCode;
  const phrases = [
    `${home} מול ${away} — קרב טקטי שצפוי להיות צמוד מאוד.`,
    `שני יריבים שלא נפגשו בטורניר מאז שנים — צפויה התרגשות.`,
    `הקבוצה הביתית מגיעה עם מומנטום חיובי מהמחזורים האחרונים.`,
    `${home} מסתמכת על קו ההתקפה החזק, ${away} בונה על הגנה איתנה.`,
    `משחק מפתח להעפלה — שתי הקבוצות זקוקות לנקודות.`,
    `דרבי יבשתי שמבטיח אווירה חמה ביציעים ובבית.`,
  ];
  return phrases[(home.length + away.length) % phrases.length];
}

const RAW_GROUP_FIXTURES: [string, string[], string[], string[], string[], string[], string[]][] = [
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

const GROUP_DAYS = [
  "2026-06-11","2026-06-12","2026-06-13","2026-06-14","2026-06-15","2026-06-16",
  "2026-06-17","2026-06-18","2026-06-19","2026-06-20","2026-06-21","2026-06-22",
  "2026-06-23","2026-06-24","2026-06-25","2026-06-26","2026-06-27",
];
const GROUP_KICKOFFS = ["19:00","22:00","01:00","23:00","20:00","17:00"];
const VENUE_KEYS = Object.keys(VENUES);
const KO_KICKOFFS = ["20:00","23:00","02:00"];

function buildMatches(): Match[] {
  const matches: Match[] = [];
  let seq = 1;
  let venueIdx = 0;
  const push = (obj: Omit<Match, "id">) => matches.push({ id: "M" + String(seq++).padStart(3, "0"), ...obj });

  RAW_GROUP_FIXTURES.forEach((row, grpIdx) => {
    const grp = row[0];
    const fixtures = [row[1], row[2], row[3], row[4], row[5], row[6]];
    fixtures.forEach((pair, i) => {
      const dateStr = GROUP_DAYS[(grpIdx * 2 + Math.floor(i / 2)) % GROUP_DAYS.length];
      const time = GROUP_KICKOFFS[(grpIdx + i) % GROUP_KICKOFFS.length];
      const v = VENUE_KEYS[venueIdx++ % VENUE_KEYS.length];
      const isHost = HOST_TEAMS.has(pair[0]) || HOST_TEAMS.has(pair[1]);
      push({
        utc: isr(dateStr, time),
        stage: "GROUP",
        group: grp,
        home: pair[0],
        away: pair[1],
        venue: v,
        status: "scheduled",
        channels: pickChannels(seq, "GROUP", isHost),
        preGameMinutes: 30,
        studioShow: isHost ? "אולפן מונדיאל 2026" : null,
        odds: generateOdds(pair[0], pair[1]),
        aiInsight: generateInsight(pair[0], pair[1]),
      });
    });
  });

  const R32_PAIRS: [string, string][] = [
    ["1A","2B"],["1C","2D"],["1E","2F"],["1G","2H"],["1I","2J"],["1K","2L"],
    ["1B","3A/C/D/E"],["1D","3B/E/F"],["1F","3A/B/C/G"],["1H","3C/F/I/J"],
    ["1J","3D/E/H/K"],["1L","3F/G/J/L"],
    ["2A","2C"],["2E","2G"],["2I","2K"],["3C/D/H","3I/J/L"],
  ];
  const R32_DAYS = ["2026-06-28","2026-06-29","2026-06-30","2026-07-01","2026-07-02","2026-07-03"];
  R32_PAIRS.forEach((pair, i) => {
    const dateStr = R32_DAYS[Math.floor(i / 3) % R32_DAYS.length];
    const time = KO_KICKOFFS[i % KO_KICKOFFS.length];
    push({
      utc: isr(dateStr, time),
      stage: "R32",
      group: null,
      home: pair[0],
      away: pair[1],
      homeIsPlaceholder: true,
      awayIsPlaceholder: true,
      venue: VENUE_KEYS[(venueIdx + i) % VENUE_KEYS.length],
      status: "scheduled",
      channels: pickChannels(i, "R32", false),
      preGameMinutes: 45,
      studioShow: "אולפן נוקאאוט",
      odds: null,
      aiInsight: "שלב נוקאאוט — המנצח עולה הלאה.",
    });
  });

  const R16_DAYS = ["2026-07-04","2026-07-05","2026-07-06","2026-07-07"];
  for (let i = 0; i < 8; i++) {
    push({
      utc: isr(R16_DAYS[i % R16_DAYS.length], KO_KICKOFFS[i % 3]),
      stage: "R16",
      group: null,
      home: `W R32-${i*2+1}`,
      away: `W R32-${i*2+2}`,
      homeIsPlaceholder: true,
      awayIsPlaceholder: true,
      venue: VENUE_KEYS[(venueIdx + i + 5) % VENUE_KEYS.length],
      status: "scheduled",
      channels: pickChannels(i, "R16", false),
      preGameMinutes: 45,
      studioShow: "אולפן שמינית הגמר",
      odds: null,
      aiInsight: "שמינית הגמר — שמונה זוגות לקראת רבע הגמר.",
    });
  }

  const QF_DATES = ["2026-07-09","2026-07-09","2026-07-11","2026-07-11"];
  const QF_TIMES = ["19:00","23:00","19:00","23:00"];
  for (let i = 0; i < 4; i++) {
    push({
      utc: isr(QF_DATES[i], QF_TIMES[i]),
      stage: "QF",
      group: null,
      home: `W R16-${i*2+1}`,
      away: `W R16-${i*2+2}`,
      homeIsPlaceholder: true,
      awayIsPlaceholder: true,
      venue: VENUE_KEYS[(venueIdx + i + 9) % VENUE_KEYS.length],
      status: "scheduled",
      channels: pickChannels(i, "QF", false),
      preGameMinutes: 60,
      studioShow: "אולפן רבע הגמר",
      odds: null,
      aiInsight: "רבע הגמר — שמונה הקבוצות החזקות במונדיאל.",
    });
  }

  for (let i = 0; i < 2; i++) {
    push({
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

  push({
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

  push({
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

  return matches;
}

export const MATCHES: Match[] = buildMatches();
