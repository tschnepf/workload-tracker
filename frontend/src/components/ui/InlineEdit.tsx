import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type CommonProps<T> = {
  value: T
  onCommit: (next: T) => void | Promise<void>
  placeholder?: string
  disabled?: boolean
  ariaLabel: string
  className?: string
  onStartEdit?: () => void
  onDraftChange?: (next: T) => void
}

function useEditing<T>(value: T) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<T>(value)
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])
  return { editing, setEditing, draft, setDraft }
}

function isEqual(a: any, b: any) {
  // shallow equality is sufficient for primitives we handle here
  return a === b
}

function stop(e: React.SyntheticEvent) {
  e.stopPropagation()
}

export function InlineText(props: CommonProps<string | undefined | null>) {
  const { value, onCommit, placeholder, disabled, ariaLabel, className } = props
  const { editing, setEditing, draft, setDraft } = useEditing<string | undefined | null>(value ?? '')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = useCallback(async () => {
    const trimmed = typeof draft === 'string' ? draft.trim() : draft
    if (isEqual(trimmed, (value ?? '').toString())) { setEditing(false); return }
    await onCommit(trimmed as any)
    setEditing(false)
  }, [draft, onCommit, value])

  const cancel = useCallback(() => {
    setDraft(value ?? '')
    setEditing(false)
  }, [value])

  if (!editing) {
    const display = (value ?? '').toString()
    return (
      <span
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        className={className}
        onClick={() => { if (!disabled) { props.onStartEdit?.(); setEditing(true) } }}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onStartEdit?.(); setEditing(true) }
        }}
      >
        {display || <span className="text-[var(--muted)]">{placeholder || '—'}</span>}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      aria-label={ariaLabel}
      className={`px-1 py-0.5 rounded border bg-[var(--card)] border-[var(--border)] text-[var(--text)] ${className || ''}`}
      value={draft ?? ''}
      onChange={(e) => { setDraft(e.currentTarget.value); props.onDraftChange?.(e.currentTarget.value as any) }}
      onBlur={() => { commit().catch(() => cancel()) }}
      onKeyDown={(e) => {
        stop(e)
        if (e.key === 'Enter') { e.preventDefault(); commit().catch(() => cancel()) }
        else if (e.key === 'Escape') { e.preventDefault(); cancel() }
      }}
    />
  )
}

export function InlineTextarea(props: CommonProps<string | undefined | null> & { rows?: number }) {
  const { value, onCommit, placeholder, disabled, ariaLabel, className, rows = 3 } = props
  const { editing, setEditing, draft, setDraft } = useEditing<string | undefined | null>(value ?? '')
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = useCallback(async () => {
    const trimmed = typeof draft === 'string' ? draft.trim() : draft
    if (isEqual(trimmed, value ?? '')) { setEditing(false); return }
    await onCommit(trimmed as any)
    setEditing(false)
  }, [draft, onCommit, value])

  const cancel = useCallback(() => { setDraft(value ?? ''); setEditing(false) }, [value])

  if (!editing) {
    const display = (value ?? '').toString()
    return (
      <span
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        className={className}
        onClick={() => { if (!disabled) { props.onStartEdit?.(); setEditing(true) } }}
        onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); props.onStartEdit?.(); setEditing(true) } }}
      >
        {display || <span className="text-[var(--muted)]">{placeholder || '—'}</span>}
      </span>
    )
  }

  return (
    <textarea
      ref={ref}
      aria-label={ariaLabel}
      className={`w-full px-2 py-1 rounded border bg-[var(--card)] border-[var(--border)] text-[var(--text)] ${className || ''}`}
      value={draft ?? ''}
      onChange={(e) => { setDraft(e.currentTarget.value); props.onDraftChange?.(e.currentTarget.value as any) }}
      onBlur={() => { commit().catch(() => cancel()) }}
      rows={rows}
      onKeyDown={(e) => {
        stop(e)
        if (e.key === 'Escape') { e.preventDefault(); cancel() }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); commit().catch(() => cancel()) }
      }}
    />
  )
}

export function InlineDate(props: CommonProps<string | null>) {
  const { value, onCommit, placeholder, disabled, ariaLabel, className } = props
  const { editing, setEditing, draft, setDraft } = useEditing<string | null>(value ?? null)
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = useCallback(async () => {
    const normalized = (draft && draft.trim().length > 0) ? draft : null
    if (isEqual(normalized, value ?? null)) { setEditing(false); return }
    await onCommit(normalized)
    setEditing(false)
  }, [draft, onCommit, value])

  const cancel = useCallback(() => { setDraft(value ?? null); setEditing(false) }, [value])

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        className={className}
        onClick={() => { if (!disabled) { props.onStartEdit?.(); setEditing(true) } }}
        onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); props.onStartEdit?.(); setEditing(true) } }}
      >
        {value ? value : <span className="text-[var(--muted)]">{placeholder || '—'}</span>}
      </span>
    )
  }

  return (
    <input
      ref={ref}
      type="date"
      aria-label={ariaLabel}
      className={`px-1 py-0.5 rounded border bg-[var(--card)] border-[var(--border)] text-[var(--text)] ${className || ''}`}
      value={draft ?? ''}
      onChange={(e) => { const v = e.currentTarget.value || ''; setDraft(v); props.onDraftChange?.(v as any) }}
      onBlur={() => { commit().catch(() => cancel()) }}
      onKeyDown={(e) => {
        stop(e)
        if (e.key === 'Enter') { e.preventDefault(); commit().catch(() => cancel()) }
        else if (e.key === 'Escape') { e.preventDefault(); cancel() }
      }}
    />
  )
}

export function InlineSelect(props: CommonProps<string | number | null> & { options: Array<{ value: string | number, label: string }> }) {
  const { value, onCommit, placeholder, disabled, ariaLabel, className, options } = props
  const { editing, setEditing } = useEditing(value)

  if (!editing) {
    const selected = options.find(o => String(o.value) === String(value))
    return (
      <span
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        className={className}
        onClick={() => { if (!disabled) { props.onStartEdit?.(); setEditing(true) } }}
        onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); props.onStartEdit?.(); setEditing(true) } }}
      >
        {selected?.label ?? <span className="text-[var(--muted)]">{placeholder || '—'}</span>}
      </span>
    )
  }

  return (
    <select
      aria-label={ariaLabel}
      className={`px-1 py-0.5 rounded border bg-[var(--card)] border-[var(--border)] text-[var(--text)] ${className || ''}`}
      defaultValue={value == null ? '' : String(value)}
      onChange={(e) => { const v = e.currentTarget.value; setEditing(false); onCommit(v as any) }}
      onBlur={() => setEditing(false)}
    >
      <option value="" disabled>{placeholder || 'Select'}</option>
      {options.map(o => (
        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
      ))}
    </select>
  )
}

export default { InlineText, InlineTextarea, InlineDate, InlineSelect }
