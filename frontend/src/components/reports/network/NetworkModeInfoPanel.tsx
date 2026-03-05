import React from 'react';
import type { NetworkGraphMode } from '@/types/models';

type Props = {
  mode: NetworkGraphMode;
  coworkerProjectWeight: number;
  coworkerWeekWeight: number;
  coworkerThreshold: number;
  clientProjectWeight: number;
  clientWeekWeight: number;
  clientThreshold: number;
  selectedClient: string;
};

const NetworkModeInfoPanel: React.FC<Props> = ({
  mode,
  coworkerProjectWeight,
  coworkerWeekWeight,
  coworkerThreshold,
  clientProjectWeight,
  clientWeekWeight,
  clientThreshold,
  selectedClient,
}) => {
  const title =
    mode === 'project_people'
      ? 'Project-People'
      : mode === 'coworker'
        ? 'Coworker Network'
        : 'Client Experience';

  return (
    <aside className="border border-[var(--border)] rounded-lg bg-[var(--card)] p-3 space-y-2">
      <h3 className="text-sm font-semibold text-[var(--text)]">How This Graph Works</h3>
      <div className="text-xs text-[var(--muted)]">{title}</div>

      {mode === 'project_people' ? (
        <p className="text-xs text-[var(--text)] leading-5">
          Nodes are <strong>people</strong> and <strong>projects</strong>. An edge exists when a person was assigned to a
          project in the selected window. Edge strength is based on shared snapshot weeks, so longer staffing duration
          appears stronger.
        </p>
      ) : null}

      {mode === 'coworker' ? (
        <p className="text-xs text-[var(--text)] leading-5">
          Nodes are <strong>people</strong>. An edge connects two people who staffed the same project in the same week.
          Score is calculated as:
          <br />
          <code>
            ({coworkerProjectWeight.toFixed(1)} x shared projects) + ({coworkerWeekWeight.toFixed(1)} x shared weeks)
          </code>
          <br />
          Links below threshold <code>{coworkerThreshold.toFixed(1)}</code> are hidden.
        </p>
      ) : null}

      {mode === 'client_experience' ? (
        <p className="text-xs text-[var(--text)] leading-5">
          Nodes are <strong>people</strong> and <strong>clients</strong>. An edge shows a person&apos;s experience with a
          client during the selected window. Score is:
          <br />
          <code>
            ({clientProjectWeight.toFixed(1)} x distinct projects) + ({clientWeekWeight.toFixed(1)} x distinct weeks)
          </code>
          <br />
          {selectedClient
            ? `Client filter is set to "${selectedClient}", so threshold filtering is bypassed.`
            : `Links below threshold ${clientThreshold.toFixed(1)} are hidden.`}
        </p>
      ) : null}
    </aside>
  );
};

export default NetworkModeInfoPanel;
