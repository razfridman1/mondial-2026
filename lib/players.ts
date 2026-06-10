/* =====================================================================
 * Players & Squads — 23-man squad per country.
 * Top teams have curated real-star data; remaining teams use templates.
 * Each entry: id, name (Hebrew), nameEn, position, jerseyNumber, club, age, captain?
 * ===================================================================*/
import type { Team } from "./types";
import { TEAMS } from "./data";

export type Position = "GK" | "DEF" | "MID" | "FWD";

export interface Player {
  id: string;            // ISO3 + jersey eg "ARG10"
  teamCode: string;
  name: string;
  nameEn: string;
  position: Position;
  jersey?: number;       // for live players, filled in gradually via /api/cron/sync-player-details
  club?: string;         // their club in regular league — same enrichment for live players
  age: number;
  captain?: boolean;
  description?: string;  // short Hebrew bio
  live?: boolean;        // true = pulled live from football-data.org (official, English-only)
}

/* ---------- Curated squads (real stars from public knowledge) ---------- */

const ARG: Omit<Player, "teamCode" | "id">[] = [
  { name: "אמיליאנו מרטינס", nameEn: "Emiliano Martínez",  position: "GK",  jersey: 23, club: "אסטון וילה",   age: 33, description: "שוער מצטיין בכלל ההיסטוריה של הנבחרת, מקצוען בפנדלים." },
  { name: "ניקולאס אוטמנדי",  nameEn: "Nicolás Otamendi",    position: "DEF", jersey: 19, club: "בנפיקה",        age: 38, description: "מגן מנוסה, רוח לחימה אדירה." },
  { name: "קריסטיאן רומרו",    nameEn: "Cristian Romero",     position: "DEF", jersey: 13, club: "טוטנהאם",       age: 28, description: "מגן מרכזי תוקפני, ערני מאוד באוויר." },
  { name: "ניקו טליאפיקו",     nameEn: "Nicolás Tagliafico",  position: "DEF", jersey: 3,  club: "ליון",          age: 33, description: "מגן שמאלי קלאסי, חוצה היטב." },
  { name: "נחואל מולינה",      nameEn: "Nahuel Molina",       position: "DEF", jersey: 26, club: "אתלטיקו מדריד", age: 28, description: "מגן ימני מהיר ועולה הרבה." },
  { name: "רודריגו דה פאול",  nameEn: "Rodrigo De Paul",     position: "MID", jersey: 7,  club: "אתלטיקו מדריד", age: 31, description: "המנוע של קו האמצע, רץ ללא הפסקה." },
  { name: "אנצו פרננדס",       nameEn: "Enzo Fernández",      position: "MID", jersey: 24, club: "צ׳לסי",         age: 25, description: "קשר מרכזי משחק יפה ויודע להבקיע." },
  { name: "אלכסיס מק אליסטר", nameEn: "Alexis Mac Allister",  position: "MID", jersey: 20, club: "ליברפול",       age: 27, description: "קשר אינטליגנטי עם ראייה מצוינת." },
  { name: "ליונל מסי",         nameEn: "Lionel Messi",         position: "FWD", jersey: 10, club: "אינטר מיאמי",   age: 38, captain: true, description: "אחד הגדולים בכל הזמנים, מנהיג ומקצוען." },
  { name: "חוליאן אלוורס",     nameEn: "Julián Álvarez",       position: "FWD", jersey: 9,  club: "אתלטיקו מדריד", age: 26, description: "חלוץ צעיר מבריק, יודע להבקיע ולמסור." },
  { name: "לאוטרו מרטינס",     nameEn: "Lautaro Martínez",     position: "FWD", jersey: 22, club: "אינטר מילאנו",  age: 28, description: "חלוץ מרכזי קטלני." },
  { name: "פאולו דיבאלה",      nameEn: "Paulo Dybala",         position: "FWD", jersey: 21, club: "רומא",          age: 32, description: "חלוץ קטן ויצירתי עם בעיטה איכותית." },
];

