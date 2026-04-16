import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SeatGrid from '../components/SeatGrid.svelte';

const mockSlots = [
  { id: 's1', row_code: 'A', position_index: 1, status: 'available' },
  { id: 's2', row_code: 'A', position_index: 2, status: 'available' },
  { id: 's3', row_code: 'A', position_index: 3, status: 'held' },
  { id: 's4', row_code: 'B', position_index: 1, status: 'available' },
  { id: 's5', row_code: 'B', position_index: 2, status: 'reserved' },
];

describe('SeatGrid Component', () => {
  test('renders row labels', () => {
    const { container } = render(SeatGrid, { props: { slots: mockSlots, selectedIds: [] } });
    expect(container.textContent).toContain('A');
    expect(container.textContent).toContain('B');
  });

  test('renders correct number of seat cells', () => {
    const { container } = render(SeatGrid, { props: { slots: mockSlots, selectedIds: [] } });
    const seats = container.querySelectorAll('.seat');
    expect(seats.length).toBe(5);
  });

  test('applies correct status classes', () => {
    const { container } = render(SeatGrid, { props: { slots: mockSlots, selectedIds: [] } });
    expect(container.querySelectorAll('.seat-available').length).toBe(3);
    expect(container.querySelectorAll('.seat-held').length).toBe(1);
    expect(container.querySelectorAll('.seat-reserved').length).toBe(1);
  });

  test('marks selected seats', () => {
    const { container } = render(SeatGrid, { props: { slots: mockSlots, selectedIds: ['s1', 's2'] } });
    expect(container.querySelectorAll('.seat-selected').length).toBe(2);
  });

  test('renders empty grid for no slots', () => {
    const { container } = render(SeatGrid, { props: { slots: [], selectedIds: [] } });
    expect(container.querySelectorAll('.seat').length).toBe(0);
  });
});
