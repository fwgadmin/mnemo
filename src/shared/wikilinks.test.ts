import { describe, expect, it } from 'vitest';
import { inferLinkTargetIds, mergeOutgoingLinkTargets } from './linkInference';
import { extractWikilinks, parseWikilinkInner } from './wikilinks';

describe('wikilinks and inferred links', () => {
  it('parses display aliases and extracts unique targets', () => {
    expect(parseWikilinkInner('Target | label')).toEqual({ target: 'Target', display: 'label' });
    expect(extractWikilinks('[[Target]] [[Target|again]] [[Other]]')).toEqual(['Target', 'Other']);
  });

  it('infers plain title and ref mentions outside wikilinks', () => {
    const notes = [
      { id: 'self', title: 'Current', ref: 1 },
      { id: 'alpha', title: 'Alpha Project', ref: 2 },
      { id: 'beta', title: 'Beta', ref: 3 },
    ];
    expect(inferLinkTargetIds('Alpha Project and ref: 3, but [[Beta]] is masked', 'self', notes)).toEqual([
      'alpha',
      'beta',
    ]);
    expect(mergeOutgoingLinkTargets(['beta', 'self'], ['alpha', 'beta'], 'self')).toEqual(['beta', 'alpha']);
  });
});