const BRA: Omit<Player, "teamCode" | "id">[] = [
  { name: "אליסון בקר",         nameEn: "Alisson Becker",     position: "GK",  jersey: 1,  club: "ליברפול",      age: 33, description: "שוער מהטובים בעולם, רגוע ועקבי." },
  { name: "אדר מיליטאו",        nameEn: "Éder Militão",       position: "DEF", jersey: 3,  club: "ריאל מדריד",   age: 28, description: "מגן מרכזי מהיר וחזק." },
  { name: "מרקיניוס",           nameEn: "Marquinhos",         position: "DEF", jersey: 4,  club: "פ.ס.ז׳",       age: 31, captain: true, description: "קפטן וסמכות בקו ההגנה." },
  { name: "דניאלו",             nameEn: "Danilo",             position: "DEF", jersey: 13, club: "פלמיירס",     age: 34, description: "מגן רב-תכליתי." },
  { name: "ויניסיוס ג'וניור",  nameEn: "Vinícius Júnior",    position: "FWD", jersey: 7,  club: "ריאל מדריד",   age: 25, description: "כנף שמאל קטלני, מהיר ודריבל מצוין." },
  { name: "רודריגו",            nameEn: "Rodrygo",            position: "FWD", jersey: 9,  club: "ריאל מדריד",   age: 25, description: "חלוץ צעיר עם רגליים שמאל וימין שוות." },
  { name: "ראפיניה",            nameEn: "Raphinha",           position: "FWD", jersey: 11, club: "ברצלונה",      age: 29, description: "כנף ימין יוצר ומבקיע." },
  { name: "ברונו גימרייש",      nameEn: "Bruno Guimarães",    position: "MID", jersey: 5,  club: "ניוקאסל",      age: 28, description: "קשר עוגן עם מסירות חכמות." },
  { name: "קסמירו",             nameEn: "Casemiro",            position: "MID", jersey: 18, club: "מנצ׳סטר יונייטד", age: 34, description: "קשר הגנתי מהטובים בעולם." },
  { name: "לוקאס פאקטה",        nameEn: "Lucas Paquetá",       position: "MID", jersey: 7,  club: "ווסטהאם",      age: 28, description: "קשר התקפי טכני." },
  { name: "נימאר",              nameEn: "Neymar Jr",           position: "FWD", jersey: 10, club: "סנטוס",        age: 34, description: "אגדה בחיים, יוצר מבריק." },
];

const FRA: Omit<Player, "teamCode" | "id">[] = [
  { name: "מייק מניאן",         nameEn: "Mike Maignan",       position: "GK",  jersey: 16, club: "מילאן",        age: 30, description: "שוער איכותי, מנהיג מאחור." },
  { name: "ז׳ול קונדה",         nameEn: "Jules Koundé",       position: "DEF", jersey: 5,  club: "ברצלונה",     age: 27, description: "מגן רב-תכליתי, מצוין על הקו." },
  { name: "ויליאם סאליבה",      nameEn: "William Saliba",     position: "DEF", jersey: 17, club: "ארסנל",       age: 24, description: "מגן מרכזי צעיר ומסוגנן." },
  { name: "תאו ארננדס",          nameEn: "Theo Hernández",     position: "DEF", jersey: 22, club: "מילאן",       age: 28, description: "מגן שמאלי תוקפני, מהיר." },
  { name: "אורליין צואמני",     nameEn: "Aurélien Tchouaméni", position: "MID", jersey: 8,  club: "ריאל מדריד",  age: 26, description: "קשר הגנתי גבוה ועדין." },
  { name: "אנטואן גריזמן",      nameEn: "Antoine Griezmann",  position: "FWD", jersey: 7,  club: "אתלטיקו מדריד", age: 35, captain: true, description: "מוח החיבור של הנבחרת." },
  { name: "קיליאן אמבפה",       nameEn: "Kylian Mbappé",      position: "FWD", jersey: 10, club: "ריאל מדריד",   age: 27, captain: true, description: "אחד הכוכבים הגדולים של הדור." },
  { name: "ויסאם בן יאדר",      nameEn: "Wissam Ben Yedder",  position: "FWD", jersey: 12, club: "מונאקו",       age: 35, description: "חלוץ ותיק ופורה." },
  { name: "אדואן קמאווינגה",    nameEn: "Eduardo Camavinga",  position: "MID", jersey: 6,  club: "ריאל מדריד",   age: 23, description: "קשר צעיר טכני." },
  { name: "אוסמן דמבלה",         nameEn: "Ousmane Dembélé",   position: "FWD", jersey: 11, club: "פ.ס.ז׳",       age: 28, description: "כנף שתי הרגליים." },
];

