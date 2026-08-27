import { NextResponse } from 'next/server';
import { searchCode } from '@/../../../src/rag/searchCode.js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = body.query as string;
    const filters = body.filters;

    if (!query) {
      return NextResponse.json({ error: "No query provided." }, { status: 400 });
    }

    const results = await searchCode(query, filters);

    return NextResponse.json({
      success: true,
      results
    });

  } catch (error: any) {
    console.error("Search failed:", error);
    return NextResponse.json({ error: error.message || "Failed to search game code." }, { status: 500 });
  }
}
