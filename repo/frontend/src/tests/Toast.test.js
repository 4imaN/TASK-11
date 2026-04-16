import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Toast from '../components/Toast.svelte';

describe('Toast Component', () => {
  test('renders message text', () => {
    render(Toast, { props: { message: 'Operation successful', type: 'success' } });
    expect(screen.getByText('Operation successful')).toBeTruthy();
  });

  test('applies success class', () => {
    const { container } = render(Toast, { props: { message: 'Done', type: 'success' } });
    expect(container.querySelector('.toast-success')).toBeTruthy();
  });

  test('applies error class', () => {
    const { container } = render(Toast, { props: { message: 'Failed', type: 'error' } });
    expect(container.querySelector('.toast-error')).toBeTruthy();
  });
});
