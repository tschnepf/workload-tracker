// Minimal View Transition wrapper with safe fallbacks

export type ViewTransitionOptions = {
  // Placeholder for future options (e.g., types of transitions)
};

export function supportsViewTransitions(): boolean {
  return typeof document !== 'undefined' && 'startViewTransition' in document;
}

export async function startViewTransition(
  callback: () => void | Promise<void>,
  _opts?: ViewTransitionOptions
): Promise<void> {
  try {
    const anyDoc: any = document as any;
    if (anyDoc && typeof anyDoc.startViewTransition === 'function') {
      // Wrap callback so we can await async work if provided
      const vt = anyDoc.startViewTransition(async () => {
        await callback();
      });
      // Wait for transition to finish for deterministic telemetry chaining
      if (vt && typeof vt.finished?.then === 'function') {
        await vt.finished;
      }
      return;
    }
  } catch {
    // fall through to fallback
  }
  // Fallback: just perform the callback synchronously
  await callback();
}

