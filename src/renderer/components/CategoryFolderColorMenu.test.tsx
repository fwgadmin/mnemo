// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CategoryFolderColorMenu from './CategoryFolderColorMenu';

describe('CategoryFolderColorMenu', () => {
  it('renders sorting choices and reports the selected mode', () => {
    const onSetSortMode = vi.fn();
    render(
      <CategoryFolderColorMenu
        state={{ path: 'Work', x: 40, y: 60 }}
        onClose={() => {}}
        suggestedColors={[]}
        onPickSuggestedColor={() => {}}
        onPickCustomColor={() => {}}
        canPromote={false}
        onPromote={() => {}}
        canDemote={false}
        onRequestDemote={() => {}}
        sortMode="alphabetical"
        hasSortOverride={false}
        onSetSortMode={onSetSortMode}
        canClear={false}
        onClearColor={() => {}}
      />,
    );

    expect(screen.getByText('Sort notes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Newest created first' }));
    expect(onSetSortMode).toHaveBeenCalledWith('created-desc');
  });

  it('offers inherited sorting only when an override exists', () => {
    const { rerender } = render(
      <CategoryFolderColorMenu
        state={{ path: 'Work', x: 40, y: 60 }}
        onClose={() => {}}
        suggestedColors={[]}
        onPickSuggestedColor={() => {}}
        onPickCustomColor={() => {}}
        canPromote={false}
        onPromote={() => {}}
        canDemote={false}
        onRequestDemote={() => {}}
        sortMode="created-desc"
        hasSortOverride={false}
        onSetSortMode={() => {}}
        canClear={false}
        onClearColor={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Use parent/default sorting' })).not.toBeInTheDocument();

    rerender(
      <CategoryFolderColorMenu
        state={{ path: 'Work', x: 40, y: 60 }}
        onClose={() => {}}
        suggestedColors={[]}
        onPickSuggestedColor={() => {}}
        onPickCustomColor={() => {}}
        canPromote={false}
        onPromote={() => {}}
        canDemote={false}
        onRequestDemote={() => {}}
        sortMode="created-desc"
        hasSortOverride
        onSetSortMode={() => {}}
        canClear={false}
        onClearColor={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Use parent/default sorting' })).toBeInTheDocument();
  });
});