const ENG: Omit<Player, "teamCode" | "id">[] = [
  { name: "ג׳ורדן פיקפורד",     nameEn: "Jordan Pickford",    position: "GK",  jersey: 1,  club: "אברטון",      age: 31, description: "שוער הנבחרת הקבוע." },
  { name: "קייל ווקר",          nameEn: "Kyle Walker",        position: "DEF", jersey: 2,  club: "מנצ׳סטר סיטי", age: 35, description: "מגן ימני מהיר מאוד." },
  { name: "ג׳ון סטונס",         nameEn: "John Stones",        position: "DEF", jersey: 5,  club: "מנצ׳סטר סיטי", age: 31, description: "מגן מרכזי טכני." },
  { name: "הארי מגווייר",       nameEn: "Harry Maguire",      position: "DEF", jersey: 6,  club: "מנצ׳סטר יונייטד", age: 32, description: "מנהיג ההגנה." },
  { name: "לוק שאו",            nameEn: "Luke Shaw",          position: "DEF", jersey: 3,  club: "מנצ׳סטר יונייטד", age: 30, description: "מגן שמאלי הגנתי-התקפי." },
  { name: "דקלן רייס",          nameEn: "Declan Rice",        position: "MID", jersey: 4,  club: "ארסנל",       age: 27, description: "מנוע קו האמצע." },
  { name: "ג׳וד בלינגהאם",      nameEn: "Jude Bellingham",    position: "MID", jersey: 10, club: "ריאל מדריד",  age: 22, description: "קשר התקפי גאוני." },
  { name: "פיל פודן",           nameEn: "Phil Foden",         position: "MID", jersey: 20, club: "מנצ׳סטר סיטי", age: 25, description: "יוצר משחק מבריק." },
  { name: "הארי קיין",          nameEn: "Harry Kane",         position: "FWD", jersey: 9,  club: "באיירן מינכן", age: 32, captain: true, description: "כוכב על וקפטן הנבחרת." },
  { name: "בוקאיו סאקה",        nameEn: "Bukayo Saka",        position: "FWD", jersey: 7,  club: "ארסנל",       age: 24, description: "כנף ימני סוחף." },
  { name: "מרקוס רשפורד",       nameEn: "Marcus Rashford",    position: "FWD", jersey: 11, club: "אסטון וילה",  age: 28, description: "חלוץ מהיר." },
];

const ESP: Omit<Player, "teamCode" | "id">[] = [
  { name: "אונאי סימון",       nameEn: "Unai Simón",         position: "GK",  jersey: 23, club: "אתלטיק בילבאו", age: 28, description: "שוער הנבחרת הקבוע." },
  { name: "דני קרבחאל",         nameEn: "Dani Carvajal",      position: "DEF", jersey: 2,  club: "ריאל מדריד",   age: 33, description: "מגן ימני אגדי." },
  { name: "אימריק לאפורט",     nameEn: "Aymeric Laporte",    position: "DEF", jersey: 14, club: "אל נסר",       age: 31, description: "מגן מרכזי איכותי." },
  { name: "פאו טורס",            nameEn: "Pau Torres",         position: "DEF", jersey: 4,  club: "אסטון וילה",   age: 28, description: "מגן רגל שמאל." },
  { name: "רודרי",              nameEn: "Rodri",              position: "MID", jersey: 16, club: "מנצ׳סטר סיטי", age: 29, captain: true, description: "זוכה כדור הזהב 2024." },
  { name: "פדרי",               nameEn: "Pedri",              position: "MID", jersey: 8,  club: "ברצלונה",     age: 23, description: "קשר טכני מבריק." },
  { name: "גאבי",               nameEn: "Gavi",               position: "MID", jersey: 6,  club: "ברצלונה",     age: 21, description: "כשרון צעיר." },
  { name: "למין ימאל",          nameEn: "Lamine Yamal",       position: "FWD", jersey: 19, club: "ברצלונה",     age: 18, description: "כוכב צעיר עם פוטנציאל אדיר." },
  { name: "אלברו מורטה",        nameEn: "Álvaro Morata",      position: "FWD", jersey: 7,  club: "מילאן",        age: 33, description: "חלוץ מנוסה." },
  { name: "ניקו ויליאמס",       nameEn: "Nico Williams",      position: "FWD", jersey: 17, club: "אתלטיק בילבאו", age: 23, description: "כנף שמאל ספרינטר." },
  { name: "פראן טורס",           nameEn: "Ferran Torres",      position: "FWD", jersey: 11, club: "ברצלונה",     age: 26, description: "חלוץ רב-תכליתי." },
];

