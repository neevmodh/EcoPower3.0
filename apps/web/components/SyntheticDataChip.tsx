// Non-dismissible by design (#74/#75). Per-consumer smart-meter data is not
// published anywhere in India — every entry in this competition demonstrates
// on generated data (DATA.md §1). The chip is how nobody in the room
// mistakes this platform's numbers for real energy advice, and the link
// goes to a page that names the actual sources, not a vague disclaimer.
import Link from "next/link";
import { PanelIcon } from "./Icon";

export function SyntheticDataChip() {
  return (
    <Link
      href="/about-the-data"
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 h-6 text-[10.5px] font-medium shrink-0 transition-colors duration-state"
      style={{
        background: "var(--color-surface-sunken)",
        color: "var(--color-text-tertiary)",
        border: "1px solid var(--color-border)",
      }}
      title="Every number on this page is generated. See what's real vs. synthesised."
    >
      <PanelIcon name="info" size={11} />
      Synthetic data · calibrated to GERC FY26 / MoP FY25
    </Link>
  );
}
