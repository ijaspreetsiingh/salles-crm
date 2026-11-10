/**
 * useSocket — subscribe to a socket.io event from any React component.
 *
 * The socket is connected once and reused. Calling useSocket multiple times
 * for the same event (e.g. two open tabs) stacks the handlers correctly
 * because socket.io allows multiple listeners per event.
 *
 * Usage:
 *   useSocket("message:new", (msg: MessageDto) => { ... });
 *   useSocket("conversation:updated", (c) => { ... });
 */
import { useEffect } from "react";
import { getSocket, connectSocket } from "@/lib/socket";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSocket(event: string, handler: (...args: any[]) => void): void {
  useEffect(() => {
    const s = getSocket();
    connectSocket();
    s.on(event, handler);
    return () => {
      s.off(event, handler);
    };
  }, [event, handler]);
}