const GER: Omit<Player, "teamCode" | "id">[] = [
  { name: "אנטוניו רודיגר",    nameEn: "Antonio Rüdiger",    position: "DEF", jersey: 2,  club: "ריאל מדריד",   age: 33, description: "מגן מרכזי קשוח." },
  { name: "ג׳ושוע קימיך",       nameEn: "Joshua Kimmich",     position: "MID", jersey: 6,  club: "באיירן מינכן", age: 31, captain: true, description: "קשר רב-תכליתי." },
  { name: "פלוריאן וירץ",       nameEn: "Florian Wirtz",      position: "MID", jersey: 17, club: "לברקוזן",      age: 22, description: "כשרון צעיר מבריק." },
  { name: "ג׳מאל מוסיאלה",     nameEn: "Jamal Musiala",      position: "MID", jersey: 10, club: "באיירן מינכן", age: 23, description: "דריבלר מצוין." },
  { name: "קאי האברץ",          nameEn: "Kai Havertz",        position: "FWD", jersey: 7,  club: "ארסנל",        age: 26, description: "חלוץ רב-תכליתי." },
  { name: "ניקלאס פולקרוג",   nameEn: "Niclas Füllkrug",    position: "FWD", jersey: 9,  club: "ווסטהאם",      age: 32, description: "תשע קלאסי." },
  { name: "ליירוי סאנה",         nameEn: "Leroy Sané",         position: "FWD", jersey: 19, club: "באיירן מינכן", age: 30, description: "כנף ימני מהיר." },
];

const POR: Omit<Player, "teamCode" | "id">[] = [
  { name: "דיוגו קוסטה",       nameEn: "Diogo Costa",         position: "GK",  jersey: 22, club: "פורטו",        age: 26, description: "שוער הנבחרת." },
  { name: "רובן דיאש",          nameEn: "Rúben Dias",          position: "DEF", jersey: 4,  club: "מנצ׳סטר סיטי", age: 28, description: "מגן מרכזי מצטיין." },
  { name: "ז׳ואאו קנסלו",      nameEn: "João Cancelo",        position: "DEF", jersey: 20, club: "אל היליל",     age: 31, description: "מגן רב-תכליתי." },
  { name: "ברנרדו סילבה",     nameEn: "Bernardo Silva",      position: "MID", jersey: 10, club: "מנצ׳סטר סיטי",  age: 31, description: "יוצר אומנותי." },
  { name: "ברונו פרננדס",     nameEn: "Bruno Fernandes",     position: "MID", jersey: 8,  club: "מנצ׳סטר יונייטד", age: 31, captain: true, description: "מסירות חורבן." },
  { name: "ויטיניה",            nameEn: "Vitinha",             position: "MID", jersey: 16, club: "פ.ס.ז׳",        age: 26, description: "קשר טכני." },
  { name: "כריסטיאנו רונאלדו", nameEn: "Cristiano Ronaldo",   position: "FWD", jersey: 7,  club: "אל נסר",       age: 41, description: "אחד הגדולים בכל הזמנים." },
  { name: "רפאל ליאו",          nameEn: "Rafael Leão",         position: "FWD", jersey: 17, club: "מילאן",         age: 26, description: "כנף שמאל מהיר." },
  { name: "ז׳ואאו פליקס",       nameEn: "João Félix",          position: "FWD", jersey: 11, club: "ברצלונה",      age: 26, description: "חלוץ צעיר טכני." },
];

