import * as React from 'react';
import Card from '@/components/ui/Card';

type Props = {
  title: string;
  cardIds: string[];
  cardTitleForId: (cardId: string) => string;
  renderPreview: (cardId: string) => React.ReactNode;
};

const DashboardGroupCard: React.FC<Props> = ({
  title,
  cardIds,
  cardTitleForId,
  renderPreview,
}) => {
  return (
    <Card className="ux-panel h-full min-h-0 p-4">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
          <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{cardIds.length} cards</span>
        </div>

        <div className="mt-3 flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
          {cardIds.map((cardId) => (
            <section
              key={cardId}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 p-2"
              aria-label={cardTitleForId(cardId)}
            >
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                {cardTitleForId(cardId)}
              </div>
              <div className="text-xs text-[var(--text)]">
                {renderPreview(cardId)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Card>
  );
};

export default DashboardGroupCard;
