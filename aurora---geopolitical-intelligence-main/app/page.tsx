"use client";
import { DashboardProvider, useDashboard } from "../lib/store";
import { Header } from "../components/Header";
import { Sidebar } from "../components/Sidebar";
import { GlobeViz } from "../components/GlobeViz";
import { StatusBar } from "../components/StatusBar";
import { NewsFeed } from "../components/NewsFeed";
import { AIAssistant } from "../components/AIAssistant";
import { AlertsView } from "../components/AlertsView";
import { CriticalAlertPopup } from "../components/CriticalAlertPopup";

export default function Home() {
    return (
        <DashboardProvider>
            <DashboardContent />
        </DashboardProvider>
    );
}

function DashboardContent() {
    const { mainView } = useDashboard();

    return (
        <>
            <Header />
            <main>
                <div style={{ display: mainView === "map" ? "block" : "none", width: "100%", height: "100%", position: "relative", minWidth: 0, overflow: "hidden" }}>
                    <GlobeViz />
                </div>
                {mainView === "alerts" && <AlertsView />}

                <NewsFeed />
                <AIAssistant />

                {/* Only show Sidebar if on map view, or let it share space? The design implies globe & sidebar are paired. */}
                {mainView === "map" && <Sidebar />}
            </main>
            <StatusBar />
            <CriticalAlertPopup />
        </>
    );
}
