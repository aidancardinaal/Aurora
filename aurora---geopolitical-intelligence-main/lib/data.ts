export type Market = {
    id: string;
    country: string;
    question: string;
    probability: number;
    lat: number;
    lng: number;
    vector: string;
    volume: number;
    endDate: string;
    category: string;
    polymarketUrl: string;
    strategicInsight: string;
    // New fields
    delta24h: number;   // probability change in last 24h (e.g. +0.03 means +3%)
    delta7d: number;    // probability change in last 7 days
    trend: number[];    // 14-day historical probability snapshots (most recent last)
    velocity: number;   // trading velocity (e.g., volume surge % in last 12h)
};

export type CountryRisk = {
    name: string;
    iso: string;
    riskScore: number;  // composite 0–100
    marketCount: number;
    dominantCategory: string;
    trend: "rising" | "falling" | "stable";
};

export type RegionalIndex = {
    region: string;
    score: number;        // 0–100
    delta: number;        // change from yesterday
    marketCount: number;
    countries: string[];
};

export type Alert = {
    severity: "critical" | "warning" | "info";
    text: string;
    timestamp: string;    // relative
    marketId?: string;
};

export const DEFAULT_INSIGHT =
    "AURORA INTELLIGENCE BRIEFING — March 21, 2026. The Iran theater dominates global risk: US ground entry priced at 62% by April 30, while ceasefire odds sit at 53% by June. Israel-Lebanon ground offensive at 78% probability within 10 days. Russia-Ukraine ceasefire remains unlikely at 36% for full year. Taiwan Strait is calm (1% invasion probability). Oil markets signal stress — $100 crude at 78%. Total monitored volume: $207M across 13 active markets.";

// Helper to generate a mock trend line
function mockTrend(current: number, delta7d: number): number[] {
    const points: number[] = [];
    const start = Math.max(0, Math.min(1, current - delta7d * 1.5));
    for (let i = 0; i < 14; i++) {
        const progress = i / 13;
        const noise = (Math.random() - 0.5) * 0.04;
        points.push(Math.max(0, Math.min(1, start + (current - start) * progress + noise)));
    }
    points[13] = current; // ensure last point is exact
    return points;
}

type ApiMarket = {
    market_id: string;
    question: string;
    volume_24hr: number;
    volume: number;
    velocity: number;
    signal_score: number;
    probability: number;
    analysis?: {
        summary: string;
        sentiment: string;
        confidence: number;
    };
};

type ApiCountryData = {
    country: string;
    markets: ApiMarket[];
};

export const RAW_API_DATA: ApiCountryData[] = [
    {
        "country": "Iran",
        "markets": [
            {
                "market_id": "0xd73f60114a0e7169a55082daef1228cb27fa50c939eea22cb0589f6bac6ce5d3",
                "question": "Iran x Israel/US conflict ends by May 15?",
                "volume_24hr": 41264.518,
                "volume": 791666.839,
                "velocity": 0.08,
                "signal_score": 8,
                "probability": 0.495
            },
            {
                "market_id": "0xfa59099fbda1e0f0058ed3cbd57e939fe90ab6d9b57d53bd488bcadf75c191d4",
                "question": "Trump announces end of military operations against Iran by April 30th?",
                "volume_24hr": 117379.945,
                "volume": 683857.551,
                "velocity": 0.05,
                "signal_score": 10,
                "probability": 0.455
            }
        ]
    }
];

export const COUNTRY_GEO_MAP: Record<string, { lat: number; lng: number; iso: string, numeric: string }> = {
    "Iran": { lat: 32.4279, lng: 53.6880, iso: "IRN", numeric: "364" },
    "Israel": { lat: 31.7683, lng: 35.2137, iso: "ISR", numeric: "376" },
    "Lebanon": { lat: 33.8547, lng: 35.8623, iso: "LBN", numeric: "422" },
    "Saudi Arabia": { lat: 23.8859, lng: 45.0792, iso: "SAU", numeric: "682" },
    "Ukraine": { lat: 48.3794, lng: 31.1656, iso: "UKR", numeric: "804" },
    "Russia": { lat: 61.5240, lng: 105.3188, iso: "RUS", numeric: "643" },
    "Taiwan": { lat: 23.6978, lng: 120.9605, iso: "TWN", numeric: "158" },
    "India": { lat: 28.6139, lng: 77.2090, iso: "IND", numeric: "356" }
};

export function transformApiData(data: ApiCountryData[]): Market[] {
    return data.flatMap(apiCountry => {
        const geo = COUNTRY_GEO_MAP[apiCountry.country] || { lat: 0, lng: 0, iso: "UNK", numeric: "000" };
        return apiCountry.markets.map(m => ({
            id: m.market_id,
            country: apiCountry.country,
            question: m.question,
            probability: m.probability,
            lat: geo.lat,
            lng: geo.lng,
            vector: "ground",
            volume: m.volume,
            endDate: "2026-12-31",
            category: "Conflict",
            polymarketUrl: `https://polymarket.com/market/${m.market_id}`,
            strategicInsight: m.analysis?.summary ?? `Volume 24h: $${Math.round(m.volume_24hr)}, Velocity: ${m.velocity}, Signal Score: ${m.signal_score}`,
            delta24h: 0.05,
            delta7d: 0.12,
            trend: mockTrend(m.probability, 0.12),
            velocity: m.velocity * 1000,
            signalScore: m.signal_score
        }));
    });
}

