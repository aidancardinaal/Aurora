import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { resolve } from "path";

export async function GET() {
    try {
        const filePath = resolve(process.cwd(), "../markets.json");
        const data = JSON.parse(readFileSync(filePath, "utf-8"));
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ error: "markets.json not found" }, { status: 404 });
    }
}
