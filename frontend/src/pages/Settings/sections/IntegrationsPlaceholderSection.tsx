import React from 'react';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';

export const INTEGRATIONS_SECTION_ID = 'integrations';

const IntegrationsPlaceholderSection: React.FC = () => (
  <SettingsSectionFrame
    id={INTEGRATIONS_SECTION_ID}
    title="Integrations Hub"
    description="Connect external systems to synchronize data."
    className="mt-6"
  >
    <p className="text-[var(--muted)]">
      Integrations Hub is not yet enabled in this environment.
    </p>
  </SettingsSectionFrame>
);

export default IntegrationsPlaceholderSection;

