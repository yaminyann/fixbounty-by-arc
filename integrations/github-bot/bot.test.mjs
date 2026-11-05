// Run with: node integrations/github-bot/bot.test.mjs
import assert from 'node:assert/strict'
import { MAY_USE, buildLink, parseCommand, replyText } from './bot.mjs'

assert.equal(parseCommand('hello'), null)
assert.equal(parseCommand('/bounty'), null)
assert.equal(parseCommand('/bounty abc'), null)
assert.equal(parseCommand('/bounty 0'), null)
assert.deepEqual(parseCommand('/bounty 200'), { reward: '200', tags: [] })
assert.deepEqual(parseCommand('/bounty 99.5 USDC React, #CSS bug'), { reward: '99.5', tags: ['react', 'css', 'bug'] })
assert.deepEqual(parseCommand('Thanks!\n/bounty 50 docs\nmore text'), { reward: '50', tags: ['docs'] })
assert.deepEqual(parseCommand('/bounty 10 <script> ok'), { reward: '10', tags: ['ok'] })

const link = buildLink({ title: 'Dark mode flashes & flickers', url: 'https://github.com/acme/app/issues/42', reward: '200', labels: ['Bug', 'ui'], tags: ['css', 'bug'] })
const url = new URL(link)
assert.equal(url.origin + url.pathname, 'https://bountyfi.xyz/create')
assert.equal(url.searchParams.get('title'), 'Dark mode flashes & flickers')
assert.equal(url.searchParams.get('reward'), '200')
assert.equal(url.searchParams.get('link'), 'https://github.com/acme/app/issues/42')
assert.equal(url.searchParams.get('tags'), 'bug, ui, css')

assert.equal(new URL(buildLink({ title: 'x'.repeat(500), url: 'https://github.com/a/b/issues/1', reward: '1' })).searchParams.get('title').length, 200)
assert.ok(replyText(link, '200').includes('Nothing has been created yet'))
assert.ok(MAY_USE.has('write') && MAY_USE.has('admin') && !MAY_USE.has('read') && !MAY_USE.has('none'))
console.log('github bot: all checks passed')
