/**
 * Derive an accent colour from album art, client-side: downscale to 16×16 on
 * a canvas, bucket pixels by hue, and pick the most saturated-populous
 * bucket. ~1 KB instead of a colour-extraction dependency.
 *
 * Artwork often comes from another origin without CORS headers — reading a
 * tainted canvas throws, so this resolves to null and the UI keeps the
 * neutral accent. Never applied on mono/grayscale panels (caller's job).
 */
export const extractAccentColor = (
  imageUrl: string,
): Promise<string | null> =>
  new Promise((resolvePromise) => {
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onerror = () => resolvePromise(null)
    image.onload = () => {
      try {
        const size = 16
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext("2d")
        if (!context) {
          resolvePromise(null)
          return
        }
        context.drawImage(image, 0, 0, size, size)
        const { data } = context.getImageData(
          0,
          0,
          size,
          size,
        )

        // Score each pixel by saturation×value; accumulate per hue bucket.
        const bucketCount = 12
        const scores = new Array<number>(bucketCount).fill(
          0,
        )
        const sums = Array.from(
          { length: bucketCount },
          () => ({ r: 0, g: 0, b: 0, weight: 0 }),
        )
        for (
          let index = 0;
          index < data.length;
          index += 4
        ) {
          const red = data[index]! / 255
          const green = data[index + 1]! / 255
          const blue = data[index + 2]! / 255
          const max = Math.max(red, green, blue)
          const min = Math.min(red, green, blue)
          const delta = max - min
          const saturation = max === 0 ? 0 : delta / max
          const score = saturation * max
          if (score < 0.15) {
            continue // Grays/near-blacks don't vote.
          }
          let hue = 0
          if (delta > 0) {
            if (max === red) {
              hue = ((green - blue) / delta) % 6
            } else if (max === green) {
              hue = (blue - red) / delta + 2
            } else {
              hue = (red - green) / delta + 4
            }
            hue = (hue * 60 + 360) % 360
          }
          const bucket = Math.floor(
            (hue / 360) * bucketCount,
          )
          scores[bucket]! += score
          const sum = sums[bucket]!
          sum.r += red * score
          sum.g += green * score
          sum.b += blue * score
          sum.weight += score
        }

        const bestBucket = scores.indexOf(
          Math.max(...scores),
        )
        const best = sums[bestBucket]
        if (!best || best.weight === 0) {
          resolvePromise(null)
          return
        }
        const toChannel = (value: number) =>
          Math.round((value / best.weight) * 255)
        resolvePromise(
          `rgb(${toChannel(best.r)} ${toChannel(best.g)} ${toChannel(best.b)})`,
        )
      } catch {
        resolvePromise(null) // Tainted canvas (no CORS) or decode failure.
      }
    }
    image.src = imageUrl
  })
