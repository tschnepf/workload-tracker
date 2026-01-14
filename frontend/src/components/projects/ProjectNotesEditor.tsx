import React from 'react';
import DOMPurify from 'dompurify';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { projectsApi } from '@/services/api';

type Props = {
  projectId: number;
  initialJson?: any | null;
  initialHtml?: string | null | undefined;
  canEdit?: boolean;
  compact?: boolean;
};

export default function ProjectNotesEditor({ projectId, initialJson, initialHtml, canEdit = true, compact = false }: Props) {
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const lastSavedRef = React.useRef<string>('');

  const editor = useEditor({
    editable: canEdit,
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: 'Write notes…' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: initialJson ?? initialHtml ?? '',
    onUpdate: ({ editor }) => {
      // Mark dirty by comparing HTML snapshots (cheap + stable)
      const html = editor.getHTML();
      setDirty(html !== lastSavedRef.current);
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    if (initialJson) {
      editor.commands.setContent(initialJson);
    } else if (initialHtml) {
      editor.commands.setContent(initialHtml);
    }
    lastSavedRef.current = editor.getHTML();
    setDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, projectId]);

  const run = (fn: (e: any) => void) => (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); editor?.chain().focus(); fn(e); };

  const onSave = async () => {
    if (!editor) return;
    try {
      setSaving(true);
      const json = editor.getJSON();
      const html = DOMPurify.sanitize(editor.getHTML());
      await projectsApi.update(projectId, { notesJson: json as any, notes: html as any });
      lastSavedRef.current = html;
      setDirty(false);
    } catch {/* handled upstream */}
    finally { setSaving(false); }
  };

  const wrapperClass = compact ? 'mt-2' : 'mt-4';
  const headerClass = compact ? 'px-2 py-1.5' : 'px-3 py-2';
  const toolbarButtonClass = compact
    ? 'text-[11px] px-1.5 py-0.5'
    : 'text-xs px-2 py-0.5';
  const editorWrapClass = compact ? 'p-2' : 'p-3';
  const editorClass = compact ? 'min-h-[120px] p-2 text-sm' : 'min-h-[160px] p-2';

  return (
    <div className={`${wrapperClass} bg-[var(--card)] border border-[var(--border)] rounded`}>
      <div className={`${headerClass} border-b border-[var(--border)] flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between`}>
        <div className="text-[var(--text)] font-semibold">Project Notes</div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button className={`${toolbarButtonClass} rounded border border-[var(--border)]`} onMouseDown={(e)=>e.preventDefault()} onClick={run(()=>editor?.chain().focus().toggleBold().run())} disabled={!canEdit}>B</button>
          <button className={`${toolbarButtonClass} rounded border border-[var(--border)] italic`} onMouseDown={(e)=>e.preventDefault()} onClick={run(()=>editor?.chain().focus().toggleItalic().run())} disabled={!canEdit}>I</button>
          <button className={`${toolbarButtonClass} rounded border border-[var(--border)] underline`} onMouseDown={(e)=>e.preventDefault()} onClick={run(()=>editor?.chain().focus().toggleUnderline().run())} disabled={!canEdit}>U</button>
          <span className="mx-1" />
          <button className={`${toolbarButtonClass} rounded border border-[var(--border)]`} onMouseDown={(e)=>e.preventDefault()} onClick={run(()=>editor?.chain().focus().toggleBulletList().run())} disabled={!canEdit}>• List</button>
          <button className={`${toolbarButtonClass} rounded border border-[var(--border)]`} onMouseDown={(e)=>e.preventDefault()} onClick={run(()=>editor?.chain().focus().toggleOrderedList().run())} disabled={!canEdit}>1. List</button>
          <span className="mx-1" />
          <button className={`${toolbarButtonClass} rounded border border-[var(--border)]`} onMouseDown={(e)=>e.preventDefault()} onClick={run(()=>editor?.chain().focus().undo().run())} disabled={!canEdit}>Undo</button>
          <button className={`${toolbarButtonClass} rounded border border-[var(--border)]`} onMouseDown={(e)=>e.preventDefault()} onClick={run(()=>editor?.chain().focus().redo().run())} disabled={!canEdit}>Redo</button>
          <span className="mx-1" />
          <button className={`${toolbarButtonClass} rounded ${dirty ? 'bg-[var(--primary)] text-white border border-[var(--primary)]' : 'border border-[var(--border)] text-[var(--muted)]'}`} onClick={onSave} disabled={!canEdit || saving || !dirty}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      <div className={editorWrapClass}>
        <div className={`pm-editor ${editorClass} bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)]`} onKeyDown={(e)=>{e.stopPropagation();}}>
          {editor && <EditorContent editor={editor} />}
        </div>
      </div>
    </div>
  );
}
