"use client";
import { useState } from "react";

export type NewsItem = {
    id: string;
    headline: string;
    source: string;
    timestamp: string;
    impact: "high" | "medium" | "low";
};

export const MOCK_NEWS: NewsItem[] = [
    { id: "1", headline: "Satellite imagery reveals new troop movements near border", source: "Aurora Intel", timestamp: "10m ago", impact: "high" },
    { id: "2", headline: "Diplomatic talks stall as delegates walk out of summit", source: "Global Reuters", timestamp: "45m ago", impact: "high" },
    { id: "3", headline: "Crude oil futures surge past $95 amid supply concerns", source: "Financial Times", timestamp: "2h ago", impact: "medium" },
    { id: "4", headline: "Regional cyber activity spikes across critical infrastructure", source: "Cybercom Watch", timestamp: "4h ago", impact: "medium" },
    { id: "5", headline: "UN Security Council calls emergency session for Wednesday", source: "UN Press", timestamp: "6h ago", impact: "low" },
];

export function NewsFeed() {
    const [isOpen, setIsOpen] = useState(true);

    if (!isOpen) {
        return (
            <button className="news-toggle-btn" onClick={() => setIsOpen(true)}>
                <span>📰 INTEL FEED</span>
            </button>
        );
    }

    return (
        <div className="news-feed-panel">
            <div className="news-header">
                <h3>LIVE INTEL FEED</h3>
                <button onClick={() => setIsOpen(false)}>×</button>
            </div>
            <div className="news-list">
                {MOCK_NEWS.map(news => (
                    <div key={news.id} className={`news-item ${news.impact}`}>
                        <div className="news-meta">
                            <span className="source">{news.source}</span>
                            <span className="time">{news.timestamp}</span>
                        </div>
                        <p className="headline">{news.headline}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
