'use client';

import * as React from 'react';
import { AlertsDropdown } from './alerts-dropdown';
import { ProfileDropdown } from './profile-dropdown';
import { useSocket, socketInstance } from '@/hooks/use-socket';

function LiveClock() {
  const [time, setTime] = React.useState('');

  React.useEffect(() => {
    const fmt = () =>
      new Intl.DateTimeFormat('fr', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date());

    setTime(fmt());
    const id = window.setInterval(() => setTime(fmt()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!time) return null;

  return (
    <span
      style={{
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        fontSize: '9px',
        color: 'var(--sb-text-dim-rail)',
        letterSpacing: '0.08em',
      }}
    >
      {time}
    </span>
  );
}

function ConnectionStatus() {
  useSocket(); 
  const [connected, setConnected] = React.useState(() => !!socketInstance?.connected);

  React.useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    if (socketInstance) {
      setConnected(socketInstance.connected);
      socketInstance.on('connect', onConnect);
      socketInstance.on('disconnect', onDisconnect);
    }

    const t = window.setTimeout(() => {
      if (socketInstance) {
        setConnected(socketInstance.connected);
        socketInstance.on('connect', onConnect);
        socketInstance.on('disconnect', onDisconnect);
      }
    }, 0);

    return () => {
      window.clearTimeout(t);
      socketInstance?.off('connect', onConnect);
      socketInstance?.off('disconnect', onDisconnect);
    };
  }, []);

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span
        style={{
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          background: connected ? '#2D7A3A' : '#8A8680',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontSize: '8px',
          color: 'var(--sb-text-dim-rail)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {connected ? 'EN LIGNE' : 'HORS LIGNE'}
      </span>
    </span>
  );
}

export function SystemRail() {
  return (
    <div
      style={{
        height: '34px',
        background: 'var(--sb-rail)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '16px',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontSize: '10px',
          fontWeight: '700',
          color: 'var(--sb-text-on-rail)',
          letterSpacing: '0.10em',
        }}
      >
        GMAO
      </span>

      <div style={{ flex: 1, height: '1px', background: '#2E2C28' }} />

      <LiveClock />
      <ConnectionStatus />
      <AlertsDropdown />
      <ProfileDropdown />
    </div>
  );
}