const NED: Omit<Player, "teamCode" | "id">[] = [
  { name: "ברט ורברוגן",       nameEn: "Bart Verbruggen",      position: "GK",  jersey: 23, club: "בריטון",       age: 23, description: "שוער צעיר וטוב." },
  { name: "וירג׳יל ואן דייק",  nameEn: "Virgil van Dijk",       position: "DEF", jersey: 4,  club: "ליברפול",      age: 34, captain: true, description: "מנהיג ההגנה." },
  { name: "מאתייז דה ליחט",     nameEn: "Matthijs de Ligt",     position: "DEF", jersey: 3,  club: "מנצ׳סטר יונייטד", age: 26, description: "מגן צעיר וחזק." },
  { name: "פרנקי דה יונג",      nameEn: "Frenkie de Jong",      position: "MID", jersey: 21, club: "ברצלונה",      age: 28, description: "קשר טכני." },
  { name: "טייוון קוופמינרס",  nameEn: "Teun Koopmeiners",      position: "MID", jersey: 14, club: "יובנטוס",      age: 27, description: "קשר התקפי." },
  { name: "כודי חאקפו",         nameEn: "Cody Gakpo",           position: "FWD", jersey: 8,  club: "ליברפול",      age: 26, description: "כנף שמאלי גבוה." },
  { name: "ממפיס דפאי",         nameEn: "Memphis Depay",        position: "FWD", jersey: 10, club: "קורינתיאנס",   age: 31, description: "חלוץ פורה." },
  { name: "חוויר חאקפו",         nameEn: "Donyell Malen",        position: "FWD", jersey: 18, club: "דורטמונד",     age: 26, description: "כנף ימין מהיר." },
];

const ITA: Omit<Player, "teamCode" | "id">[] = [
  { name: "ג׳ני דונארומה",       nameEn: "Gianluigi Donnarumma", position: "GK",  jersey: 1,  club: "פ.ס.ז׳",       age: 27, description: "שוער הנבחרת." },
  { name: "ג׳ובאני די לורנצו",  nameEn: "Giovanni Di Lorenzo",   position: "DEF", jersey: 2,  club: "נאפולי",       age: 32, description: "מגן ימני יציב." },
  { name: "אלסנדרו בסטוני",      nameEn: "Alessandro Bastoni",    position: "DEF", jersey: 23, club: "אינטר",        age: 27, description: "מגן מרכזי שמאלי." },
  { name: "ניקולו ברלה",          nameEn: "Nicolò Barella",        position: "MID", jersey: 18, club: "אינטר",        age: 29, description: "מנוע קו האמצע." },
  { name: "ג׳קומו ראספאדורי",   nameEn: "Giacomo Raspadori",     position: "FWD", jersey: 18, club: "אטלנטה",       age: 26, description: "חלוץ קטן ומהיר." },
  { name: "פדריקו קייסה",         nameEn: "Federico Chiesa",       position: "FWD", jersey: 14, club: "ליברפול",      age: 28, description: "כנף ימני אקרובט." },
];

const MEX: Omit<Player, "teamCode" | "id">[] = [
  { name: "סזאר מונטס",          nameEn: "César Montes",         position: "DEF", jersey: 3,  club: "אלמרייה",      age: 28, description: "מגן מרכזי גבוה." },
  { name: "אדסון אלוורז",         nameEn: "Edson Álvarez",        position: "MID", jersey: 4,  club: "ווסטהאם",      age: 28, captain: true, description: "קפטן הנבחרת." },
  { name: "אורבליס פינדה",        nameEn: "Orbelín Pineda",       position: "MID", jersey: 8,  club: "אאק אתונה",   age: 30, description: "קשר טכני." },
  { name: "אנטוני מרטיאל",        nameEn: "Henry Martín",         position: "FWD", jersey: 21, club: "אמריקה",       age: 33, description: "תשע פורה." },
  { name: "סנטיאגו חימנס",        nameEn: "Santiago Giménez",     position: "FWD", jersey: 9,  club: "פיינורד",      age: 25, description: "חלוץ צעיר ובוקע." },
];

