import React from 'react';
import CalendarFeeds from '@/components/settings/CalendarFeeds';
import { useSettingsData } from '../SettingsDataContext';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';

export const CALENDAR_FEEDS_SECTION_ID = 'calendar-feeds';

const CalendarFeedsSection: React.FC = () => {
  const { auth } = useSettingsData();
  if (!auth.user?.is_staff) return null;

  return (
    <SettingsSectionFrame
      id={CALENDAR_FEEDS_SECTION_ID}
      title="Calendar Feeds"
      description="Manage personal ICS links for deliverables calendars."
      className="mt-6"
    >
      <CalendarFeeds />
    </SettingsSectionFrame>
  );
};

export default CalendarFeedsSection;
