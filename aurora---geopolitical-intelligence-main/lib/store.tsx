"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Market, MARKETS, fetchMarketsFromApi, filterByHorizon, DEFAULT_INSIGHT } from "./data"; // MARKETS used as initial state fallback

type Horizon = "7D" | "30D" | "90D" | "ALL";
type Filter = "All" | "Politics" | "Conflict" | "Economy";
export type MainView = "map" | "alerts";

interface DashboardState {
    currentHorizon: Horizon;
    setCurrentHorizon: (h: Horizon) => void;
    currentFilter: Filter;
    setCurrentFilter: (f: Filter) => void;
    heatmapActive: boolean;
    setHeatmapActive: (h: boolean) => void;
    selectedMarketId: string | null;
    setSelectedMarketId: (m: string | null) => void;
    hoverCoords: { lat: number; lng: number } | null;
    setHoverCoords: (c: { lat: number; lng: number } | null) => void;
    insightText: string;
    setInsightText: (t: string) => void;
    filteredMarkets: Market[];
    mainView: MainView;
    setMainView: (v: MainView) => void;
}

const DashboardContext = createContext<DashboardState | undefined>(undefined);

export function DashboardProvider({ children }: { children: ReactNode }) {
    const [currentHorizon, setCurrentHorizon] = useState<Horizon>("ALL");
    const [currentFilter, setCurrentFilter] = useState<Filter>("All");
    const [heatmapActive, setHeatmapActive] = useState(true);
    const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
    const [hoverCoords, setHoverCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [insightText, setInsightText] = useState(DEFAULT_INSIGHT);
    const [mainView, setMainView] = useState<MainView>("map");
    const [markets, setMarkets] = useState<Market[]>(MARKETS);

    useEffect(() => {
        fetchMarketsFromApi()
            .then(setMarkets)
            .catch((err) => console.warn("Could not fetch live markets, using mock data:", err));
    }, []);

    // Step 1: filter by category
    let filtered = markets;
    if (currentFilter !== "All") {
        filtered = markets.filter((m) => m.category === currentFilter);
    }

    // Step 2: filter by time horizon
    filtered = filterByHorizon(filtered, currentHorizon);


    return (
        <DashboardContext.Provider
            value={{
                currentHorizon,
                setCurrentHorizon,
                currentFilter,
                setCurrentFilter,
                heatmapActive,
                setHeatmapActive,
                selectedMarketId,
                setSelectedMarketId,
                hoverCoords,
                setHoverCoords,
                insightText,
                setInsightText,
                filteredMarkets: filtered,
                mainView,
                setMainView,
            }}
        >
            {children}
        </DashboardContext.Provider>
    );
}

export function useDashboard() {
    const ctx = useContext(DashboardContext);
    if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
    return ctx;
}
