"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import { useDashboard } from "../lib/store";
import { getRiskColor, COUNTRY_RISKS, ISO_NUMERIC, getCountryRiskColorRGBA } from "../lib/data";

declare global {
    interface Window {
        Globe: any;
        topojson: any;
    }
}

export function GlobeViz() {
    const containerRef = useRef<HTMLDivElement>(null);
    const globeInstanceRef = useRef<any>(null);
    const [scriptsLoaded, setScriptsLoaded] = useState(false);
    const {
        filteredMarkets,
        selectedMarketId,
        setSelectedMarketId,
        heatmapActive,
        setHoverCoords,
        setInsightText,
    } = useDashboard();

    // Build a lookup: ISO numeric code → risk score
    const countryRiskMap = useMemo(() => {
        const map = new Map<string, number>();
        COUNTRY_RISKS.forEach((cr) => {
            const numCode = ISO_NUMERIC[cr.iso];
            if (numCode) map.set(numCode, cr.riskScore);
        });
        return map;
    }, []);

    useEffect(() => {
        const loadScript = (src: string) => {
            return new Promise<void>((resolve, reject) => {
                if (document.querySelector(`script[src="${src}"]`)) {
                    resolve();
                    return;
                }
                const script = document.createElement("script");
                script.src = src;
                script.onload = () => resolve();
                script.onerror = () => reject(new Error(`Failed to load ${src}`));
                document.body.appendChild(script);
            });
        };

        Promise.all([
            loadScript("https://unpkg.com/topojson-client@3"),
            loadScript("https://unpkg.com/globe.gl"),
        ])
            .then(() => setScriptsLoaded(true))
            .catch((err) => console.error(err));
    }, []);

    useEffect(() => {
        if (
            !scriptsLoaded ||
            !containerRef.current ||
            !window.Globe ||
            globeInstanceRef.current
        )
            return;

        const globe = window
            .Globe()(containerRef.current)
            .backgroundColor("#080f1a")
            .showAtmosphere(true)
            .atmosphereColor("#00d4b8")
            .atmosphereAltitude(0.15)
            .globeImageUrl("//unpkg.com/three-globe/example/img/earth-dark.jpg")
            .pointLat((d: any) => d.lat)
            .pointLng((d: any) => d.lng)
            .pointRadius((d: any) => 0.3 + d.probability * 0.7)
            .pointColor((d: any) => getRiskColor(d.probability))
            .pointAltitude(0.02)
            .onPointClick((d: any) => {
                setSelectedMarketId(d.id);
                setInsightText(d.strategicInsight);
            })
            .htmlElement((d: any) => {
                const el = document.createElement("div");
                el.innerHTML = `
          <div class="marker-pulse" style="border-color: ${getRiskColor(d.probability)}"></div>
          <div class="marker-label">
            <span class="prob">${Math.round(d.probability * 100)}%</span>
            <span class="vec">${d.delta24h > 0 ? "▲" : d.delta24h < 0 ? "▼" : "—"}</span>
          </div>
        `;
                return el;
            })
            .arcsData([
                {
                    startLat: 48.3,
                    startLng: 31.2,
                    endLat: 55.7,
                    endLng: 37.6,
                    color: "#E24B4A",
                },
            ])
            .arcColor("color")
            .arcDashLength(0.4)
            .arcDashGap(4)
            .arcDashAnimateTime(1500)
            .hexBinPointLat("lat")
            .hexBinPointLng("lng")
            .hexBinPointWeight("weight")
            .hexBinResolution(3)
            .hexMargin(0.05)
            .hexTopColor(
                (d: any) => getRiskColor(d.sumWeight / d.points.length)
            )
            .hexAltitude(
                (d: any) => (d.sumWeight / d.points.length) * 0.1 + 0.02
            );

        // Land polygons — colored by risk when heatmap is active
        fetch("https://unpkg.com/world-atlas/countries-110m.json")
            .then((res) => res.json())
            .then((worldData) => {
                const countries = window.topojson.feature(
                    worldData,
                    worldData.objects.countries
                ).features;
                globe
                    .polygonsData(countries)
                    .polygonSideColor(() => "rgba(0, 0, 0, 0)")
                    .polygonStrokeColor(() => "rgba(0, 212, 184, 0.3)");
                // The dynamic coloring (cap color, altitude, labels) is now managed by the second useEffect
            });

        // Add ResizeObserver to constrain globe to the CSS grid 1fr column
        const resizeObserver = new ResizeObserver(() => {
            if (containerRef.current && globe) {
                globe.width(containerRef.current.clientWidth);
                globe.height(containerRef.current.clientHeight);
            }
        });
        resizeObserver.observe(containerRef.current);

        containerRef.current.addEventListener("mousemove", (e) => {
            const { left, top } = containerRef.current!.getBoundingClientRect();
            const coords = globe.toGlobeCoords(e.clientX - left, e.clientY - top);
            if (coords) {
                setHoverCoords(coords);
            }
        });

        globe.pointOfView({ lat: 30, lng: 30, altitude: 2.5 });
        globeInstanceRef.current = globe;

        return () => {
            resizeObserver.disconnect();
        };
    }, [scriptsLoaded, setHoverCoords, setInsightText, setSelectedMarketId]);

    // Update markers & heatmap on filter changes
    useEffect(() => {
        if (!globeInstanceRef.current) return;
        const globe = globeInstanceRef.current;

        globe.pointsData(filteredMarkets);
        globe.htmlElementsData(filteredMarkets);

        if (heatmapActive) {
            const hexData = filteredMarkets.map((m) => ({
                lat: m.lat,
                lng: m.lng,
                weight: m.probability,
            }));
            globe.hexBinPointsData(hexData);

            // Turn ON country risk styling
            globe.polygonCapColor((feat: any) => {
                const id = feat.id || feat.properties?.id;
                const score = countryRiskMap.get(String(id));
                if (score !== undefined) {
                    return getCountryRiskColorRGBA(score, 0.75);
                }
                return "rgba(0, 0, 0, 0)";
            });
            globe.polygonAltitude((feat: any) => {
                const id = feat.id || feat.properties?.id;
                const score = countryRiskMap.get(String(id));
                if (score !== undefined) {
                    return 0.005 + (score / 100) * 0.02;
                }
                return 0.003;
            });
            globe.polygonLabel((feat: any) => {
                const id = feat.id || feat.properties?.id;
                const score = countryRiskMap.get(String(id));
                const name = feat.properties?.name || "Unknown";
                if (score !== undefined) {
                    return `<div style="font-family:sans-serif;padding:4px 8px;background:rgba(0,0,0,0.8);border:1px solid ${getCountryRiskColorRGBA(score, 1)};border-radius:4px;color:#fff;">
                <b>${name}</b><br/>Risk: <span style="color:${getCountryRiskColorRGBA(score, 1)}">${score}/100</span>
              </div>`;
                }
                return `<b>${name}</b>`;
            });
        } else {
            globe.hexBinPointsData([]);

            // Turn OFF country risk styling
            globe.polygonCapColor(() => "rgba(26, 158, 143, 0.15)");
            globe.polygonAltitude(() => 0.003);
            globe.polygonLabel((feat: any) => {
                const name = feat.properties?.name || "Unknown";
                return `<b>${name}</b>`;
            });
        }
    }, [filteredMarkets, heatmapActive, countryRiskMap]);

    // Handle selected market fly-to
    useEffect(() => {
        if (!globeInstanceRef.current || !selectedMarketId) return;
        const market = filteredMarkets.find((m) => m.id === selectedMarketId);
        if (market) {
            globeInstanceRef.current.pointOfView(
                { lat: market.lat, lng: market.lng, altitude: 1.5 },
                1000
            );
        }
    }, [selectedMarketId, filteredMarkets]);

    return <div id="globe-container" ref={containerRef} />;
}
