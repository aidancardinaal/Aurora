"use client";
import { useDashboard } from "../lib/store";
import { getRiskColor, daysUntil, Market } from "../lib/data";
import { useEffect, useRef } from "react";

function Sparkline({ data, color }: { data: number[]; color: string }) {
    const width = 80;
    const height = 24;
    const max = Math.max(...data, 0.01);
    const min = Math.min(...data, 0);
    const range = max - min || 0.01;

    const points = data
        .map((v, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - ((v - min) / range) * height;
            return `${x},${y}`;
        })
        .join(" ");

    return (
        <svg width={width} height={height} className="sparkline">
            <defs>
                <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon
                points={`0,${height} ${points} ${width},${height}`}
                fill={`url(#grad-${color.replace("#", "")})`}
            />
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    );
}

function DeltaBadge({ delta, label }: { delta: number; label: string }) {
    if (delta === 0) return null;
    const isUp = delta > 0;
    const color = isUp ? "#E24B4A" : "#4CAF7D";
    return (
        <span className="delta-badge" style={{ color }}>
            {isUp ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}% <span className="delta-label">{label}</span>
        </span>
    );
}

export function Sidebar() {
    const {
        filteredMarkets,
        selectedMarketId,
        setSelectedMarketId,
        insightText,
        setInsightText,
    } = useDashboard();
    const listRef = useRef<HTMLDivElement>(null);

    const handleSelect = (market: Market) => {
        setSelectedMarketId(market.id);
        setInsightText(market.strategicInsight);
    };

    useEffect(() => {
        if (selectedMarketId && listRef.current) {
            const activeEl = listRef.current.querySelector(
                ".market-card.active"
            ) as HTMLElement;
            if (activeEl) {
                activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        }
    }, [selectedMarketId]);

    return (
        <aside id="sidebar">
            <div id="advisor-panel" className="advisor-panel">
                <h3>Strategic Advisor</h3>
                <div id="advisor-text">{insightText}</div>
            </div>

            <div className="market-list-header">
                <span>
                    {filteredMarkets.length} active market{filteredMarkets.length !== 1 ? "s" : ""}
                </span>
                <span className="total-volume">
                    $
                    {(
                        filteredMarkets.reduce((acc, m) => acc + m.volume, 0) / 1_000_000
                    ).toFixed(0)}
                    M vol
                </span>
            </div>

            <div id="market-list" ref={listRef}>
                {filteredMarkets.length === 0 ? (
                    <div className="empty-state">
                        No intelligence data for this filter combination.
                    </div>
                ) : (
                    filteredMarkets.map((market) => {
                        const days = daysUntil(market.endDate);
                        const urgencyClass =
                            days <= 10 ? "urgent" : days <= 30 ? "soon" : "";

                        return (
                            <div
                                key={market.id}
                                className={`market-card ${selectedMarketId === market.id ? "active" : ""
                                    } ${urgencyClass}`}
                                onClick={() => handleSelect(market)}
                            >
                                <div className="card-header">
                                    <div className="card-header-left">
                                        <span className="country">{market.country}</span>
                                        {market.velocity > 100 && (
                                            <span className="velocity-badge" title={`${market.velocity}% volume surge`}>
                                                🔥 SURGE
                                            </span>
                                        )}
                                        <span className="days-badge">
                                            {days}d left
                                        </span>
                                    </div>
                                    <div className="card-header-right">
                                        <span
                                            className="prob-value"
                                            style={{ color: getRiskColor(market.probability) }}
                                        >
                                            {Math.round(market.probability * 100)}%
                                        </span>
                                    </div>
                                </div>

                                <div className="question">{market.question}</div>

                                <div className="card-trend-row">
                                    <Sparkline
                                        data={market.trend}
                                        color={getRiskColor(market.probability)}
                                    />
                                    <div className="delta-stack">
                                        <DeltaBadge delta={market.delta24h} label="24h" />
                                        <DeltaBadge delta={market.delta7d} label="7d" />
                                    </div>
                                </div>

                                <div className="prob-bar-container">
                                    <div
                                        className="prob-bar"
                                        style={{
                                            width: `${market.probability * 100}%`,
                                            backgroundColor: getRiskColor(market.probability),
                                        }}
                                    />
                                </div>

                                <div className="card-footer">
                                    <span className="category-pill">{market.category}</span>
                                    <span className="volume">
                                        ${(market.volume / 1000000).toFixed(1)}M volume
                                    </span>
                                </div>
                                <a
                                    href={market.polymarketUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="poly-link"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    View on Polymarket →
                                </a>
                            </div>
                        );
                    })
                )}
            </div>
        </aside>
    );
}
