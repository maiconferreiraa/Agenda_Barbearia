export function Spinner({ full }: { full?: boolean }) {
  const el = (
    <span className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
  )
  if (!full) return el
  return (
    <div className="flex min-h-[40vh] items-center justify-center">{el}</div>
  )
}
