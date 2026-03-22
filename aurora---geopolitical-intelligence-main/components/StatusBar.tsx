"use client";
import { useDashboard } from "../lib/store";

export function StatusBar() {
    const { hoverCoords } = useDashboard();

    return (
        <footer id="status-bar">
            <span id="status-left">
                <span style={{ color: "var(--accent)" }}>SEC_SYSTEM: ENCRYPTED</span>
            </span>
            <span id="status-center">
                {hoverCoords
                    ? `LAT ${hoverCoords.lat.toFixed(3)} · LNG ${hoverCoords.lng.toFixed(3)}`
                    : "LAT 0.000 · LNG 0.000"
                }
            </span>
            <span id="status-right">
                LIVE: <span style={{ color: "var(--accent)" }}>Polymarket</span> · <span style={{ color: "var(--accent)" }}>GDELT</span> · <span style={{ color: "var(--accent)" }}>NewsAPI</span> · Synced: just now
            </span>
        </footer>
    );
}
