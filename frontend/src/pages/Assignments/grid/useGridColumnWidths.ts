import { useEffect, useState } from 'react';

export function useGridColumnWidthsAssign() {
  const [clientColumnWidth, setClientColumnWidth] = useState(210);
  const [projectColumnWidth, setProjectColumnWidth] = useState(300);
  const [isResizing, setIsResizing] = useState<'client' | 'project' | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  useEffect(() => {
    try {
      const cw = localStorage.getItem('assignGrid:clientColumnWidth');
      const pw = localStorage.getItem('assignGrid:projectColumnWidth');
      if (cw) {
        const n = parseInt(cw, 10); if (!Number.isNaN(n)) setClientColumnWidth(Math.max(80, n));
      }
      if (pw) {
        const n = parseInt(pw, 10); if (!Number.isNaN(n)) setProjectColumnWidth(Math.max(80, n));
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const fix = localStorage.getItem('assignGrid:widthsFix_v2025_10');
      if (!fix) {
        setClientColumnWidth(w => (w < 180 ? 210 : w));
        setProjectColumnWidth(w => (w < 260 ? 300 : w));
        localStorage.setItem('assignGrid:widthsFix_v2025_10', '1');
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem('assignGrid:clientColumnWidth', String(clientColumnWidth)); } catch {}
  }, [clientColumnWidth]);
  useEffect(() => {
    try { localStorage.setItem('assignGrid:projectColumnWidth', String(projectColumnWidth)); } catch {}
  }, [projectColumnWidth]);

  return {
    clientColumnWidth,
    setClientColumnWidth,
    projectColumnWidth,
    setProjectColumnWidth,
    isResizing,
    setIsResizing,
    resizeStartX,
    setResizeStartX,
    resizeStartWidth,
    setResizeStartWidth,
  } as const;
}

