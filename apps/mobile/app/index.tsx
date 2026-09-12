import { Redirect } from "expo-router";
// The entry route: figure out whether there's a session, and if so which
// persona it belongs to, then redirect. This is the mobile equivalent of
// web's middleware role gate (lib/supabase/middleware.ts) — coarse routing
// only, never authorization. RLS is the real gate on every query either
// app makes (#5, #43).
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { personaFor, rolesFromSession } from "../lib/auth";
import { supabase } from "../lib/supabase";

export default function Index() {
  const [ready, setReady] = useState(false);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setTarget("/login");
      } else {
        setTarget(
          personaFor(rolesFromSession(session)) === "field"
            ? "/(field)"
            : "/(consumer)",
        );
      }
      setReady(true);
    });
  }, []);

  if (!ready || !target) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={target} />;
}
