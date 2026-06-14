"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { TraceEvent } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3100";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3100/ws";

export function useWebSocket() {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  // Load historical events on mount
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/events?limit=500`);
      if (res.ok) {
        const data: TraceEvent[] = await res.json();
        if (data.length > 0) {
          setEvents(data.reverse());
        }
      }
    } catch {
      // Server might not be ready yet
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log("[ws] Connected to Event Server");
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        // Skip non-trace messages (like welcome "connected")
        if (!data.trace_id || !data.type) return;
        setEvents((prev) => [...prev.slice(-999), data as TraceEvent]);
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log("[ws] Disconnected, reconnecting in 3s...");
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    loadHistory();
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [loadHistory, connect]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { events, connected, clearEvents };
}
