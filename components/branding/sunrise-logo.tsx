import { cn } from "@/lib/utils"

type Props = {
  className?: string
  /** Shown when the decorative logo is hidden or slow to load. */
  title?: string
}

export function SunriseLogo({ className, title = "SUNRISE HES" }: Props) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- large vendor SVG; avoid Image optimizer cost */}
      <img
        src="/branding/sunrise-logo.svg"
        alt=""
        className="h-9 w-auto max-w-[200px] object-contain object-left"
        decoding="async"
      />
      <span className="sr-only">{title}</span>
    </span>
  )
}
