import { getStoredDebrief } from '@/lib/generateDebrief'
import DebriefPanel from './DebriefPanel'

// DB-first: read any stored debrief (fast, no AI call), then hand off to the
// client panel which renders it and offers a Regenerate button. A fresh debrief
// is only produced when the coach explicitly clicks Generate/Regenerate.
export default async function GameDebrief({ gameId }: { gameId: string }) {
  const stored = await getStoredDebrief(gameId)
  return (
    <DebriefPanel
      gameId={gameId}
      initialText={stored?.text ?? null}
      initialGeneratedAt={stored?.generatedAt ?? null}
    />
  )
}
