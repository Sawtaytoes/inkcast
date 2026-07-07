import type { ServerToClientMessage } from "@castkit/shared/protocol/ws"

/**
 * The per-device WebSocket hub for browser-mode (Slatecast) screens. Each
 * kiosk page opens one socket; the server pushes a full `snapshot` on connect
 * (built by the caller) and fans deltas out here. Socket bookkeeping only —
 * message *meaning* lives in browserMode.ts.
 */

/** The minimal socket surface the hub needs (matches hono/ws WSContext). */
export type HubSocket = {
  send: (data: string) => void
}

export type BrowserHub = ReturnType<typeof createBrowserHub>

export const createBrowserHub = ({
  onConnectionCountChange,
}: {
  /** Fires with the new count when a device gains/loses its first/last socket. */
  onConnectionCountChange: (params: {
    deviceId: string
    connectionCount: number
  }) => void
}) => {
  const socketsByDeviceId = new Map<
    string,
    Set<HubSocket>
  >()

  const send = (
    socket: HubSocket,
    message: ServerToClientMessage,
  ) => {
    try {
      socket.send(JSON.stringify(message))
    } catch {
      // A dying socket's close handler does the bookkeeping.
    }
  }

  return {
    addSocket: ({
      deviceId,
      socket,
    }: {
      deviceId: string
      socket: HubSocket
    }) => {
      const sockets =
        socketsByDeviceId.get(deviceId) ?? new Set()
      sockets.add(socket)
      socketsByDeviceId.set(deviceId, sockets)
      onConnectionCountChange({
        deviceId,
        connectionCount: sockets.size,
      })
    },
    removeSocket: ({
      deviceId,
      socket,
    }: {
      deviceId: string
      socket: HubSocket
    }) => {
      const sockets = socketsByDeviceId.get(deviceId)
      if (!sockets?.delete(socket)) {
        return
      }
      onConnectionCountChange({
        deviceId,
        connectionCount: sockets.size,
      })
    },
    sendTo: ({
      socket,
      message,
    }: {
      socket: HubSocket
      message: ServerToClientMessage
    }) => {
      send(socket, message)
    },
    broadcast: ({
      deviceId,
      message,
    }: {
      deviceId: string
      message: ServerToClientMessage
    }) => {
      socketsByDeviceId.get(deviceId)?.forEach((socket) => {
        send(socket, message)
      })
    },
    getConnectionCount: (deviceId: string) =>
      socketsByDeviceId.get(deviceId)?.size ?? 0,
  }
}
