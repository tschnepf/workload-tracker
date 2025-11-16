import React from 'react';
import DepartmentProjectRolesSection from '@/components/settings/DepartmentProjectRolesSection';
import { useSettingsData } from '../SettingsDataContext';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';

export const DEPARTMENT_ROLES_SECTION_ID = 'department-project-roles';

const DepartmentRolesSection: React.FC = () => {
  const { auth, caps } = useSettingsData();
  if (!auth.user?.is_staff) return null;

  return (
    <SettingsSectionFrame
      id={DEPARTMENT_ROLES_SECTION_ID}
      title="Department Project Roles"
      description="Configure project role catalogs per department."
      className="mt-6"
    >
      <DepartmentProjectRolesSection
        enabled={!!caps?.projectRolesByDepartment}
        isAdmin={!!auth.user?.is_staff}
      />
    </SettingsSectionFrame>
  );
};

export default DepartmentRolesSection;