export const MARKETS: Market[] = transformApiData(RAW_API_DATA);

export async function fetchMarketsFromApi(): Promise<Market[]> {
    // Try live backend first, fall back to local markets.json via Next.js API route
    const sources = ["http://localhost:9878/markets", "/api/markets"];
    for (const url of sources) {
        try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const data: ApiCountryData[] = await res.json();
            return transformApiData(data);
        } catch {
            // try next source
        }
    }
    throw new Error("All market sources unavailable");
}

export const COUNTRY_RISKS: CountryRisk[] = RAW_API_DATA.map(apiCountry => {
    const geo = COUNTRY_GEO_MAP[apiCountry.country] || { lat: 0, lng: 0, iso: "UNK", numeric: "000" };
    const totalSignal = apiCountry.markets.reduce((acc, m) => acc + (m.signal_score || 0), 0);
    const riskScore = Math.min(100, totalSignal * 4); // basic heuristic scaler
    return {
        name: apiCountry.country,
        iso: geo.iso,
        riskScore: riskScore,
        marketCount: apiCountry.markets.length,
        dominantCategory: "Conflict",
        trend: "rising"
    };
});

// Map ISO-3166 alpha-3 → numeric code for TopoJSON matching
export const ISO_NUMERIC: Record<string, string> = {
    IRN: "364", ISR: "376", LBN: "422", UKR: "804", RUS: "643",
    TWN: "158", IND: "356", PAK: "586", SAU: "682", SYR: "760",
    IRQ: "368", YEM: "887", CHN: "156", PRK: "408", KOR: "410",
    USA: "840",
};

// Regional indices
export const REGIONAL_INDICES: RegionalIndex[] = [
    { region: "Middle East", score: 76, delta: +3, marketCount: 7, countries: ["Iran", "Israel", "Lebanon", "Saudi Arabia", "Iraq", "Syria", "Yemen"] },
    { region: "Europe / CIS", score: 42, delta: -1, marketCount: 2, countries: ["Ukraine", "Russia"] },
    { region: "Asia-Pacific", score: 14, delta: 0, marketCount: 2, countries: ["Taiwan", "India", "China", "North Korea", "South Korea", "Pakistan"] },
    { region: "Global Markets", score: 61, delta: +2, marketCount: 1, countries: [] },
];

// Computed alerts (mock — would be generated from delta data in production)
export const ALERTS: Alert[] = [
    { severity: "critical", text: "VELOCITY ALERT: Israel-Lebanon offensive trading surged 210% in last 12h", timestamp: "15m ago", marketId: "israel-lebanon-offensive" },
    { severity: "critical", text: "VELOCITY ALERT: US forces enter Iran contract hit $17M volume (+140% spike)", timestamp: "45m ago", marketId: "us-forces-enter-iran" },
    { severity: "warning", text: "Israel-Lebanon offensive probability surged +15pts in 7 days (now 78%)", timestamp: "2h ago", marketId: "israel-lebanon-offensive" },
    { severity: "warning", text: "US forces enter Iran jumped +12pts this week", timestamp: "4h ago", marketId: "us-forces-enter-iran" },
    { severity: "warning", text: "Iran ceasefire odds falling: -8pts in 7 days, now at 53%", timestamp: "6h ago", marketId: "us-iran-ceasefire" },
    { severity: "info", text: "Saudi Arabia strike probability ticking up: +7pts in 7 days", timestamp: "12h ago", marketId: "saudi-strikes-iran" },
];

export function getRiskColor(probability: number): string {
    if (probability > 0.6) return "#E24B4A"; // red
    if (probability >= 0.3) return "#EF9F27"; // amber
    return "#4CAF7D"; // green
}

export function getRiskScoreColor(score: number): string {
    if (score >= 70) return "#E24B4A";
    if (score >= 40) return "#EF9F27";
    if (score >= 20) return "#4CAF7D";
    return "#2a9d8f";
}

export function getCountryRiskColorRGBA(score: number, alpha = 0.7): string {
    // Continuous color interpolation for country polygons
    if (score >= 70) return `rgba(226, 75, 74, ${alpha})`;  // red
    if (score >= 50) return `rgba(239, 159, 39, ${alpha})`; // amber
    if (score >= 30) return `rgba(239, 200, 39, ${alpha})`; // yellow-amber
    if (score >= 15) return `rgba(76, 175, 125, ${alpha})`; // green
    return `rgba(42, 157, 143, ${alpha})`;                   // teal (low risk)
}

/** Days remaining until endDate from today (March 21, 2026) */
export function daysUntil(endDate: string): number {
    const today = new Date("2026-03-21");
    const end = new Date(endDate);
    const diff = end.getTime() - today.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/** Filter markets by time horizon (days from now) */
export function filterByHorizon(markets: Market[], horizon: "7D" | "30D" | "90D" | "ALL"): Market[] {
    if (horizon === "ALL") return markets;
    const maxDays = horizon === "7D" ? 7 : horizon === "30D" ? 30 : 90;
    return markets.filter(m => daysUntil(m.endDate) <= maxDays);
}
