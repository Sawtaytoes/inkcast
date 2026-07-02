import { timer } from "rxjs"

const MINUTE_MILLISECONDS = 60_000

/**
 * Re-pushes every device whose active view is the clock at the top of each
 * minute, so the panel time is real instead of frozen at the last manual
 * refresh. The first tick is aligned to the next minute boundary; devices on
 * other views are skipped (a view switch pushes immediately on its own).
 */
export const startClockTicker = ({
  onMinuteTick,
}: {
  onMinuteTick: () => void
}) => {
  const millisecondsUntilNextMinute =
    MINUTE_MILLISECONDS - (Date.now() % MINUTE_MILLISECONDS)

  const subscription = timer(
    millisecondsUntilNextMinute,
    MINUTE_MILLISECONDS,
  ).subscribe(() => {
    onMinuteTick()
  })

  return {
    close: () => {
      subscription.unsubscribe()
    },
  }
}
