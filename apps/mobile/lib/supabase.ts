// The whole architectural point of #43: no bespoke session logic to get
// wrong. Supabase issues the JWT, RLS enforces it — web stores the token in
// an httpOnly cookie via @supabase/ssr, this stores it in SecureStore
// (Keychain on iOS, Keystore on Android). Never AsyncStorage: it's plaintext
// on disk, and a JWT sitting in plaintext on a lost/rooted device is a real
// account-takeover path, not a theoretical one.
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example) — " +
      "the anon key is safe to ship in the client bundle, RLS is the real boundary (same as web).",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based session detection on native — there's no browser
    // location bar for a magic-link/OAuth redirect to land in.
    detectSessionInUrl: false,
  },
});
