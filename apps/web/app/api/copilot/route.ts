// Streaming LLM copilot (#55, Tier C). Node runtime, streaming response.
export const runtime = "nodejs";

export async function POST() {
  return Response.json({ error: "not implemented yet — see #55" }, { status: 501 });
}