const USA: Omit<Player, "teamCode" | "id">[] = [
  { name: "מאט טרנר",           nameEn: "Matt Turner",          position: "GK",  jersey: 1,  club: "נוטינגהאם",     age: 31, description: "שוער הנבחרת." },
  { name: "סרחיני דסט",           nameEn: "Sergiño Dest",         position: "DEF", jersey: 2,  club: "PSV",          age: 25, description: "מגן ימני מהיר." },
  { name: "טים ריים",             nameEn: "Tim Ream",             position: "DEF", jersey: 13, club: "פולהאם",       age: 38, description: "מנהיג ההגנה." },
  { name: "טיילר אדמס",            nameEn: "Tyler Adams",          position: "MID", jersey: 4,  club: "בורנמות׳",     age: 27, captain: true, description: "קפטן הנבחרת." },
  { name: "וסטון מק קני",         nameEn: "Weston McKennie",      position: "MID", jersey: 8,  club: "יובנטוס",      age: 27, description: "קשר רב-תכליתי." },
  { name: "כריסטיאן פוליסיץ׳",   nameEn: "Christian Pulisic",     position: "FWD", jersey: 10, club: "מילאן",         age: 27, description: "כוכב על הנבחרת." },
  { name: "טימותי ווה",             nameEn: "Timothy Weah",          position: "FWD", jersey: 21, club: "יובנטוס",      age: 25, description: "כנף ימני." },
  { name: "ג׳ובאני ריינה",         nameEn: "Giovanni Reyna",        position: "MID", jersey: 7,  club: "דורטמונד",     age: 23, description: "כשרון יצירתי." },
];

const CAN: Omit<Player, "teamCode" | "id">[] = [
  { name: "אלפונסו דייוויס",      nameEn: "Alphonso Davies",       position: "DEF", jersey: 19, club: "באיירן מינכן",  age: 25, description: "מגן שמאלי מהיר עד מאוד." },
  { name: "ג׳ונתן דייוויד",         nameEn: "Jonathan David",        position: "FWD", jersey: 20, club: "ליל",           age: 25, captain: true, description: "כוכב התקפה ופורה." },
  { name: "סיריל לרין",              nameEn: "Cyle Larin",            position: "FWD", jersey: 17, club: "מאיורקה",       age: 30, description: "חלוץ מנוסה." },
  { name: "טייסון דייוויס",          nameEn: "Tajon Buchanan",        position: "FWD", jersey: 11, club: "אינטר",         age: 26, description: "כנף ימני מהיר." },
];

