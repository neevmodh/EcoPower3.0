import { router } from "expo-router";
// Placeholder home for the consumer/society-member persona (#43's
// skeleton). Real screens (live tile, bills, meter-read submission) land as
// their own issues — this proves the auth + routing shell works end to
// end, not the panels themselves.
import { Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../../lib/supabase";

export default function ConsumerHome() {
  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-surface px-6">
      <Text className="text-xl font-semibold text-diverging-zero">
        Consumer
      </Text>
      <Text className="text-center text-status-good">
        Signed in. Panels (live tile, bills, meter-read) build out from here.
      </Text>
      <TouchableOpacity
        onPress={signOut}
        className="rounded-lg border border-gray-300 px-4 py-2"
      >
        <Text>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}
