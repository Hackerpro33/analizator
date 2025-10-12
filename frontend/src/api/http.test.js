import { describe, expect, it } from 'vitest';

import { buildApiUrl } from './http';

describe('buildApiUrl', () => {
  it('returns relative path when base is empty', () => {
    expect(buildApiUrl('/api/chat/state', '')).toBe('/api/chat/state');
  });

  it('joins base host and path without duplicating slashes', () => {
    expect(buildApiUrl('/api/chat/message', 'https://backend.local')).toBe(
      'https://backend.local/api/chat/message'
    );
  });

  it('avoids duplicating the /api segment when base already ends with it', () => {
    expect(buildApiUrl('/api/chat/reset', 'https://backend.local/api')).toBe(
      'https://backend.local/api/chat/reset'
    );
  });

  it('normalises trailing slashes on the base', () => {
    expect(buildApiUrl('/api/chat/state/user', 'https://backend.local/api/')).toBe(
      'https://backend.local/api/chat/state/user'
    );
  });
});

