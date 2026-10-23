import { createFileRoute } from "@tanstack/react-router";
async function GET() {
  const { guestAccountRuntime } = await import("@/lib/guest-account-runtime.server");
  return Response.json(
    { enabled: guestAccountRuntime().enabled },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
export const Route = createFileRoute("/api/public/guest-account-config")({
  server: { handlers: { GET } },
});
