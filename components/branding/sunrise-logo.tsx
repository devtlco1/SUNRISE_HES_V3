import { cn } from "@/lib/utils"

type Props = {
  className?: string
  /** Tailwind / size classes for the `<img>` (e.g. login vs sidebar). */
  imgClassName?: string
  /** Shown when the decorative logo is hidden or slow to load. */
  title?: string
}

export function SunriseLogo({
  className,
  imgClassName,
  title = "SUNRISE HES",
}: Props) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- large vendor SVG; avoid Image optimizer cost */}
      <img
        src="/branding/sunrise-logo.svg"
        alt=""
        className={cn(
          "h-11 w-auto max-w-[220px] object-contain object-left",
          imgClassName
        )}
        decoding="async"
      />
      <span className="sr-only">{title}</span>
    </span>
  )
}
