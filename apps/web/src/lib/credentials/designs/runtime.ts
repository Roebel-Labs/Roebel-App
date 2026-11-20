// Production wiring for the card designer routes: Supabase (service role) stores, the `images`
// bucket and the designer switch. Server-only; never loaded by tests.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseCredentialStore } from "../store-supabase";
import type { AssetDeps, AssetStorage } from "./assets";
import { supabaseDesignStore } from "./store-supabase";

export const DESIGNER_SETTING = "credential_designer_enabled";
export const DESIGN_BUCKET = "images";

export function supabaseAssetStorage(admin: SupabaseClient): AssetStorage {
  const bucket = () => admin.storage.from(DESIGN_BUCKET);
  return {
    async put(path, bytes, mime) {
      // Content-addressed paths: an existing object already holds these bytes.
      const { error } = await bucket().upload(path, bytes, { contentType: mime, upsert: true, cacheControl: "31536000" });
      if (error) throw new Error(`storage upload failed: ${error.message}`);
    },
    async get(path) {
      const { data, error } = await bucket().download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    publicUrl: (path) => bucket().getPublicUrl(path).data.publicUrl,
  };
}

export function designDeps(): AssetDeps {
  const admin = createAdminClient();
  return {
    store: supabaseDesignStore(admin),
    credStore: supabaseCredentialStore(admin),
    storage: supabaseAssetStorage(admin),
    async settings() {
      const { data, error } = await admin.from("app_settings").select("value").eq("key", DESIGNER_SETTING).maybeSingle();
      if (error) throw new Error(error.message);
      return typeof data?.value === "string" ? data.value : null;
    },
    now: () => Date.now(),
  };
}

