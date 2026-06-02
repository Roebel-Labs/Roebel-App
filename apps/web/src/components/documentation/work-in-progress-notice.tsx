import { Info } from "lucide-react"

/**
 * German notice shown on the documentation overview and every chapter page:
 * the docs are still in progress and feedback / proposals are welcome.
 */
export function WorkInProgressNotice() {
  return (
    <div className="flex items-start gap-3 rounded-[10px] border border-[#194383]/20 bg-[#194383]/5 p-4 text-sm text-foreground">
      <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#194383]" />
      <p>
        <span className="font-medium">Diese Dokumentation befindet sich noch in Arbeit.</span>{" "}
        Verbesserungsvorschläge, Anregungen oder andere Vorschläge sind jederzeit herzlich
        willkommen — wir freuen uns über dein Feedback!
      </p>
    </div>
  )
}

export default WorkInProgressNotice
