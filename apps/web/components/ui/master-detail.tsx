'use client';

import { ReactNode, useRef, useEffect, useState } from 'react';

const PANEL_WIDTH = 360;
const ANIM_MS = 220;

interface MasterDetailProps {
  list: ReactNode;
  panel: ReactNode;
  panelOpen: boolean;
}

export function MasterDetail({ list, panel, panelOpen }: MasterDetailProps) {
  const [panelMounted, setPanelMounted] = useState(panelOpen);
  const [panelVisible, setPanelVisible] = useState(panelOpen);
  const panelCache = useRef<ReactNode>(null);

  if (panel !== null) panelCache.current = panel;

  useEffect(() => {
    if (panelOpen) {
      setPanelMounted(true);
      const id = setTimeout(() => setPanelVisible(true), 16);
      return () => clearTimeout(id);
    } else {
      setPanelVisible(false);
      const id = setTimeout(() => {
        setPanelMounted(false);
        panelCache.current = null;
      }, ANIM_MS + 20);
      return () => clearTimeout(id);
    }
  }, [panelOpen]);

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {list}
      </div>
      {panelMounted && (
        <div
          style={{
            width: panelVisible ? PANEL_WIDTH : 0,
            flexShrink: 0,
            borderLeft: '1px solid var(--sb-border)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--sb-surface)',
            transition: `width ${ANIM_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
          }}
        >
          {panelCache.current}
        </div>
      )}
    </div>
  );
}
