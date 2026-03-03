import * as React from 'react';
import type { SaveState } from '@/components/ux/SaveStateBadge';

export type UseSaveStateControllerReturn = {
  saveState: SaveState;
  saveStateMessage: string | undefined;
  markSaveState: (nextState: SaveState, message?: string, autoResetMs?: number) => void;
  retryRef: React.MutableRefObject<null | (() => Promise<void>)>;
  setRetryHandler: (handler: null | (() => Promise<void>)) => void;
};

export function useSaveStateController(): UseSaveStateControllerReturn {
  const [saveState, setSaveState] = React.useState<SaveState>('idle');
  const [saveStateMessage, setSaveStateMessage] = React.useState<string | undefined>(undefined);
  const timerRef = React.useRef<number | null>(null);
  const retryRef = React.useRef<null | (() => Promise<void>)>(null);

  const markSaveState = React.useCallback((nextState: SaveState, message?: string, autoResetMs = 0) => {
    setSaveState(nextState);
    setSaveStateMessage(message);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (autoResetMs > 0) {
      timerRef.current = window.setTimeout(() => {
        setSaveState('idle');
        setSaveStateMessage(undefined);
        timerRef.current = null;
      }, autoResetMs);
    }
  }, []);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const setRetryHandler = React.useCallback((handler: null | (() => Promise<void>)) => {
    retryRef.current = handler;
  }, []);

  return {
    saveState,
    saveStateMessage,
    markSaveState,
    retryRef,
    setRetryHandler,
  };
}
