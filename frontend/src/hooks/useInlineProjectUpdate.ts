import { useRef } from 'react'
import { useUpdateProject } from '@/hooks/useProjects'
import type { Project } from '@/types/models'
import { showToast } from '@/lib/toastBus'
import { friendlyErrorMessage } from '@/api/errors'

// Module-level simple mutex queue per projectId to serialize commits
const queues = new Map<number, Promise<any>>()

function enqueue<T>(projectId: number, work: () => Promise<T>): Promise<T> {
  const prev = queues.get(projectId) || Promise.resolve()
  const next = prev
    .catch(() => { /* swallow to keep chain */ })
    .then(work)
  queues.set(projectId, next.finally(() => {
    if (queues.get(projectId) === next) queues.delete(projectId)
  }))
  return next
}

export function useInlineProjectUpdate(projectId: number) {
  const mutation = useUpdateProject()
  const idRef = useRef(projectId)
  idRef.current = projectId

  async function commit(field: keyof Project, value: any): Promise<void> {
    const id = idRef.current
    if (!id) return
    await enqueue(id, async () => {
      try {
        await mutation.mutateAsync({ id, data: { [field]: value } as Partial<Project> })
      } catch (err: any) {
        const status = (err && typeof err === 'object' && 'status' in err) ? (err as any).status as number : undefined
        if (status !== 412) {
          const message = friendlyErrorMessage(status ?? 500, (err as any)?.response ?? null, (err as Error)?.message || 'Failed to update project')
          showToast(message, 'error')
        }
        throw err
      }
    })
  }

  return { commit }
}

export type UseInlineProjectUpdate = ReturnType<typeof useInlineProjectUpdate>

