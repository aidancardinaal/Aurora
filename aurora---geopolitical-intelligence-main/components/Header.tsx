"use client";
import { useDashboard } from "../lib/store";
import { ALERTS, REGIONAL_INDICES, getRiskScoreColor } from "../lib/data";
import { useState, useRef, useEffect } from "react";

export function Header() {
    const {
        currentHorizon,
        setCurrentHorizon,
        currentFilter,
        setCurrentFilter,
        heatmapActive,
        setHeatmapActive,
        mainView,
        setMainView,
    } = useDashboard();

    const severityColor = (s: string) =>
        s === "critical" ? "#E24B4A" : s === "warning" ? "#EF9F27" : "#00d4b8";

    return (
        <>
            <header>
                <div className="logo">AURORA</div>

                <div className="main-nav-tabs">
                    <button className={mainView === "map" ? "active" : ""} onClick={() => setMainView("map")}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /></svg>
                        MAP VIEW
                    </button>
                    <button className={mainView === "alerts" ? "active alert-tab" : "alert-tab"} onClick={() => setMainView("alerts")}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                        ALERTS & SIGNALS
                        <span className="tab-badge">{ALERTS.length}</span>
                    </button>
                </div>

                <div id="filter-pills">
                    {(["All", "Politics", "Conflict", "Economy"] as const).map((f) => (
                        <div
                            key={f}
                            className={`filter-pill ${currentFilter === f ? "active" : ""}`}
                            onClick={() => setCurrentFilter(f)}
                        >
                            {f}
                        </div>
                    ))}
                </div>

                <div className="header-right">
                    <div id="forecast-toggle" className="forecast-toggle">
                        {(["ALL", "90D", "30D", "7D"] as const).map((h) => (
                            <button
                                key={h}
                                className={currentHorizon === h ? "active" : ""}
                                onClick={() => setCurrentHorizon(h)}
                            >
                                {h === "ALL" ? "ALL" : `≤${h}`}
                            </button>
                        ))}
                    </div>

                </div>
            </header>

            {/* Regional Risk Index Bar */}
            <div className="region-bar">
                {REGIONAL_INDICES.map((r) => (
                    <div key={r.region} className="region-item">
                        <span className="region-name">{r.region}</span>
                        <span className="region-label">• Risk Index:</span>
                        <span className="region-score" style={{ color: getRiskScoreColor(r.score) }}>
                            {r.score}
                        </span>
                        <span className="region-label">• 7-day:</span>
                        <span className={`region-delta ${r.delta > 0 ? "up" : r.delta < 0 ? "down" : ""}`}>
                            {r.delta > 0 ? `▲${r.delta}` : r.delta < 0 ? `▼${Math.abs(r.delta)}` : "—"}
                        </span>
                        <span className="region-label">• Active Markets:</span>
                        <span className="region-count">{r.marketCount}</span>
                    </div>
                ))}
            </div>
        </>
    );
}
