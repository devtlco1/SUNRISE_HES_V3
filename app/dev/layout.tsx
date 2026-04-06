export default function DevToolsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-950 dark:text-amber-100">
        INTERNAL — Developer tools · Not a production end-user feature
      </div>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  )
}
