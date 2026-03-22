"use client";
import { useEffect, useState } from "react";
import { useDashboard } from "../lib/store";

export function CriticalAlertPopup() {
    const [showAlert, setShowAlert] = useState(false);
    const { setSelectedMarketId, setMainView } = useDashboard();

    useEffect(() => {
        // Mock incoming alert after 4 seconds
        const timer = setTimeout(() => {
            setShowAlert(true);

            // Play a synthetic Web Audio API ping
            try {
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

                // High alert synth
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc.type = "square";
                osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
                osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5);

                gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.start();
                osc.stop(audioCtx.currentTime + 0.5);

                // Secondary beep
                setTimeout(() => {
                    const osc2 = audioCtx.createOscillator();
                    const gain2 = audioCtx.createGain();
                    osc2.type = "sine";
                    osc2.frequency.setValueAtTime(880, audioCtx.currentTime);
                    gain2.gain.setValueAtTime(0.1, audioCtx.currentTime);
                    gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                    osc2.connect(gain2);
                    gain2.connect(audioCtx.destination);
                    osc2.start();
                    osc2.stop(audioCtx.currentTime + 0.3);
                }, 150);

            } catch (e) {
                console.error("Audio API not supported or blocked");
            }
        }, 4000);

        return () => clearTimeout(timer);
    }, []);

    if (!showAlert) return null;

    return (
        <div className="global-popup-overlay">
            <div className="global-popup-modal">
                <button className="popup-close-btn" onClick={() => setShowAlert(false)}>×</button>
                <div className="popup-icon">🚨</div>
                <div className="popup-content">
                    <h2>CRITICAL VOLUME SPIKE DETECTED</h2>
                    <p>US forces enter Iran contract volume has jumped +140% in the last 12 hours. Velocity threshold breached.</p>
                </div>
                <div className="popup-actions">
                    <button className="btn-dismiss" onClick={() => setShowAlert(false)}>Dismiss</button>
                    <button className="btn-investigate" onClick={() => {
                        setShowAlert(false);
                        setSelectedMarketId("0xd73f60114a0e7169a55082daef1228cb27fa50c939eea22cb0589f6bac6ce5d3");
                        setMainView("map");
                    }}>Go to Market</button>
                </div>
            </div>
        </div>
    );
}
