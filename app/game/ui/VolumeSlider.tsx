"use client";

/** A single labeled volume row — range input + live percentage readout,
 * styled to match the existing menu's amber/black look rather than a
 * default browser slider. Shared by the main menu, pause menu, and
 * multiplayer lobby's Sound panels so there's exactly one slider
 * implementation driving the one SoundSettingsContext. */
export function VolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="font-sinhala flex flex-col gap-2">
      <div className="flex items-center justify-between text-[12px] tracking-widest text-amber-100/60">
        <span>{label}</span>
        <span className="text-amber-100/90">{pct}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={label}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-amber-100/15 accent-amber-100 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-amber-100 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-100"
      />
    </div>
  );
}
