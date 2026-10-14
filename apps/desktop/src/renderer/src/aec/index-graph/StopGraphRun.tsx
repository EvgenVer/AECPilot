// «Остановить построение» (task 3M.5, owner decision 2026-10-14): stops right
// away. The hint says the price before the click — the document in progress is
// thrown away and built again next time.

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'

export function StopGraphRun({ stopping }: { stopping: boolean }): React.JSX.Element {
  const t = useAecT()
  return (
    <Button
      disabled={stopping}
      onClick={() => void window.aecpilot.stopGraphRun()}
      size="sm"
      title={t('graphAdd.stopHint')}
      variant="outline"
    >
      {stopping ? t('graphAdd.stopping') : t('graphAdd.stop')}
    </Button>
  )
}
