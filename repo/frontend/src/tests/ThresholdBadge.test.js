import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ThresholdBadge from '../components/ThresholdBadge.svelte';

describe('ThresholdBadge', () => {
  it('shows OK for normal stock', () => {
    const { getByText } = render(ThresholdBadge, { props: { qty: 100, reserved: 0, warning: 15, critical: 5 } });
    expect(getByText(/OK/)).toBeTruthy();
  });
  it('shows LOW for warning stock', () => {
    const { getByText } = render(ThresholdBadge, { props: { qty: 10, reserved: 0, warning: 15, critical: 5 } });
    expect(getByText(/LOW/)).toBeTruthy();
  });
  it('shows CRITICAL for critical stock', () => {
    const { getByText } = render(ThresholdBadge, { props: { qty: 3, reserved: 0, warning: 15, critical: 5 } });
    expect(getByText(/CRITICAL/)).toBeTruthy();
  });
  it('accounts for reserved quantity', () => {
    const { getByText } = render(ThresholdBadge, { props: { qty: 20, reserved: 18, warning: 15, critical: 5 } });
    expect(getByText(/CRITICAL/)).toBeTruthy();
  });
});
