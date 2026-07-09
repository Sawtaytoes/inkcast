import { useEffect, useState } from "preact/hooks"
import { device, settings } from "../state.ts"

/**
 * Photo Frame view: a full-bleed <img> served by `/d/<id>/photo`, which returns
 * a fresh face-cropped Immich photo per request. Rotation is client-side off
 * the `photoIntervalMinutes` setting (pushed from HA) — bumping a counter
 * changes the URL and forces the browser to fetch the next photo. When the
 * endpoint has nothing to serve (Immich off, or no People/Query configured) it
 * answers 204, the <img> errors, and a placeholder shows instead.
 */
export const PhotoFrame = () => {
  const profile = device.value
  const intervalMinutes =
    settings.value.photoIntervalMinutes
  const [rotationCounter, setRotationCounter] = useState(0)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const intervalMillis =
      Math.max(1, intervalMinutes) * 60_000
    const handle = setInterval(() => {
      setRotationCounter((counter) => counter + 1)
    }, intervalMillis)
    return () => {
      clearInterval(handle)
    }
  }, [intervalMinutes])

  if (!profile) {
    return null
  }

  return (
    <div class="photo-frame">
      {hasError ? (
        <div class="photo-frame-empty">
          No photos configured
        </div>
      ) : null}
      <img
        class={
          hasError
            ? "photo-frame-img hidden"
            : "photo-frame-img"
        }
        src={`/d/${profile.id}/photo?n=${rotationCounter}`}
        alt=""
        onLoad={() => {
          setHasError(false)
        }}
        onError={() => {
          setHasError(true)
        }}
      />
    </div>
  )
}
