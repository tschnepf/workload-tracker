import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { personReportApi, type PersonReportGoal } from '@/services/personReportApi';

export function usePersonReportBootstrap(opts?: { vertical?: number; includeInactive?: boolean }) {
  return useQuery({
    queryKey: ['personReportBootstrap', opts?.vertical ?? null, opts?.includeInactive ? 1 : 0],
    queryFn: () =>
      personReportApi.bootstrap({
        vertical: opts?.vertical,
        include_inactive: opts?.includeInactive ? 1 : undefined,
      }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function usePersonReportPeople(opts: {
  departmentId?: number | null;
  search?: string;
  includeInactive?: boolean;
}) {
  return useQuery({
    queryKey: ['personReportPeople', opts.departmentId ?? null, opts.search ?? '', opts.includeInactive ? 1 : 0],
    enabled: Boolean(opts.departmentId),
    queryFn: () =>
      personReportApi.people({
        department: Number(opts.departmentId),
        search: opts.search?.trim() || undefined,
        include_inactive: opts.includeInactive ? 1 : undefined,
      }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function usePersonReportProfile(opts: { personId?: number | null; months: number }) {
  return useQuery({
    queryKey: ['personReportProfile', opts.personId ?? null, opts.months],
    enabled: Boolean(opts.personId),
    queryFn: () => personReportApi.profile({ person: Number(opts.personId), months: opts.months }),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}

export function usePersonReportGoals(personId?: number | null) {
  return useQuery({
    queryKey: ['personReportGoals', personId ?? null],
    enabled: Boolean(personId),
    queryFn: () => personReportApi.goals({ person: Number(personId) }),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
}

export function usePersonReportCheckins(personId?: number | null) {
  return useQuery({
    queryKey: ['personReportCheckins', personId ?? null],
    enabled: Boolean(personId),
    queryFn: () => personReportApi.checkins({ person: Number(personId) }),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
}

export function useCreatePersonReportGoal(personId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: personReportApi.createGoal,
    onSuccess: () => {
      if (personId) {
        queryClient.invalidateQueries({ queryKey: ['personReportGoals', personId] });
        queryClient.invalidateQueries({ queryKey: ['personReportProfile', personId] });
      }
    },
  });
}

export function useUpdatePersonReportGoal(personId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, patch }: { goalId: number; patch: Partial<PersonReportGoal> }) =>
      personReportApi.updateGoal(goalId, {
        title: patch.title,
        description: patch.description,
        skillTagId: patch.skillTagId ?? undefined,
        status: patch.status,
        targetDate: patch.targetDate,
      }),
    onSuccess: () => {
      if (personId) {
        queryClient.invalidateQueries({ queryKey: ['personReportGoals', personId] });
        queryClient.invalidateQueries({ queryKey: ['personReportProfile', personId] });
      }
    },
  });
}

export function useCreatePersonReportCheckin(personId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: personReportApi.createCheckin,
    onSuccess: () => {
      if (personId) {
        queryClient.invalidateQueries({ queryKey: ['personReportCheckins', personId] });
        queryClient.invalidateQueries({ queryKey: ['personReportGoals', personId] });
      }
    },
  });
}
