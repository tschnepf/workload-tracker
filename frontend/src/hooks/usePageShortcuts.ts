import { useEffect, useMemo } from 'react';

export type ShortcutBinding = {
  id: string;
  keys: string[];
  description: string;
  when?: () => boolean;
  action: () => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const input = el as HTMLInputElement;
  const type = (input.type || '').toLowerCase();
  return type !== 'checkbox' && type !== 'radio' && type !== 'button' && type !== 'submit';
}

function eventToKey(event: KeyboardEvent): string {
  const mods: string[] = [];
  if (event.metaKey) mods.push('meta');
  if (event.ctrlKey) mods.push('ctrl');
  if (event.altKey) mods.push('alt');
  if (event.shiftKey) mods.push('shift');
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  return [...mods, key].join('+');
}

export function usePageShortcuts({ bindings }: { bindings: ShortcutBinding[] }) {
  const normalized = useMemo(() => {
    const map = new Map<string, ShortcutBinding>();
    bindings.forEach((binding) => {
      binding.keys.forEach((key) => map.set(key.toLowerCase(), binding));
    });
    return map;
  }, [bindings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = eventToKey(event);
      const binding = normalized.get(key);
      if (!binding) return;
      if (binding.when && !binding.when()) return;
      if (isEditableTarget(event.target) && !key.endsWith('escape')) return;
      event.preventDefault();
      try {
        binding.action();
      } catch {}
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [normalized]);
}
