import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-4xl font-semibold mb-4">EcoPower 3.0</h1>
      <p className="text-lg mb-8 max-w-xl" style={{ color: "var(--color-text-secondary)" }}>
        Energy-as-a-Service for Indian distribution utilities. Metering, billing,
        and DISCOM operations on one row-secured spine.
      </p>
      <Link
        href="/login"
        className="rounded-control px-6 py-3 text-sm font-medium"
        style={{ background: "var(--color-categorical-consumption)", color: "#fff" }}
      >
        Sign in
      </Link>
    </main>
  );
}
