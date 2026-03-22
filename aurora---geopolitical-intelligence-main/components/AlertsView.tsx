"use client";
import { ALERTS } from "../lib/data";

export function AlertsView() {
    const severityColor = (s: string) =>
        s === "critical" ? "#E24B4A" : s === "warning" ? "#EF9F27" : "#00d4b8";

    return (
        <div className="alerts-view-container">
            <div className="alerts-header-title">
                <h2>Intelligence Alerts & Signals</h2>
                <p>Showing {ALERTS.length} active global alerts matching your filters.</p>
            </div>

            <div className="alerts-grid">
                {ALERTS.map((alert, idx) => (
                    <div key={idx} className={`alert-card severity-${alert.severity}`} style={{ borderTopColor: severityColor(alert.severity) }}>
                        <div className="alert-top">
                            <span className="alert-severity-badge" style={{ backgroundColor: severityColor(alert.severity) }}>
                                {alert.severity.toUpperCase()}
                            </span>
                            <span className="alert-time">{alert.timestamp}</span>
                        </div>
                        <h3 className="alert-text">{alert.text}</h3>
                        <div className="alert-footer">
                            <span className="market-ref">Market Ref: {alert.marketId}</span>
                            <button className="view-market-btn">Investigate ➔</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
