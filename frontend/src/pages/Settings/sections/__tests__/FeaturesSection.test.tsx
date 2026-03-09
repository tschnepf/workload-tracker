import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FeaturesSection from '../FeaturesSection';

const mockGet = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock('@/pages/Settings/SettingsDataContext', () => ({
  useSettingsData: () => ({
    auth: { user: { is_staff: true } },
  }),
}));

vi.mock('@/services/api', () => ({
  featureSettingsApi: {
    get: mockGet,
    update: mockUpdate,
  },
}));

vi.mock('@/lib/toastBus', () => ({
  showToast: vi.fn(),
}));

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FeaturesSection />
    </QueryClientProvider>,
  );
}

describe('FeaturesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ reportingGroupsEnabled: false });
    mockUpdate.mockResolvedValue({ reportingGroupsEnabled: true });
  });

  it('loads and toggles reporting groups feature', async () => {
    renderSection();
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

    const switchButton = await screen.findByRole('switch');
    expect(switchButton).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(switchButton);
    expect(switchButton).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ reportingGroupsEnabled: true }),
    );
  });
});
