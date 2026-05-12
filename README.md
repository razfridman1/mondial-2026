# מונדיאל 2026 — Match Schedule + Israel TV Broadcast Center

Next.js 14 (App Router, TypeScript) · Firebase Auth + Firestore · Vercel · Capacitor (Android APK).

האפליקציה תומכת ב-3 מטרות פריסה:
1. **`localhost:3001`** — פיתוח מקומי
2. **ענן עם Auth** — דריסה אוטומטית ל-Vercel + Firebase
3. **APK ל-Android** — בנייה דרך Capacitor

---

## דרישות מקדימות

- Node.js ≥ 18.17
- Git (לסנכרון עם GitHub)
- חשבון Firebase (חינמי)
- חשבון Vercel (חינמי) לשלב הענן
- חשבון Resend (חינמי) — לתזכורות במייל
- חשבון Anthropic (תשלום פר שימוש, ~$0.25 ל-1M tokens) — ל-AI Chat
- Android Studio (רק לשלב ה-APK)
- JDK 17 (רק לשלב ה-APK)

## Git workflow — `git push` מהמחשב שלך

הפרויקט מוכן ל-Git. תהליך עבודה מומלץ:

```bash
# פעם אחת — אתחול ריפו
cd "C:\Users\razfr\Documents\Claude\Projects\MONDIAL 2026"
git init
git branch -M main
git add .
git commit -m "Initial commit: Mondial 2026 Next.js + Firebase + Capacitor"

# יצירת ריפו ריק ב-GitHub (דרך הדפדפן או gh CLI)
gh repo create mondial-2026 --private --source=. --remote=origin
# אם אין gh CLI, צור ב-https://github.com/new ואז:
git remote add origin https://github.com/<USERNAME>/mondial-2026.git

# פוש ראשון
git push -u origin main
```

לאחר מכן כל שינוי:
```bash
git add .
git commit -m "תיאור השינוי"
git push
```

**חיבור אוטומטי ל-Vercel:** ב-Vercel Dashboard → "Import Project" → בחר ב-GitHub repo. כל `git push ל-main` יפרוס אוטומטית ל-Production. כל פוש לסניף אחר ייצור Preview Deployment עם URL ייעודי.

---

## 1. הרצה מקומית על `localhost:3001`

```bash
# התקנת תלויות
npm install

# העתקת ההגדרות
cp .env.local.example .env.local
# פתח את .env.local ומלא את הערכים מ-Firebase Console (צעדים 2.1-2.3 למטה)

# הרצה
npm run dev
# פתח: http://localhost:3001
```

---

## 2. הגדרת Firebase (Auth + Firestore)

### 2.1 יצירת פרויקט Firebase
1. גש ל-https://console.firebase.google.com → "Add project"
2. שם: `mondial-2026` (או כל שם אחר)
3. השבת Analytics (אופציונלי)

### 2.2 הפעלת Authentication
1. בקונסול → **Authentication** → "Get started"
2. הפעל את הפרובידרים: **Google**, **Email/Password**
3. הוסף את הדומיינים המורשים: `localhost`, `*.vercel.app`, הדומיין שלך

### 2.3 הפעלת Firestore
1. בקונסול → **Firestore Database** → "Create database"
2. בחר Production mode, Region קרוב (eur3 ל-Europe)
3. בדף **Rules** הדבק את התוכן של `firestore.rules`

