"use client";

// Real PDF export — 2.0's genuinely-working feature (its jsPDF invoice
// generation was the one export path the earlier audit confirmed was
// real, not orphaned or broken). Every figure here is a prop passed in
// from the server-rendered invoice data, never recomputed — this button
// formats, it does not calculate.

type InvoiceLine = { label: string; amount_paise: number };

export function InvoicePdfButton({
  consumerNumber,
  billingPeriodStart,
  billingPeriodEnd,
  unitsKwh,
  totalPaise,
  status,
  lines,
}: {
  consumerNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  unitsKwh: number;
  totalPaise: number;
  status: string;
  lines: InvoiceLine[];
}) {
  async function download() {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const inr = (paise: number) => `Rs ${(paise / 100).toFixed(2)}`;

    doc.setFontSize(20);
    doc.setTextColor(27, 175, 122); // --color-categorical-third
    doc.text("EcoPower", 14, 20);

    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text("Energy-as-a-Service Invoice", 14, 28);

    doc.setDrawColor(228, 226, 221);
    doc.line(14, 33, 196, 33);

    doc.setFontSize(10);
    doc.text(`Consumer: ${consumerNumber}`, 14, 42);
    doc.text(
      `Billing period: ${new Date(billingPeriodStart).toLocaleDateString("en-IN")} – ${new Date(billingPeriodEnd).toLocaleDateString("en-IN")}`,
      14,
      49,
    );
    doc.text(`Units imported: ${unitsKwh.toFixed(1)} kWh`, 14, 56);
    doc.text(`Status: ${status}`, 14, 63);

    let y = 76;
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text("Line items", 14, y);
    y += 8;

    doc.setFontSize(9.5);
    doc.setTextColor(60, 60, 60);
    for (const line of lines) {
      doc.text(line.label, 14, y);
      doc.text(inr(line.amount_paise), 196, y, { align: "right" });
      y += 7;
    }

    doc.setDrawColor(228, 226, 221);
    doc.line(14, y + 2, 196, y + 2);
    y += 12;

    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text("Total", 14, y);
    doc.text(inr(totalPaise), 196, y, { align: "right" });

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      "Every line traces to the two meter register reads it was computed from — available in the app.",
      14,
      285,
    );

    doc.save(`ecopower-invoice-${billingPeriodStart}.pdf`);
  }

  return (
    <button
      onClick={download}
      className="rounded-control px-3 py-1.5 text-xs font-semibold border"
      style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
    >
      📄 PDF
    </button>
  );
}
