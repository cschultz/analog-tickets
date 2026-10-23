import { createFileRoute } from "@tanstack/react-router";
import { publicSupabaseConfigResponse } from "@/lib/public-supabase-config";

export const Route = createFileRoute("/api/public/supabase-config")({
  server: {
    handlers: {
      GET: () => publicSupabaseConfigResponse(process.env),
    },
  },
});
