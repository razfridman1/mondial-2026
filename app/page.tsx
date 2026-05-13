"use client";
import { useStore } from "@/lib/store";
import AuthProvider from "@/components/AuthProvider";
import Header from "@/components/Header";
import Schedule from "@/components/Schedule";
import MyPredictionsTab from "@/components/MyPredictionsTab";
import Bracket from "@/components/Bracket";
import AIInsights from "@/components/AIInsights";
import AdminPanel from "@/components/AdminPanel";
import ChatAssistant from "@/components/ChatAssistant";
import TeamsTab from "@/components/TeamsTab";
import ProfileTab from "@/components/ProfileTab";
import FriendsRanking from "@/components/FriendsRanking";
import Onboarding from "@/components/Onboarding";
import SimulationBanner from "@/components/SimulationBanner";
import SimulationPanel from "@/components/SimulationPanel";
import SuperAdminPanel from "@/components/SuperAdminPanel";
import RoastsFeed from "@/components/RoastsFeed";

function HomeInner() {
  const tab = useStore(s => s.prefs.tab);
  return (
    <>
      <Header />
      <SimulationBanner />
      <main className="container">
        {tab === "schedule"      && <Schedule />}
        {tab === "mypredictions" && <MyPredictionsTab />}
        {tab === "ranking"       && <FriendsRanking />}
        {tab === "teams"      && <TeamsTab />}
        {tab === "bracket"    && <Bracket />}
        {tab === "ai"         && <AIInsights />}
        {tab === "profile"    && <ProfileTab />}
        {tab === "admin"      && <AdminPanel />}
        {tab === "simulation" && <SimulationPanel />}
        {tab === "superadmin" && <SuperAdminPanel />}
      </main>
      <ChatAssistant />
      <RoastsFeed />
      <Onboarding />
      <footer style={{ textAlign: "center", padding: "30px 16px", color: "#6b7396", fontSize: 12 }}>
        <div>מונדיאל 2026 · 11 ביוני – 19 ביולי · קנדה · מקסיקו · ארה״ב</div>
        <div>כל הזמנים בשעון ישראל (Asia/Jerusalem) · עדכון אוטומטי בזמן אמת</div>
      </footer>
    </>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <HomeInner />
    </AuthProvider>
  );
}
