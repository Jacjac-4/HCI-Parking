import assert from 'node:assert/strict';
import {createDraftStorage, readPermitDraft} from '../ds3/draft.mjs';

for (const value of ['broken', 'null', 'true', '7', '"text"', '[]', '{}', '{"version":2}', '{"version":1,"answers":[],"vehicle":{}}']) {
  assert.equal(readPermitDraft(value), null, `Reject unsupported draft: ${value}`);
}
const draft = {version: 1, answers: {name: 'Demo'}, vehicle: {plate:'DEMO'}};
assert.deepEqual(readPermitDraft(JSON.stringify(draft)), draft);
const blocked = createDraftStorage(() => { throw new Error('Storage blocked'); });
assert.equal(blocked.getItem('draft'), null);
blocked.setItem('draft', 'progress');
assert.equal(blocked.getItem('draft'), 'progress');
blocked.removeItem('draft');
assert.equal(blocked.getItem('draft'), null);
const data = new Map([['draft', 'old']]);
const quota = createDraftStorage(() => ({
  getItem: key => data.get(key) ?? null,
  setItem: () => { throw new Error('Quota exceeded'); },
  removeItem: key => data.delete(key),
}));
assert.equal(quota.getItem('draft'), 'old');
quota.setItem('draft', 'new');
assert.equal(quota.getItem('draft'), 'new');
quota.removeItem('draft');
assert.equal(quota.getItem('draft'), null);
export const result = 'Draft parsing, blocked storage, quota exhaustion and removal checks passed.';
