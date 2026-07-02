/**
 * In-memory SERVER-WIDE user configuration, edited from Home Assistant via
 * the "Inkcast Server" MQTT device's config entities. Persistence is the
 * retained MQTT state topic (same pattern as the per-device knobs): the
 * server publishes values retained and restores them on boot, so these
 * settings live in HA — not in env vars.
 */
export type GlobalConfigStore = {
  /** Players follow mode must ignore even while playing. */
  getFollowExcludedEntityIds: () => ReadonlySet<string>
  setFollowExcludedEntityIds: (
    entityIds: readonly string[],
  ) => void
  /** Whether the exclusion list has been set this run (blocks restores). */
  getHasFollowExcludedEntityIds: () => boolean
}

export const createGlobalConfigStore =
  (): GlobalConfigStore => {
    const holder: {
      followExcludedEntityIds?: ReadonlySet<string>
    } = {}

    return {
      getFollowExcludedEntityIds: () =>
        holder.followExcludedEntityIds ?? new Set(),
      setFollowExcludedEntityIds: (entityIds) => {
        holder.followExcludedEntityIds = new Set(entityIds)
      },
      getHasFollowExcludedEntityIds: () =>
        holder.followExcludedEntityIds !== undefined,
    }
  }
