import { router } from "expo-router";
import { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { personaFor, rolesFromSession } from "../lib/auth";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    setError(null);
    setSubmitting(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword(
      { email, password },
    );
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace(
      personaFor(rolesFromSession(data.session)) === "field"
        ? "/(field)"
        : "/(consumer)",
    );
  }

  return (
    <View className="flex-1 justify-center bg-surface px-6">
      <Text className="mb-1 text-2xl font-semibold text-diverging-zero">
        EcoPower
      </Text>
      <Text className="mb-8 text-status-good">Sign in to your account</Text>

      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        className="mb-3 rounded-lg border border-gray-300 px-4 py-3 text-base"
      />
      <TextInput
        autoCapitalize="none"
        autoComplete="password"
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        className="mb-4 rounded-lg border border-gray-300 px-4 py-3 text-base"
      />

      {error ? (
        <Text className="mb-4 text-status-critical">{error}</Text>
      ) : null}

      <TouchableOpacity
        disabled={submitting || !email || !password}
        onPress={handleSignIn}
        className="items-center rounded-lg bg-categorical-consumption py-3 disabled:opacity-50"
      >
        <Text className="text-base font-medium text-white">
          {submitting ? "Signing in…" : "Sign in"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
