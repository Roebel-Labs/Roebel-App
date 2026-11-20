// Production wiring for the card designer routes: Supabase (service role) stores and the
// designer switch. Server-only; never loaded by tests.
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseCredentialStore } from "../store-supabase";
import type { DesignDeps } from "./drafts";
import { supabaseDesignStore } from "./store-supabase";

export const DESIGNER_SETTING = "credential_designer_enabled";

export function designDeps(): DesignDeps {
  const admin = createAdminClient();
  return {
    store: supabaseDesignStore(admin),
    credStore: supabaseCredentialStore(admin),
    async settings() {
      const { data, error } = await admin.from("app_settings").select("value").eq("key", DESIGNER_SETTING).maybeSingle();
      if (error) throw new Error(error.message);
      return typeof data?.value === "string" ? data.value : null;
    },
    now: () => Date.now(),
  };
}
