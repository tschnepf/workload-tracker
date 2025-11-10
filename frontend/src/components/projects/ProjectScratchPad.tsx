import React from 'react';
import { projectsApi } from '@/services/api';

type Props = {
  projectId: number;
  initialHtml: string | undefined | null;
  canEdit?: boolean;
};

export default function ProjectScratchPad({ projectId, initialHtml, canEdit = true }: Props) {
  // Keep the editor uncontrolled to avoid caret jumps and reversed typing
  const [html, setHtml] = React.useState<string>(initialHtml || '');
  const [savedHtml, setSavedHtml] = React.useState<string>(initialHtml || '');
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const editorRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    // Initialize/replace content directly in the DOM without re-rendering
    if (editorRef.current) editorRef.current.innerHTML = initialHtml || '';
    setHtml(initialHtml || '');
    setSavedHtml(initialHtml || '');
    setDirty(false);
    // Normalize paragraph behavior for execCommand in modern browsers
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch {}
    try { document.execCommand('styleWithCSS', false, 'true'); } catch {}
  }, [projectId, initialHtml]);

  const apply = (cmd: string) => {
    const el = editorRef.current;
    if (!el) return;
    // Keep focus/selection in the editor so execCommand works reliably
    el.focus();
    const sel = window.getSelection();
    const inside = !!(sel && sel.rangeCount > 0 && el.contains(sel.anchorNode));
    if (!inside) {
      try {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false); // caret at end
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {}
    }
    let applied = false;
    try { applied = document.execCommand(cmd); } catch { applied = false; }
    // Fallback for browsers where execCommand(insertUnorderedList) is disabled
    if (!applied && cmd === 'insertUnorderedList') {
      try {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          // Find nearest block (DIV/P/LI) within the editor
          const nearestBlock = (start: Node | null): HTMLElement | null => {
            let n: Node | null = start;
            while (n && n !== el) {
              if (n.nodeType === 1) {
                const tag = (n as HTMLElement).tagName;
                if (tag === 'DIV' || tag === 'P' || tag === 'LI') return n as HTMLElement;
              }
              n = n.parentNode;
            }
            return el;
          };
          const block = nearestBlock(selection.anchorNode);
          if (block) {
            const ul = document.createElement('ul');
            const li = document.createElement('li');
            // If block is the editor root, create an empty list item at caret
            if (block === el) {
              li.appendChild(document.createTextNode(''));
              if (range.endContainer && range.endContainer.nodeType === Node.TEXT_NODE) {
                // noop
              }
              // Insert UL at caret
              range.insertNode(ul);
              ul.appendChild(li);
            } else {
              // Wrap the block in a UL/LI by moving its children into LI
              while (block.firstChild) {
                li.appendChild(block.firstChild);
              }
              ul.appendChild(li);
              block.parentNode?.replaceChild(ul, block);
            }
            // Place caret inside li at end
            const newRange = document.createRange();
            newRange.selectNodeContents(li);
            newRange.collapse(false);
            selection.removeAllRanges();
            selection.addRange(newRange);
            applied = true;
          }
        }
      } catch {
        // ignore
      }
    }
    // Re-read DOM for dirty state
    setTimeout(() => {
      const next = el.innerHTML || '';
      setHtml(next);
      setDirty(next !== savedHtml);
    }, 0);
  };

  const onInput = () => {
    const next = editorRef.current?.innerHTML || '';
    setHtml(next);
    setDirty(next !== savedHtml);
  };

  const onSave = async () => {
    try {
      setSaving(true);
      const current = editorRef.current?.innerHTML || html;
      await projectsApi.update(projectId, { notes: current });
      setSavedHtml(current);
      setHtml(current);
      setDirty(false);
    } catch (e) {
      // Swallow; API layer toasts errors already when appropriate
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 bg-[var(--card)] border border-[var(--border)] rounded">
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
        <div className="text-[var(--text)] font-semibold">Project Notes</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply('bold')}
            disabled={!canEdit}
          >B</button>
          <button
            type="button"
            className="text-xs px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply('italic')}
            disabled={!canEdit}
          ><i>I</i></button>
          <button
            type="button"
            className="text-xs px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply('underline')}
            disabled={!canEdit}
          ><u>U</u></button>
          <button
            type="button"
            className="text-xs px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply('insertUnorderedList')}
            disabled={!canEdit}
          >• List</button>
          <button
            type="button"
            className={`text-xs px-3 py-1 rounded ${dirty ? 'bg-[var(--primary)] text-white border border-[var(--primary)]' : 'border border-[var(--border)] text-[var(--muted)]'} disabled:opacity-50`}
            onClick={onSave}
            disabled={!canEdit || saving || !dirty}
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      <div className="p-3">
        <div
          ref={editorRef}
          className={`rt-editor min-h-[140px] rounded outline-none bg-[var(--surface)] border border-[var(--border)] p-2 text-[var(--text)] whitespace-pre-wrap ${canEdit ? '' : 'opacity-70'}`}
          contentEditable={canEdit}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          onKeyDown={(e) => {
            // Keep all keystrokes inside the editor; avoid global hotkeys/grid nav
            e.stopPropagation();
            if (e.key === 'Tab') {
              e.preventDefault();
              try {
                // Insert two spaces as a safe, consistent indent in HTML
                document.execCommand('insertText', false, '  ');
              } catch {
                // Fallback: mutate selection via Range API
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                  const range = sel.getRangeAt(0);
                  range.deleteContents();
                  range.insertNode(document.createTextNode('  '));
                  range.collapse(false);
                }
              }
              // Recompute dirty state after DOM mutation
              setTimeout(() => onInput(), 0);
            }
          }}
          onInput={onInput}
          aria-label="Project notes editor"
        />
        {!canEdit && <div className="mt-1 text-xs text-[var(--muted)]">Read-only</div>}
      </div>
    </div>
  );
}
