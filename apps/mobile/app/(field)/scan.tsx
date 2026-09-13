import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
// Meter QR/barcode scan (#46's primary path). "Instant, reliable" per the
// issue — deliberately NOT building the nameplate-OCR fallback here: that
// needs real meter photos to tune against, which this environment has no
// way to produce or judge. This half is honestly verifiable the same way
// as the rest of the app (deterministic library behavior, not a tuned
// model) — the camera hardware itself is still unverified, same standing
// caveat as everything else in this app.
import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../../lib/supabase";

type ScanOutcome =
  | { kind: "unknown_serial"; serial: string }
  | { kind: "matched"; serial: string; meterId: string }
  | {
      kind: "mismatch";
      serial: string;
      meterId: string;
      expectedSerial: string;
    };

export default function ScanMeter() {
  // Optional: navigated from a specific work order to check the scanned
  // meter against the one that work order actually expects, not just
  // "does this serial exist at all."
  const { workOrderId } = useLocalSearchParams<{ workOrderId?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleScan(serial: string) {
    if (scanned) return;
    setScanned(true);
    setError(null);

    const { data: meter, error: meterError } = await supabase
      .from("meters")
      .select("id, serial")
      .eq("serial", serial)
      .maybeSingle();
    if (meterError) {
      // Deliberately not resetting `scanned` here: the camera view stays
      // mounted and active, and if the same barcode is still in frame,
      // onBarcodeScanned fires again almost immediately — without this
      // guard, a lookup failure while pointed at a code turns into a tight
      // loop hammering the same failing query. "Try again" below requires
      // an explicit tap instead.
      setError(meterError.message);
      return;
    }
    if (!meter) {
      setOutcome({ kind: "unknown_serial", serial });
      return;
    }

    if (workOrderId) {
      // Meter feed as of #46: only meters attached directly to a
      // service_connection are checked against a work order — a DT-head
      // meter has no single work order to belong to.
      const { data: workOrder } = await supabase
        .from("work_orders")
        .select("service_connection_id, service_connections(meters(serial))")
        .eq("id", workOrderId)
        .maybeSingle();
      const expected = (
        workOrder?.service_connections as unknown as {
          meters: Array<{ serial: string }>;
        } | null
      )?.meters?.[0]?.serial;

      if (expected && expected !== meter.serial) {
        setOutcome({
          kind: "mismatch",
          serial,
          meterId: meter.id,
          expectedSerial: expected,
        });
        return;
      }
    }

    setOutcome({ kind: "matched", serial, meterId: meter.id });
  }

  if (!permission) {
    return <View className="flex-1 bg-surface" />;
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-surface px-6">
        <Text className="text-center text-gray-600">
          EcoPower needs camera access to scan a meter's QR code or barcode.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          className="rounded-lg bg-categorical-consumption px-4 py-2"
        >
          <Text className="font-medium text-white">Grant camera access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      {!outcome ? (
        <CameraView
          className="flex-1"
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["qr", "code128", "code39", "ean13"],
          }}
          onBarcodeScanned={({ data }) => handleScan(data)}
        />
      ) : (
        <View className="flex-1 items-center justify-center gap-4 bg-surface px-6">
          {outcome.kind === "matched" ? (
            <>
              <Text className="text-lg font-semibold text-status-good">
                Meter matched
              </Text>
              <Text className="text-gray-600">Serial {outcome.serial}</Text>
            </>
          ) : outcome.kind === "mismatch" ? (
            <>
              <Text className="text-lg font-semibold text-status-critical">
                Wrong meter
              </Text>
              <Text className="text-center text-gray-600">
                Scanned {outcome.serial}, but this work order expects{" "}
                {outcome.expectedSerial}.
              </Text>
            </>
          ) : (
            <>
              <Text className="text-lg font-semibold text-status-warning">
                Unknown serial
              </Text>
              <Text className="text-center text-gray-600">
                {outcome.serial} isn't in the system. Check the nameplate, or
                this meter hasn't been registered yet.
              </Text>
            </>
          )}
          <TouchableOpacity
            onPress={() => {
              setOutcome(null);
              setScanned(false);
            }}
            className="rounded-lg border border-gray-300 px-4 py-2"
          >
            <Text>Scan again</Text>
          </TouchableOpacity>
        </View>
      )}

      {error ? (
        <View className="items-center gap-3 bg-status-critical p-4">
          <Text className="text-center text-white">{error}</Text>
          <TouchableOpacity
            onPress={() => {
              setError(null);
              setScanned(false);
            }}
            className="rounded-lg bg-white px-4 py-2"
          >
            <Text className="font-medium text-status-critical">Try again</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity
        onPress={() => router.back()}
        className="absolute left-4 top-14 rounded-full bg-black/50 px-4 py-2"
      >
        <Text className="text-white">Close</Text>
      </TouchableOpacity>
    </View>
  );
}
