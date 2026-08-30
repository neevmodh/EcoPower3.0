// Point uptime monitoring (#56) at this on day one — a measured 99.94% over
// weeks beats a claimed 99.99%, and elapsed time cannot be manufactured later.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "ecopower-web",
    time: new Date().toISOString(),
  });
}
