import React from 'react';
import { projectsApi } from '@/services/api';

type Props = {
  projectId: number;
  initialHtml: string | undefined | null;
  canEdit?: boolean;
};

export default function ProjectScratchPad({ projectId, initialHtml, canEdit = true }: Props) {
  const [html, setHtml] = React.useState<string>(initialHtml || '');
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const editorRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setHtml(initialHtml || '');
    setDirty(false);
  }, [projectId, initialHtml]);

  const apply = (cmd: string) => {
    try { document.execCommand(cmd); } catch {}
    setTimeout(() => {
      const next = editorRef.current?.innerHTML || '';
      setHtml(next);
      setDirty(true);
    }, 0);
  };

  const onInput = () => {
    const next = editorRef.current?.innerHTML || '';
    setHtml(next);
    setDirty(true);
  };

  const onSave = async () => {
    try {
      setSaving(true);
      await projectsApi.update(projectId, { notes: html });
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
            onClick={() => apply('bold')}
            disabled={!canEdit}
          >B</button>
          <button
            type="button"
            className="text-xs px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
            onClick={() => apply('italic')}
            disabled={!canEdit}
          ><i>I</i></button>
          <button
            type="button"
            className="text-xs px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
            onClick={() => apply('underline')}
            disabled={!canEdit}
          ><u>U</u></button>
          <button
            type="button"
            className="text-xs px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
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
          className={`min-h-[140px] rounded outline-none bg-[var(--surface)] border border-[var(--border)] p-2 text-[var(--text)] ${canEdit ? '' : 'opacity-70'}`}
          contentEditable={canEdit}
          suppressContentEditableWarning
          onInput={onInput}
          dangerouslySetInnerHTML={{ __html: html }}
          aria-label="Project notes editor"
        />
        {!canEdit && <div className="mt-1 text-xs text-[var(--muted)]">Read-only</div>}
      </div>
    </div>
  );
}

