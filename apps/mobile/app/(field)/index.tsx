import { router } from "expo-router";
// Placeholder home for the field-technician persona (#43's skeleton).
// Camera/OCR (#46/#47), the offline outbox (#45), and the commissioning
// flow (#48) all land as their own issues on top of this shell.
import { Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../../lib/supabase";

export default function FieldHome() {
  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-surface px-6">
      <Text className="text-xl font-semibold text-diverging-zero">
        Field Technician
      </Text>
      <Text className="text-center text-status-good">
        Signed in. Work orders, meter scan, and the offline outbox build out
        from here.
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
