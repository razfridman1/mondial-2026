/* =====================================================================
 * Legendary player avatars — 20 iconic figures. Each is rendered as a
 * stylized SVG inline (no external assets), with signature color scheme
 * and jersey number to make them recognizable at small sizes.
 * ===================================================================*/

export interface Avatar {
  id: string;
  name: string;       // Hebrew display name
  nameEn: string;
  era: string;        // active years
  flag: string;
  signature: string;  // very short hebrew tagline
  /** Build the SVG (used by both Header and AvatarPicker) */
  svg: (size: number) => string;
}

/* Helper to build a stylized circular avatar with jersey + initials */
function makeAvatar(opts: {
  bg: [string, string];      // gradient
  jersey: string;
  jerseyColor: string;
  hairColor: string;
  skinTone: string;
}): (size: number) => string {
  const { bg, jersey, jerseyColor, hairColor, skinTone } = opts;
  return (size = 80) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg-${jersey}-${bg[0].replace('#','')}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"  stop-color="${bg[0]}"/>
      <stop offset="100%" stop-color="${bg[1]}"/>
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="49" fill="url(#bg-${jersey}-${bg[0].replace('#','')})"/>
  <!-- hair -->
  <ellipse cx="50" cy="34" rx="18" ry="14" fill="${hairColor}"/>
  <!-- head -->
  <circle cx="50" cy="42" r="14" fill="${skinTone}"/>
  <!-- hair fringe -->
  <path d="M 35 36 Q 50 28 65 36 L 60 42 Q 50 38 40 42 Z" fill="${hairColor}"/>
  <!-- jersey collar -->
  <path d="M 30 70 Q 50 60 70 70 L 70 95 L 30 95 Z" fill="${jerseyColor}"/>
  <!-- neck -->
  <rect x="44" y="54" width="12" height="8" fill="${skinTone}"/>
  <!-- jersey number -->
  <text x="50" y="86" text-anchor="middle" font-family="Heebo, Arial, sans-serif" font-weight="900" font-size="14" fill="white">${jersey}</text>
</svg>`;
}

/* Avatars catalog */
export const AVATARS: Avatar[] = [
  { id: "messi",     name: "ליונל מסי",        nameEn: "Lionel Messi",       era: "2003-עכשיו", flag: "🇦🇷", signature: "הקסם של ארגנטינה",
    svg: makeAvatar({ bg: ["#6caedd","#1e3a8a"], jersey: "10", jerseyColor: "#6caedd", hairColor: "#5a4327", skinTone: "#f4c6a2" }) },
  { id: "cr7",       name: "כריסטיאנו רונאלדו",nameEn: "Cristiano Ronaldo",  era: "2003-עכשיו", flag: "🇵🇹", signature: "Sii-Uuu",
    svg: makeAvatar({ bg: ["#dc2626","#0a3a1a"], jersey: "7",  jerseyColor: "#dc2626", hairColor: "#2a1a10", skinTone: "#e8b88b" }) },
  { id: "r9",        name: "רונאלדו הברזילאי", nameEn: "Ronaldo Nazário",     era: "1993-2011",  flag: "🇧🇷", signature: "התופעה",
    svg: makeAvatar({ bg: ["#ffd24a","#005f3a"], jersey: "9",  jerseyColor: "#ffd24a", hairColor: "#1a0e08", skinTone: "#cd966e" }) },
  { id: "maradona",  name: "דייגו מראדונה",    nameEn: "Diego Maradona",      era: "1976-1997",  flag: "🇦🇷", signature: "יד האל ו'גול המאה'",
    svg: makeAvatar({ bg: ["#6caedd","#fff"],    jersey: "10", jerseyColor: "#6caedd", hairColor: "#1a1208", skinTone: "#e8c2a0" }) },
  { id: "neymar",    name: "ניימר ג׳וניור",    nameEn: "Neymar Jr",           era: "2009-עכשיו", flag: "🇧🇷", signature: "קסם וטריקים",
    svg: makeAvatar({ bg: ["#facc15","#15803d"], jersey: "10", jerseyColor: "#facc15", hairColor: "#1a0e08", skinTone: "#c89070" }) },
  { id: "mbappe",    name: "קיליאן אמבפה",     nameEn: "Kylian Mbappé",       era: "2015-עכשיו", flag: "🇫🇷", signature: "המהיר ביותר",
    svg: makeAvatar({ bg: ["#1e40af","#fff"],    jersey: "10", jerseyColor: "#1e40af", hairColor: "#1a0e08", skinTone: "#a67450" }) },
  { id: "haaland",   name: "ארלינג הולאנד",   nameEn: "Erling Haaland",      era: "2019-עכשיו", flag: "🇳🇴", signature: "מכונת השערים",
    svg: makeAvatar({ bg: ["#0284c7","#dc2626"], jersey: "9",  jerseyColor: "#0284c7", hairColor: "#f5deb3", skinTone: "#fadcc0" }) },
  { id: "pele",      name: "פלה",              nameEn: "Pelé",                 era: "1957-1977",  flag: "🇧🇷", signature: "המלך",
    svg: makeAvatar({ bg: ["#ffd24a","#0a4d2a"], jersey: "10", jerseyColor: "#ffd24a", hairColor: "#1a0e08", skinTone: "#b88060" }) },
  { id: "ronaldinho",name: "רונאלדיניו",       nameEn: "Ronaldinho",          era: "1999-2018",  flag: "🇧🇷", signature: "החיוך והגאוניות",
    svg: makeAvatar({ bg: ["#facc15","#0d8836"], jersey: "10", jerseyColor: "#facc15", hairColor: "#1a0e08", skinTone: "#c89070" }) },
  { id: "zidane",    name: "זינדין זידאן",    nameEn: "Zinedine Zidane",     era: "1989-2006",  flag: "🇫🇷", signature: "אלגנטיות צרפתית",
    svg: makeAvatar({ bg: ["#1e40af","#dc2626"], jersey: "10", jerseyColor: "#1e40af", hairColor: "#3a2a1a", skinTone: "#d8a878" }) },
  { id: "cruyff",    name: "יוהאן קרויף",      nameEn: "Johan Cruyff",        era: "1964-1984",  flag: "🇳🇱", signature: "כדורגל טוטאלי",
    svg: makeAvatar({ bg: ["#f97316","#fff"],    jersey: "14", jerseyColor: "#f97316", hairColor: "#3a2a1a", skinTone: "#f4d2a8" }) },
  { id: "beckenbauer",name: "פרנץ בקנבאואר",  nameEn: "Franz Beckenbauer",   era: "1964-1983",  flag: "🇩🇪", signature: "הקיסר",
    svg: makeAvatar({ bg: ["#1a1a1a","#dc2626"], jersey: "5",  jerseyColor: "#fff",    hairColor: "#f4d28a", skinTone: "#f8d8b0" }) },
  { id: "iniesta",   name: "אנדרס איניאסטה", nameEn: "Andrés Iniesta",      era: "2001-עכשיו", flag: "🇪🇸", signature: "המוח של ספרד",
    svg: makeAvatar({ bg: ["#dc2626","#facc15"], jersey: "6",  jerseyColor: "#dc2626", hairColor: "#5a3a20", skinTone: "#f4d2a8" }) },
  { id: "xavi",      name: "צ׳אבי הרננדס",     nameEn: "Xavi Hernández",      era: "1998-2019",  flag: "🇪🇸", signature: "המעביר המושלם",
    svg: makeAvatar({ bg: ["#1e3a8a","#dc2626"], jersey: "6",  jerseyColor: "#1e3a8a", hairColor: "#1a0e08", skinTone: "#e8c2a0" }) },
  { id: "lewandowski",name:"רוברט לבנדובסקי",nameEn: "Robert Lewandowski",  era: "2008-עכשיו", flag: "🇵🇱", signature: "התשע המושלם",
    svg: makeAvatar({ bg: ["#dc2626","#fff"],    jersey: "9",  jerseyColor: "#dc2626", hairColor: "#3a2a1a", skinTone: "#fadcc0" }) },
  { id: "salah",     name: "מוחמד סלאח",       nameEn: "Mohamed Salah",       era: "2010-עכשיו", flag: "🇪🇬", signature: "הפרעון",
    svg: makeAvatar({ bg: ["#dc2626","#000"],    jersey: "11", jerseyColor: "#dc2626", hairColor: "#1a0e08", skinTone: "#c89070" }) },
  { id: "kdb",       name: "קווין דה ברוין",   nameEn: "Kevin De Bruyne",     era: "2008-עכשיו", flag: "🇧🇪", signature: "האסיסט-קינג",
    svg: makeAvatar({ bg: ["#7dd3fc","#1e40af"], jersey: "17", jerseyColor: "#7dd3fc", hairColor: "#e3a85a", skinTone: "#fadcc0" }) },
  { id: "modric",    name: "לוקה מודריץ׳",    nameEn: "Luka Modrić",         era: "2003-עכשיו", flag: "🇭🇷", signature: "המאסטרו",
    svg: makeAvatar({ bg: ["#dc2626","#fff"],    jersey: "10", jerseyColor: "#dc2626", hairColor: "#d4a86a", skinTone: "#f4d2a8" }) },
  { id: "bellingham",name: "ג׳וד בלינגהאם",   nameEn: "Jude Bellingham",     era: "2019-עכשיו", flag: "🏴",  signature: "כוכב הדור הבא",
    svg: makeAvatar({ bg: ["#fff","#dc2626"],    jersey: "10", jerseyColor: "#fff",    hairColor: "#1a0e08", skinTone: "#a67450" }) },
  { id: "vinicius",  name: "ויניסיוס ג׳וניור",nameEn: "Vinícius Júnior",     era: "2017-עכשיו", flag: "🇧🇷", signature: "הברק של ריאל",
    svg: makeAvatar({ bg: ["#facc15","#0a4d2a"], jersey: "7",  jerseyColor: "#facc15", hairColor: "#1a0e08", skinTone: "#8a5a3a" }) },
];

export function getAvatar(id: string): Avatar | undefined {
  return AVATARS.find(a => a.id === id);
}

export function defaultAvatarId(): string {
  return "messi";
}
