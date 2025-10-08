import { describe, it, expect } from 'vitest';
import { classifyDeliverableType, deliverableTypeColors } from '@/util/deliverables';

describe('deliverables utils', () => {
  it('classifies known deliverable descriptions', () => {
    expect(classifyDeliverableType('Bulletin 1')).toBe('bulletin');
    expect(classifyDeliverableType('CD Set')).toBe('cd');
    expect(classifyDeliverableType('DD Update')).toBe('dd');
    expect(classifyDeliverableType('IFC Level 2')).toBe('ifc');
    expect(classifyDeliverableType('IFP Plan')).toBe('ifp');
    expect(classifyDeliverableType('Master Plan')).toBe('masterplan');
    expect(classifyDeliverableType('SD Phase')).toBe('sd');
    expect(classifyDeliverableType('Some Milestone')).toBe('milestone');
  });

  it('maps types to stable colors', () => {
    expect(deliverableTypeColors['bulletin']).toBe('#3b82f6');
    expect(deliverableTypeColors['cd']).toBe('#fb923c');
    expect(deliverableTypeColors['dd']).toBe('#818cf8');
    expect(deliverableTypeColors['ifc']).toBe('#06b6d4');
    expect(deliverableTypeColors['ifp']).toBe('#f472b6');
    expect(deliverableTypeColors['masterplan']).toBe('#a78bfa');
    expect(deliverableTypeColors['sd']).toBe('#f59e0b');
    expect(deliverableTypeColors['milestone']).toBe('#64748b');
  });
});

