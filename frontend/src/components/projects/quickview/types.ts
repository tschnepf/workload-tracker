export type QuickViewPlacement = 'bottom-start' | 'top-start' | 'auto' | 'center';

export type OpenOpts = {
  placement?: QuickViewPlacement;
  source?: string;
  debug?: boolean;
};

export type QuickViewState = {
  isOpen: boolean;
  projectId: number | null;
  anchorRect: DOMRect | null;
  opts?: OpenOpts;
};

export type QuickViewContextValue = {
  state: QuickViewState;
  open: (projectId: number, anchorEl?: HTMLElement | null, opts?: OpenOpts) => void;
  close: () => void;
  registerOwnedPortal: (el: HTMLElement) => void;
  unregisterOwnedPortal: (el: HTMLElement) => void;
  reposition: () => void;
};
