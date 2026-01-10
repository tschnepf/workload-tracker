type UserLike = {
  accountRole?: 'admin' | 'manager' | 'user';
  is_staff?: boolean;
  is_superuser?: boolean;
  groups?: string[];
} | null | undefined;

export function isAdminUser(user: UserLike): boolean {
  return !!(user?.is_staff || user?.is_superuser || user?.accountRole === 'admin');
}

export function isManagerUser(user: UserLike): boolean {
  if (user?.accountRole === 'manager') return true;
  return !!user?.groups?.includes('Manager');
}

export function isAdminOrManager(user: UserLike): boolean {
  return isAdminUser(user) || isManagerUser(user);
}
