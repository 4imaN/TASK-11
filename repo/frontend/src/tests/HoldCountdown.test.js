import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import HoldCountdown from '../components/HoldCountdown.svelte';
import { tick } from 'svelte';

describe('HoldCountdown', () => {
  it('renders the countdown span element', async () => {
    const future = new Date(Date.now() + 5 * 60000).toISOString();
    const { container } = render(HoldCountdown, { props: { expiresAt: future } });
    await tick();
    const countdown = container.querySelector('.countdown');
    expect(countdown).toBeTruthy();
  });

  it('countdown element exists for expired hold', async () => {
    const past = new Date(Date.now() - 60000).toISOString();
    const { container } = render(HoldCountdown, { props: { expiresAt: past } });
    await tick();
    const countdown = container.querySelector('.countdown');
    expect(countdown).toBeTruthy();
  });
});
