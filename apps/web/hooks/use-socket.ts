'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';

let socketInstance: Socket | null = null;

/**
 * Returns the singleton Socket.io connection.
 * Connects when an accessToken is present, disconnects when it's cleared.
 * Usage: const { socket } = useSocket(); socket?.on('work_order_updated', handler)
 */
export function useSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) {
      if (socketInstance) {
        socketInstance.disconnect();
        socketInstance = null;
      }
      socketRef.current = null;
      return;
    }

    if (!socketInstance) {
      const backendOrigin =
        typeof window !== 'undefined'
          ? window.location.origin.replace(':3001', ':3000')
          : 'http://localhost:3000';

      socketInstance = io(backendOrigin, {
        auth: { token: accessToken },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });

      socketInstance.on('connect', () => {
        if (process.env.NODE_ENV === 'development') {
          console.info('[Socket] connected:', socketInstance?.id);
        }
      });

      socketInstance.on('disconnect', (reason) => {
        if (process.env.NODE_ENV === 'development') {
          console.info('[Socket] disconnected:', reason);
        }
      });
    } else {
      // Update auth token on re-connect
      socketInstance.auth = { token: accessToken };
    }

    socketRef.current = socketInstance;
  }, [accessToken]);

  return { socket: socketRef.current };
}