const RSA: Omit<Player, "teamCode" | "id">[] = [
  { name: "רונוון וויליאמס",     nameEn: "Ronwen Williams",     position: "GK",  jersey: 1,  club: "מאמלודי סנדאונס", age: 34, captain: true, description: "קפטן הנבחרת ושוער-על, גיבור חטיפת הפנדלים באפקון 2023." },
  { name: "חוליסו מודאו",        nameEn: "Khuliso Mudau",       position: "DEF", jersey: 20, club: "מאמלודי סנדאונס", age: 29, description: "מגן ימני יציב, אלוף אפריקה עם סנדאונס." },
  { name: "אובריי מודיבה",       nameEn: "Aubrey Modiba",       position: "DEF", jersey: 6,  club: "מאמלודי סנדאונס", age: 31, description: "מגן שמאלי מנוסה ועולה היטב." },
  { name: "חולומאני נדמאנה",     nameEn: "Khulumani Ndamane",   position: "DEF", jersey: 3,  club: "מאמלודי סנדאונס", age: 27, description: "מגן מרכזי חזק באוויר." },
  { name: "מבקזלי מבוקאזי",      nameEn: "Mbekezeli Mbokazi",   position: "DEF", jersey: 14, club: "שיקגו פייר",      age: 19, description: "מגן צעיר ומבטיח, עבר ל-MLS." },
  { name: "טבוהו מוקואנה",       nameEn: "Teboho Mokoena",      position: "MID", jersey: 4,  club: "מאמלודי סנדאונס", age: 29, description: "המנוע של קו האמצע, אנרגטי ומבקיע." },
  { name: "תלנטה מבאטה",         nameEn: "Thalente Mbatha",     position: "MID", jersey: 5,  club: "אורלנדו פיירטס",  age: 26, description: "קשר יצירתי עם מסירות מדויקות." },
  { name: "ג׳יידן אדמס",         nameEn: "Jayden Adams",        position: "MID", jersey: 23, club: "מאמלודי סנדאונס", age: 24, description: "קשר צעיר, טכני ונע היטב בין הקווים." },
  { name: "לייל פוסטר",          nameEn: "Lyle Foster",         position: "FWD", jersey: 9,  club: "ברנלי",           age: 26, description: "החלוץ היחיד מליגה מובילה באירופה, חזק במשחק גב לשער." },
  { name: "רלבוהילה מופוקנג",    nameEn: "Relebohile Mofokeng", position: "FWD", jersey: 10, club: "אורלנדו פיירטס",  age: 21, description: "כשרון צעיר ומסוכן, עיטור מספר 10." },
  { name: "אוסווין אפוליס",      nameEn: "Oswin Appollis",      position: "FWD", jersey: 7,  club: "אורלנדו פיירטס",  age: 24, description: "כנף מהיר ועקבי, מאיים על הביצועים." },
  { name: "תמבה זוואנה",         nameEn: "Themba Zwane",        position: "FWD", jersey: 11, club: "מאמלודי סנדאונס", age: 37, description: "ותיק הסגל, יצירתי וטכני." },
];

/* NOTE: NO template/fake players. Teams without a curated squad get an empty list,
 * and the UI shows "הסגל הסופי טרם פורסם".
 * All squads are PRELIMINARY — FIFA's official 26-man rosters are announced ~יוני 2026. */

/* ---------- Build squads (only curated/verified teams have entries) ---------- */
const CURATED: Record<string, Omit<Player, "teamCode" | "id">[]> = {
  ARG, BRA, FRA, ENG, ESP, GER, POR, NED, ITA, MEX, USA, CAN, RSA,
};

export const VERIFIED_TEAMS = new Set(Object.keys(CURATED));

export const SQUADS: Record<string, Player[]> = (() => {
  const out: Record<string, Player[]> = {};
  Object.values(TEAMS).forEach(team => {
    const list = CURATED[team.code];
    if (!list) { out[team.code] = []; return; }   // unverified → empty
    out[team.code] = list.map((p, idx) => ({
      ...p,
      teamCode: team.code,
      id: `${team.code}${String(p.jersey).padStart(2, "0")}_${idx}`,
    }));
  });
  return out;
})();

/* Normalize a player name for de-duplication when merging curated Hebrew
 * star data with the live football-data.org roster: strip diacritics,
 * lowercase, drop common suffixes (Jr., Júnior…), and collapse whitespace. */
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(jr\.?|junior|i{2,3})\b/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- Public API ----------
 * `liveSquads` (when provided) holds official ~26-man rosters pulled live
 * from football-data.org for ALL 48 teams. For teams without hand-curated
 * Hebrew data, this IS the squad. For curated teams, the curated stars
 * (richer: Hebrew names, jerseys, clubs, bios) are shown first, and any
 * live-roster players not already covered are appended — so the full
 * squad is visible even though only a handful of stars have curated bios. */
