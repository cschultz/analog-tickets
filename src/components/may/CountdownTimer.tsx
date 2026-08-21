import { useEffect, useState } from "react";
import { COLORS, typography } from "@/styles/may-theme";

interface CountdownTimerProps {
  /** ISO date string for the target deadline */
  targetDate: string;
  /** Small label shown above the digits */
  label?: string;
  /** Color theme: 'dark' for light backgrounds, 'light' for dark backgrounds */
  variant?: "dark" | "light";
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

const calculateTimeLeft = (target: number): TimeLeft => {
  const diff = target - Date.now();
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    expired: false,
  };
};

const CountdownTimer = ({ targetDate, label = "Entries close in", variant = "light" }: CountdownTimerProps) => {
  const target = new Date(targetDate).getTime();
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calculateTimeLeft(target));

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(calculateTimeLeft(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  const isLight = variant === "light";
  const labelColor = isLight ? COLORS.mustard : COLORS.denim;
  const digitColor = isLight ? COLORS.white : COLORS.charcoal;
  const unitColor = isLight ? COLORS.dustySky : COLORS.charcoal;
  const dividerColor = isLight ? `${COLORS.dustySky}30` : `${COLORS.charcoal}25`;

  if (timeLeft.expired) {
    return (
      <div className="inline-flex flex-col" aria-live="polite">
        <p className="text-xs uppercase mb-2" style={{ ...typography.caption, color: labelColor, letterSpacing: "0.16em" }}>
          {label}
        </p>
        <p className="text-base" style={{ ...typography.subhead, color: digitColor }}>
          Entries are closed.
        </p>
      </div>
    );
  }

  const units: Array<{ value: number; label: string }> = [
    { value: timeLeft.days, label: "Days" },
    { value: timeLeft.hours, label: "Hrs" },
    { value: timeLeft.minutes, label: "Min" },
    { value: timeLeft.seconds, label: "Sec" },
  ];

  return (
    <div className="inline-flex flex-col" aria-live="polite">
      <p className="text-xs uppercase mb-3" style={{ ...typography.caption, color: labelColor, letterSpacing: "0.16em" }}>
        {label}
      </p>
      <div className="flex items-stretch gap-3 sm:gap-4">
        {units.map((unit, i) => (
          <div key={unit.label} className="flex items-stretch gap-3 sm:gap-4">
            <div className="flex flex-col items-center min-w-[3rem] sm:min-w-[3.5rem]">
              <span
                className="text-[1.75rem] sm:text-[2.25rem] leading-none tabular-nums"
                style={{ ...typography.headline, color: digitColor, fontWeight: 500 }}
              >
                {String(unit.value).padStart(2, "0")}
              </span>
              <span
                className="text-[10px] uppercase mt-1"
                style={{ ...typography.caption, color: unitColor, opacity: 0.7, letterSpacing: "0.14em" }}
              >
                {unit.label}
              </span>
            </div>
            {i < units.length - 1 && (
              <span
                className="text-[1.5rem] sm:text-[2rem] leading-none self-start"
                style={{ ...typography.headline, color: dividerColor, fontWeight: 300 }}
              >
                :
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CountdownTimer;