### 2.4 הוצאת מפתחות לאפליקציה
1. בקונסול → **Project Settings** → "Your apps" → צור Web App חדשה
2. העתק את ה-config (apiKey, authDomain וכו') ל-`.env.local`
3. תחת **Service accounts** → "Generate new private key" → קובץ JSON
4. הדבק את כל ה-JSON כשורה אחת ב-`FIREBASE_SERVICE_ACCOUNT_JSON` ב-`.env.local`

### 2.5 הגדרת אדמינים
ב-`.env.local`:
```
ADMIN_EMAILS=raz.fridman1@gmail.com,admin2@example.com
```
המשתמשים האלה יראו את לשונית "ניהול שידורים" ויוכלו לערוך שיבוצים.

---

## 3. פריסה ל-Vercel (ענן)

```bash
# התקנת Vercel CLI (פעם אחת)
npm i -g vercel

# התחברות
vercel login

# פריסה ראשונית
vercel

# הגדרת משתני סביבה (העתק כל ערך מ-.env.local)
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID
vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
vercel env add NEXT_PUBLIC_FIREBASE_APP_ID
vercel env add FIREBASE_SERVICE_ACCOUNT_JSON
vercel env add ADMIN_EMAILS

# פריסה ל-Production
vercel --prod
```

ה-URL שתקבל יהיה `https://mondial-2026.vercel.app`. הוסף אותו ל-**Firebase Authentication → Settings → Authorized domains**.

---

## 4. בניית APK ל-Android

### 4.1 התקנה ראשונית של Capacitor
```bash
# בנייה סטטית
BUILD_TARGET=capacitor npm run build

# הוספת פלטפורמת Android (פעם אחת)
npx cap add android

# סנכרון
npx cap sync android
```

### 4.2 פתיחה ב-Android Studio
```bash
npx cap open android
```
ב-Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**.
ה-APK ייווצר ב-`android/app/build/outputs/apk/debug/app-debug.apk`.

### 4.3 בנייה ישירה מ-CLI (ללא Android Studio)
```bash
# debug APK
npm run apk:debug
# ה-APK נמצא ב-android/app/build/outputs/apk/debug/

# release APK חתום
npm run apk:release
# צריך להגדיר keystore ב-android/app/build.gradle
```

### 4.4 הגדרת מפתח חתימה (Release)
```bash
keytool -genkey -v -keystore mondial-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias mondial
# הזן סיסמה ופרטים, ושמור את הקובץ ב-android/app/
```

ערוך `android/app/build.gradle` והוסף:
```gradle
android {
  signingConfigs {
    release {
      storeFile file('mondial-release.jks')
      storePassword 'YOUR_PASSWORD'
      keyAlias 'mondial'
      keyPassword 'YOUR_PASSWORD'
    }
  }
  buildTypes {
    release {
      signingConfig signingConfigs.release
    }
  }
}
```

### 4.5 הערות חשובות ל-APK
- Firebase Auth ב-APK דורש הוספת **SHA-1** של ה-keystore לפרויקט ב-Firebase Console תחת Android app
- ל-Google Sign-In ב-APK יש קצת הגדרות נוספות (מומלץ קודם להפעיל Email/Password ב-APK)
- כדי לטעון URL מ-Vercel במקום הקבצים המוטמעים, ערוך `capacitor.config.ts` והוסף `server.url = "https://mondial-2026.vercel.app"`

---

## מבנה הפרויקט

```
.
├── app/                    # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx            # הדף הראשי (5 לשוניות)
│   ├── globals.css
│   ├── login/page.tsx
│   └── api/
│       ├── me/route.ts          # מאמת token ומחזיר isAdmin
│       └── overrides/route.ts   # כתיבת overrides על ידי אדמין בלבד
├── components/
│   ├── AuthProvider.tsx
│   ├── Header.tsx
│   ├── Schedule.tsx       # card / calendar / timeline
│   ├── Broadcasts.tsx
│   ├── Bracket.tsx
│   ├── AIInsights.tsx
│   ├── AdminPanel.tsx
│   ├── MatchCard.tsx
│   ├── MatchModal.tsx
│   ├── Filters.tsx
│   └── Countdown.tsx
├── lib/
│   ├── types.ts
│   ├── data.ts            # 48 קבוצות, 16 מגרשים, 7 ערוצים, 104 משחקים
│   ├── utils.ts           # Asia/Jerusalem, פורמט עברי, countdown
│   ├── firebase.ts        # Web SDK + auth helpers
│   ├── firebase-admin.ts  # Admin SDK (server)
│   └── store.ts           # Zustand state + Firestore sync
├── public/
│   ├── manifest.json      # PWA
│   └── icons/             # אייקונים (favicon.svg מוכן; צרו 192/512/maskable PNG)
├── static-demo/           # הגרסה הסטטית המקורית (ארכיון)
├── data/schema.sql        # סכמת Postgres (אם תרצה לעבור מ-Firestore)
├── capacitor.config.ts
├── firestore.rules
├── next.config.mjs
├── vercel.json
├── package.json
└── tsconfig.json
```

---

## האם המערכת כוללת את כל מה שנדרש?

| דרישה | סטטוס |
|---|---|
| כל המשחקים העתידיים | ✅ 104 משחקים |
| תאריך + שעה לפי ישראל + countdown | ✅ Asia/Jerusalem + DST + countdown חי |
| AI insights, odds, סטטוס משחק | ✅ |
| דגלים, קבוצות, אצטדיון, עיר | ✅ |
| ערוצי שידור ישראליים (כאן 11, Sport 5/1/2/5+, סטרימינג) | ✅ 7 ערוצים, clickable |
| pre-game, studio show | ✅ |
| 3 תצוגות: card / calendar / timeline | ✅ |
| Bracket integration | ✅ |
| Filters: יום, בית, שלב, ערוץ, קבוצה, live, favorites | ✅ |
| Favorites + Reminders (h60, m15, betsClose) | ✅ Firestore-backed |
| Realtime updates + auto refresh | ✅ |
| AI: הכי מעניין, הכי צמוד, אפסטים, top-5 | ✅ |
| Admin: ערוצים, שעות, overrides | ✅ Super Admin via email allowlist |
| DB tables (broadcasts, tv_channels, match_schedules, reminders, user_favorites, broadcast_overrides) | ✅ ב-Firestore + SQL schema |
| Mobile: swipe, sticky live, fullscreen | ✅ |
| `localhost:3001` | ✅ `npm run dev` |
| Cloud + Auth | ✅ Vercel + Firebase |
| APK | ✅ Capacitor |

---

## פיצ׳רים נוספים

### תזכורות במייל (Resend)
1. צור חשבון ב-https://resend.com
2. אמת את הדומיין שלך (Resend תיתן לך הגדרות DNS להוסיף ל-DNS provider)
3. צור API Key והדבק ב-`.env.local` תחת `RESEND_API_KEY`
4. עדכן את `MAIL_FROM` עם כתובת שולח מהדומיין המאומת
5. ב-Vercel: Cron יפעיל את `/api/reminders/cron` כל 5 דקות (ראה `vercel.json`)
6. משתמש מפעיל תזכורות במייל דרך פאנל "✉️ תזכורות באימייל" באפליקציה
7. עבור כל משחק יש לסמן את התזכורת על הכרטיס + להפעיל את הסוג בהעדפות המייל

### AI Chat (Anthropic Claude)
1. צור API key ב-https://console.anthropic.com → API Keys
2. הדבק ב-`.env.local` תחת `ANTHROPIC_API_KEY`
3. הצ׳אט נפתח דרך כפתור הצף 🤖 בפינה השמאלית-תחתונה
4. ניתן להחליף מודל דרך `ANTHROPIC_MODEL` (ברירת מחדל: Haiku, הזול והמהיר)
5. ללא API key — הצ׳אט יציג הודעת Demo (האפליקציה ממשיכה לעבוד)

### ניחוש תוצאה
- כל משחק עם odds מציג טופס ניחוש בעמוד המשחק
- המשתמש מזין שערים לכל קבוצה (0-20), לוחץ "שמור ניחוש"
- אם כבר ניחש — הטופס מציג את הניחוש הקיים, ניתן לעדכן
- נעילה אוטומטית 3 דקות לפני שריקת הפתיחה (אכיפה גם בצד-שרת)
- שיתוף ישיר לווטסאפ עם הניחוש כתוב

### שיתוף בווטסאפ
- כפתור 💬 בכל כרטיס משחק וגם בעמוד המשחק
- בנייד: פותח את ה-Share Sheet הילידי (יציג גם WhatsApp)
- בדסקטופ: פותח את `wa.me` ישירות
- ניחוש מוכן לשיתוף יחד עם פרטי המשחק

### רקע שחקנים
- SVG pattern קל (`public/bg/players-pattern.svg`) עם דמויות שחקנים וכדורים
- שקיפות נמוכה (5%) + שכבת gradient כהה מעל כדי שהטקסט יישאר קריא
- backdrop-filter blur על הכרטיסים לאפקט "frosted glass"

## תמיכה
- Firebase Console: https://console.firebase.google.com
- Vercel: https://vercel.com/dashboard
- Resend: https://resend.com/dashboard
- Anthropic Console: https://console.anthropic.com
- Capacitor docs: https://capacitorjs.com/docs/android

## רישיון
פנימי — כל הזכויות שמורות.

## ניהול משתמשים פנימי (Admin Console)

המערכת מאפשרת ל-**אדמין** (כתובת אימייל שמופיעה ב-`ADMIN_EMAILS`) ליצור משתמשים עם שם משתמש וסיסמה בלבד — בלי דרישה לאימייל אמיתי או לאימות.

### כיצד זה עובד תחת המנוע
1. אתה יוצר חשבון בלשונית **🛠️ ניהול שידורים → ניהול משתמשים פנימי**.
2. השרת יוצר משתמש Firebase Auth עם **אימייל סינתטי**: `<username>@mondial2026.local`.
3. שם המשתמש נשמר באינדקס Firestore `username_lookup/<username>` כדי לאפשר חיפוש מהיר.
4. כשמשתמש מתחבר דרך עמוד `/login`, מספיק להזין את שם המשתמש; הקליינט קורא ל-`/api/auth/resolve-username` לקבלת האימייל הסינתטי ואז משתמש ב-Firebase login רגיל.
5. כל קריאות הניהול (PATCH / DELETE / POST) דורשות Bearer token של משתמש שכתובתו ב-`ADMIN_EMAILS`.

### פעולות זמינות במסך הניהול
- ➕ **צור משתמש חדש** — username + password + display name + role (user/admin)
- 🔑 **איפוס סיסמה** — דרך Firebase Admin SDK (לא צריך לדעת את הסיסמה הישנה)
- ✏️ **שינוי שם תצוגה**
- ⬇/⬆ **שינוי תפקיד** (user ↔ admin) — אדמין נוסף יוכל לפתוח את לוח הניהול
- 🚫 **השבתה/הפעלה** — `auth.updateUser({ disabled })`
- 🗑️ **מחיקה לצמיתות** — מוחק את Firebase user וגם cascade: profiles, predictions, group memberships, favorites, reminders, joker usage

### API Endpoints (כולם admin-only)
```
GET    /api/admin/users         — list
POST   /api/admin/users         — create  { username, password, displayName?, role? }
PATCH  /api/admin/users/{uid}   — update  { displayName?, role?, disabled?, password? }
DELETE /api/admin/users/{uid}   — cascade delete
GET    /api/auth/resolve-username?u=USER — public (returns email or 404)
```

### דוגמת זרימה
```bash
# 1. אתה (האדמין) מתחבר לאפליקציה דרך Google
# 2. נכנס ללשונית "ניהול שידורים"
# 3. בתחתית הדף יש את "ניהול משתמשים פנימי" — לוחץ "צור משתמש חדש"
# 4. שם משתמש: avi    סיסמה: mondial123    תפקיד: user
# 5. נותן ל-avi את הפרטים — הוא מתחבר ב-/login עם "avi" + "mondial123"
```