export function squadFor(teamCode: string, liveSquads?: Record<string, Player[]>): Player[] {
  const curated = SQUADS[teamCode] || [];
  const live = liveSquads?.[teamCode] || [];
  if (!curated.length) return live;
  if (!live.length) return curated;
  const curatedNames = new Set(curated.map(p => normalizeName(p.nameEn)));
  const extra = live.filter(p => !curatedNames.has(normalizeName(p.nameEn)));
  return [...curated, ...extra];
}

export function hasVerifiedSquad(teamCode: string, liveSquads?: Record<string, Player[]>): boolean {
  return VERIFIED_TEAMS.has(teamCode) || !!(liveSquads?.[teamCode]?.length);
}

/** Status of the squad data for a given team.
 *  - "preliminary": hand-curated Hebrew data (top teams)
 *  - "live": official roster pulled live from football-data.org
 *  - "not-announced": no data available yet */
export type SquadStatus = "preliminary" | "live" | "not-announced";
export function squadStatus(teamCode: string, liveSquads?: Record<string, Player[]>): SquadStatus {
  if (VERIFIED_TEAMS.has(teamCode)) return "preliminary";
  if (liveSquads?.[teamCode]?.length) return "live";
  return "not-announced";
}

export function playerById(id: string): Player | undefined {
  for (const list of Object.values(SQUADS)) {
    const p = list.find(x => x.id === id);
    if (p) return p;
  }
  return undefined;
}

/* ---------- Head coaches (preliminary, curated teams) ----------
 * Real, publicly-known head coaches as of the 2025/26 cycle. Like the
 * squads, this is preliminary reference data and may change before the
 * tournament. Teams without a curated coach return null → UI shows
 * "טרם פורסם". */
export interface Coach {
  name: string;     // Hebrew
  nameEn: string;
  nationality: string; // Hebrew nationality
  flag: string;
}

const COACHES: Record<string, Coach> = {
  ARG: { name: "ליונל סקלוני",        nameEn: "Lionel Scaloni",      nationality: "ארגנטינה", flag: "🇦🇷" },
  BRA: { name: "קרלו אנצ׳לוטי",       nameEn: "Carlo Ancelotti",     nationality: "איטליה",   flag: "🇮🇹" },
  FRA: { name: "דידייה דשאם",         nameEn: "Didier Deschamps",    nationality: "צרפת",     flag: "🇫🇷" },
  ENG: { name: "תומאס טוכל",          nameEn: "Thomas Tuchel",       nationality: "גרמניה",   flag: "🇩🇪" },
  ESP: { name: "לואיס דה לה פואנטה",  nameEn: "Luis de la Fuente",   nationality: "ספרד",     flag: "🇪🇸" },
  GER: { name: "יוליאן נגלסמן",       nameEn: "Julian Nagelsmann",   nationality: "גרמניה",   flag: "🇩🇪" },
  POR: { name: "רוברטו מרטינס",       nameEn: "Roberto Martínez",    nationality: "ספרד",     flag: "🇪🇸" },
  NED: { name: "רונלד קומאן",         nameEn: "Ronald Koeman",       nationality: "הולנד",    flag: "🇳🇱" },
  MEX: { name: "חאבייר אגירה",        nameEn: "Javier Aguirre",      nationality: "מקסיקו",   flag: "🇲🇽" },
  USA: { name: "מאוריסיו פוצ׳טינו",   nameEn: "Mauricio Pochettino", nationality: "ארגנטינה", flag: "🇦🇷" },
  CAN: { name: "ג׳סי מארש",           nameEn: "Jesse Marsch",        nationality: "ארה״ב",    flag: "🇺🇸" },
  RSA: { name: "הוגו ברוס",           nameEn: "Hugo Broos",          nationality: "בלגיה",    flag: "🇧🇪" },
};

export function coachFor(teamCode: string, liveCoaches?: Record<string, Coach>): Coach | null {
  return COACHES[teamCode] || liveCoaches?.[teamCode] || null;
}

export function teamsByGroup(): Record<string, Team[]> {
  const map: Record<string, Team[]> = {};
  Object.values(TEAMS).forEach(t => {
    const g = t.group || "?";
    (map[g] = map[g] || []).push(t);
  });
  return map;
}
