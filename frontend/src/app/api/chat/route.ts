// app/api/chat/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { message } = await req.json();

  // later: call Azure OpenAI + Azure Search here
  return NextResponse.json({ reply: `Echo: ${message}` });
}
