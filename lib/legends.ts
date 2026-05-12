/* =====================================================================
 * 30 Football Legends of the last 20 years — used by <LegendsBackground/>
 *
 * Image URLs point to Wikimedia Commons thumbnails. Wikimedia explicitly
 * permits hotlinking to /upload.wikimedia.org/. If a URL ever 404s the
 * component automatically falls back to a silhouette + initials + jersey.
 *
 * If you want to swap any image: replace `imageUrl` below with any
 * publicly hotlinkable URL of your choice.
 * ===================================================================*/

export interface LegendImage {
  name: string;        // Hebrew name for tooltip
  surname: string;     // Caps Latin for tile label
  jersey: string;
  flag: string;
  era: string;
  imageUrl: string;    // primary photo
}

const W = "https://upload.wikimedia.org/wikipedia/commons/thumb";

export const LEGENDS: LegendImage[] = [
  // === Active modern legends ===
  { name: "ליונל מסי",        surname: "MESSI",        jersey: "10", flag: "🇦🇷", era: "2003–",
    imageUrl: `${W}/c/c1/Lionel_Messi_20180626.jpg/280px-Lionel_Messi_20180626.jpg` },
  { name: "כריסטיאנו רונאלדו", surname: "RONALDO",     jersey: "7",  flag: "🇵🇹", era: "2003–",
    imageUrl: `${W}/8/8c/Cristiano_Ronaldo_2018.jpg/280px-Cristiano_Ronaldo_2018.jpg` },
  { name: "ניימר",             surname: "NEYMAR",       jersey: "10", flag: "🇧🇷", era: "2009–",
    imageUrl: `${W}/5/5e/Bra-Cos_%2811%29.jpg/280px-Bra-Cos_%2811%29.jpg` },
  { name: "קיליאן אמבפה",      surname: "MBAPPÉ",       jersey: "10", flag: "🇫🇷", era: "2015–",
    imageUrl: `${W}/4/47/Kylian_Mbappé_2018.jpg/280px-Kylian_Mbappé_2018.jpg` },
  { name: "ארלינג הולאנד",     surname: "HAALAND",      jersey: "9",  flag: "🇳🇴", era: "2019–",
    imageUrl: `${W}/3/35/Erling_Haaland_2023_%28cropped%29.jpg/280px-Erling_Haaland_2023_%28cropped%29.jpg` },

  // === Recent retired or near-end greats ===
  { name: "זינדין זידאן",      surname: "ZIDANE",       jersey: "10", flag: "🇫🇷", era: "1989–2006",
    imageUrl: `${W}/4/40/Zidane_at_a_Real_Madrid_training_session.jpg/280px-Zidane_at_a_Real_Madrid_training_session.jpg` },
  { name: "רונאלדו הברזילאי", surname: "R9",           jersey: "9",  flag: "🇧🇷", era: "1993–2011",
    imageUrl: `${W}/5/56/Ronaldo2008.jpg/280px-Ronaldo2008.jpg` },
  { name: "רונאלדיניו",        surname: "RONALDINHO",   jersey: "10", flag: "🇧🇷", era: "1999–2018",
    imageUrl: `${W}/9/9c/Ronaldinho_in_2019.jpg/280px-Ronaldinho_in_2019.jpg` },
  { name: "אנדרס איניאסטה",   surname: "INIESTA",      jersey: "6",  flag: "🇪🇸", era: "2001–2023",
    imageUrl: `${W}/c/cf/Andrés_Iniesta_2018.jpg/280px-Andrés_Iniesta_2018.jpg` },
  { name: "צ׳אבי הרננדס",      surname: "XAVI",         jersey: "8",  flag: "🇪🇸", era: "1998–2019",
    imageUrl: `${W}/3/3c/Xavi_Hernández_-_001.jpg/280px-Xavi_Hernández_-_001.jpg` },
  { name: "אנדריאה פירלו",     surname: "PIRLO",        jersey: "21", flag: "🇮🇹", era: "1995–2017",
    imageUrl: `${W}/3/33/Andrea_Pirlo_-_Italia_Mondiali_2014.jpg/280px-Andrea_Pirlo_-_Italia_Mondiali_2014.jpg` },
  { name: "ג׳אנלואיג׳י בופון",  surname: "BUFFON",      jersey: "1",  flag: "🇮🇹", era: "1995–2023",
    imageUrl: `${W}/0/04/Gianluigi_Buffon_2017.jpg/280px-Gianluigi_Buffon_2017.jpg` },
  { name: "איקר קסיאס",         surname: "CASILLAS",    jersey: "1",  flag: "🇪🇸", era: "1999–2020",
    imageUrl: `${W}/c/c4/Iker_Casillas_with_Real_Madrid_in_2010.jpg/280px-Iker_Casillas_with_Real_Madrid_in_2010.jpg` },
  { name: "סרחיו ראמוס",        surname: "RAMOS",       jersey: "4",  flag: "🇪🇸", era: "2004–",
    imageUrl: `${W}/d/dc/Sergio_Ramos_Euro_2016.jpg/280px-Sergio_Ramos_Euro_2016.jpg` },
  { name: "טיירי אנרי",          surname: "HENRY",       jersey: "14", flag: "🇫🇷", era: "1994–2014",
    imageUrl: `${W}/b/b2/Thierry_Henry_2008.jpg/280px-Thierry_Henry_2008.jpg` },
  { name: "קאקא",                surname: "KAKÁ",        jersey: "22", flag: "🇧🇷", era: "2001–2017",
    imageUrl: `${W}/6/6a/Kaká_lateral_2009.jpg/280px-Kaká_lateral_2009.jpg` },
  { name: "דידייה דרוגבה",      surname: "DROGBA",      jersey: "11", flag: "🇨🇮", era: "1998–2018",
    imageUrl: `${W}/8/8e/Didier_Drogba_2011.jpg/280px-Didier_Drogba_2011.jpg` },
  { name: "סמואל אטו",           surname: "ETO'O",       jersey: "9",  flag: "🇨🇲", era: "1997–2019",
    imageUrl: `${W}/5/5c/Samuel_Eto%27o_-_FC_Barcelona_-_2008.jpg/280px-Samuel_Eto%27o_-_FC_Barcelona_-_2008.jpg` },
  { name: "וויין רוני",           surname: "ROONEY",      jersey: "10", flag: "🏴",  era: "2002–2021",
    imageUrl: `${W}/8/8e/Wayne_Rooney_in_April_2013.jpg/280px-Wayne_Rooney_in_April_2013.jpg` },
  { name: "סטיבן ג׳רארד",        surname: "GERRARD",     jersey: "8",  flag: "🏴",  era: "1998–2016",
    imageUrl: `${W}/3/37/Steven_Gerrard.jpg/280px-Steven_Gerrard.jpg` },
  { name: "פרנק למפארד",        surname: "LAMPARD",     jersey: "8",  flag: "🏴",  era: "1995–2017",
    imageUrl: `${W}/e/e0/Frank_Lampard_2014.jpg/280px-Frank_Lampard_2014.jpg` },
  { name: "לוקה מודריץ׳",       surname: "MODRIĆ",      jersey: "10", flag: "🇭🇷", era: "2003–",
    imageUrl: `${W}/8/8d/Luka_Modric_vs_Argentina.jpg/280px-Luka_Modric_vs_Argentina.jpg` },
  { name: "רוברט לבנדובסקי",   surname: "LEWANDOWSKI", jersey: "9",  flag: "🇵🇱", era: "2008–",
    imageUrl: `${W}/2/22/Robert_Lewandowski_2018.jpg/280px-Robert_Lewandowski_2018.jpg` },
  { name: "לואיס סוארס",         surname: "SUÁREZ",      jersey: "9",  flag: "🇺🇾", era: "2005–",
    imageUrl: `${W}/0/0e/Luis_Suárez_2018.jpg/280px-Luis_Suárez_2018.jpg` },
  { name: "מוחמד סלאח",          surname: "SALAH",       jersey: "11", flag: "🇪🇬", era: "2010–",
    imageUrl: `${W}/d/d1/Mohamed_Salah_2018.jpg/280px-Mohamed_Salah_2018.jpg` },
  { name: "סרחיו אגוארו",       surname: "AGÜERO",      jersey: "10", flag: "🇦🇷", era: "2003–2023",
    imageUrl: `${W}/3/3c/Sergio_Agüero_3_June_2018.jpg/280px-Sergio_Agüero_3_June_2018.jpg` },
  { name: "אריאן רובן",          surname: "ROBBEN",      jersey: "10", flag: "🇳🇱", era: "2000–2021",
    imageUrl: `${W}/a/ad/Arjen_Robben_2014.jpg/280px-Arjen_Robben_2014.jpg` },
  { name: "פרנק ריברי",          surname: "RIBÉRY",      jersey: "7",  flag: "🇫🇷", era: "2000–2022",
    imageUrl: `${W}/9/9c/Franck_Ribéry_2014.jpg/280px-Franck_Ribéry_2014.jpg` },
  { name: "טוני קרוס",            surname: "KROOS",       jersey: "8",  flag: "🇩🇪", era: "2007–2024",
    imageUrl: `${W}/b/b1/Toni_Kroos_2018.jpg/280px-Toni_Kroos_2018.jpg` },
  { name: "קווין דה ברוין",     surname: "DE BRUYNE",   jersey: "17", flag: "🇧🇪", era: "2008–",
    imageUrl: `${W}/0/05/Kevin_De_Bruyne_201807091.jpg/280px-Kevin_De_Bruyne_201807091.jpg` },
];
