// Checks for the contribution ecosystem (projects, categories, milestones, reviews, teams, recurring programs,
// profiles, notifications). Called by e2e.mjs after the core bounty lifecycle, on the same chain and database.

export async function runEcosystemChecks(ctx) {
  const { api, tok, accounts, send, board, boardArtifact, usdc, mock, bountyCommitment, submissionCommitment, check, waitFor, db, reward } = ctx
  let r
  const usd = (n) => BigInt(n) * 1_000_000n

  console.log('\nContribution ecosystem')

  r = await api('GET', '/categories')
  check('six default categories are served', r.status === 200 && r.body.items.length === 6 && r.body.items[0].slug === 'security', r.body)

  // ---- projects --------------------------------------------------------------------------------
  r = await api('POST', '/projects', { auth: tok.stranger, body: { slug: 'nope', name: 'Nope' } })
  check('creating a project needs a linked wallet', r.status === 403, r.body)
  r = await api('POST', '/projects', { auth: tok.creator, body: { slug: 'admin', name: 'Reserved' } })
  check('reserved project address is rejected', r.status === 400, r.body)
  r = await api('POST', '/projects', {
    auth: tok.creator,
    body: { slug: 'acme', name: 'Acme Labs', tagline: 'Tools for builders', description: 'We build open-source tools.', websiteUrl: 'https://acme.example.com' },
  })
  check('owner creates a project', r.status === 201 && r.body.slug === 'acme', r.body)
  r = await api('POST', '/projects', { auth: tok.alice, body: { slug: 'acme', name: 'Copycat' } })
  check('duplicate project address is 409', r.status === 409, r.body)
  r = await api('POST', '/projects/acme', { auth: tok.alice, body: { name: 'Hijack' } })
  check('only the owner can edit a project', r.status === 403, r.body)
  r = await api('POST', '/projects/acme', {
    auth: tok.creator,
    body: { name: 'Acme Labs', tagline: 'Open-source tools for builders', description: 'We build open-source tools.', websiteUrl: 'https://acme.example.com', githubUrl: 'https://github.com/acme' },
  })
  check('owner edits their project', r.status === 200, r.body)

  // ---- a team + milestone bounty with listing details ------------------------------------------------
  const meta2 = {
    title: 'Build the analytics dashboard',
    description: 'Create a dashboard that shows weekly active users, retention and revenue with exportable charts.',
    acceptanceCriteria: 'Charts render from the API, export to CSV, and pass the existing accessibility checks.',
    tags: ['react', 'dashboard'],
    links: [],
  }
  const reward2 = usd(100)
  await send('creator', board, boardArtifact.abi, 'createBounty', [meta2.title, bountyCommitment(meta2), reward2, BigInt(Math.floor(Date.now() / 1000) + 3600), [10000]])
  const id2 = 2
  const listing = {
    category: 'development',
    difficulty: 'intermediate',
    skills: ['React', 'charts'],
    workMode: 'team',
    project: 'acme',
    submissionInstructions: 'Link a deployed preview.',
    eligibility: 'Open to everyone.',
  }

  r = await api('POST', '/bounties', { auth: tok.creator, body: { ...meta2, onchainId: id2, listing: { ...listing, category: 'made-up' } } })
  check('unknown category is rejected', r.status === 400, r.body)
  r = await api('POST', '/bounties', { auth: tok.creator, body: { ...meta2, onchainId: id2, listing: { ...listing, project: 'someone-elses' } } })
  check('a bounty can only join a project the creator owns', r.status === 403, r.body)
  r = await api('POST', '/bounties', { auth: tok.creator, body: { ...meta2, onchainId: id2, listing } })
  check('creator publishes with listing details', r.status === 201 && r.body.bounty.category === 'development' && r.body.bounty.workMode === 'team' && r.body.bounty.projectSlug === 'acme', r.body)
  check('skills are normalised to lower case', JSON.stringify(r.body.bounty?.skills) === JSON.stringify(['react', 'charts']), r.body.bounty?.skills)

  await send('creator', usdc, mock.abi, 'approve', [board, reward2 + (reward2 * 50n) / 10_000n])
  await send('creator', board, boardArtifact.abi, 'fundBounty', [BigInt(id2)])
  await api('POST', `/bounties/${id2}/refresh`)
  r = await api('POST', `/admin/bounties/${id2}/moderation`, { auth: tok.admin, body: { decision: 'approved' } })
  check('admin approves the project bounty', r.status === 200, r.body)

  // ---- marketplace filters -------------------------------------------------------------------
  const list = async (qs) => (await api('GET', `/bounties?${qs}`)).body
  check('filter by category', (await list('category=development')).total === 1)
  check('filter by other category is empty', (await list('category=design')).total === 0)
  check('filter by difficulty', (await list('difficulty=intermediate')).total === 1 && (await list('difficulty=advanced')).total === 0)
  check('filter by team mode', (await list('mode=team')).total === 1)
  check('filter by project slug', (await list('project=acme')).total === 1)
  check('filter by skill', (await list('skill=charts')).total === 1)
  check('filter by reward range', (await list('minReward=50&maxReward=150')).total === 1 && (await list('maxReward=10')).total === 0)
  check('filter by state open', (await list('state=open')).total === 1)
  check('state=completed lists only the paid-out bounty', (await list('state=completed')).total === 1 && (await list('state=completed')).items[0].onchainId === 1)
  check('filter by deadline window', (await list('deadlineWithin=1&state=open')).total === 1)
  check('search by project name', (await list('search=acme')).total === 1)
  check('search by skill', (await list('search=charts')).total === 1)

  // ---- milestones ----------------------------------------------------------------------------
  r = await api('POST', `/bounties/${id2}/milestones`, { auth: tok.alice, body: { title: 'Charts', rewardAmount: String(usd(60)) } })
  check('only the creator can add milestones', r.status === 403, r.body)
  r = await api('POST', `/bounties/${id2}/milestones`, { auth: tok.creator, body: { title: 'Chart components', description: 'Build the chart set.', rewardAmount: String(usd(60)) } })
  check('creator adds milestone 1', r.status === 201, r.body)
  const m1 = r.body.id
  r = await api('POST', `/bounties/${id2}/milestones`, { auth: tok.creator, body: { title: 'Export and QA', rewardAmount: String(usd(50)) } })
  check('milestones cannot exceed the prize pool', r.status === 409, r.body)
  r = await api('POST', `/bounties/${id2}/milestones`, { auth: tok.creator, body: { title: 'Export and QA', rewardAmount: String(usd(40)) } })
  check('creator adds milestone 2', r.status === 201, r.body)
  const m2 = r.body.id
  r = await api('GET', `/bounties/${id2}/milestones`)
  check('milestones are public with derived status', r.body.items.length === 2 && r.body.items[0].status === 'open' && BigInt(r.body.plannedTotal) === reward2, r.body)

  r = await api('POST', `/bounties/${id2}/milestones/${m1}/submissions`, { auth: tok.creator, body: { description: 'My own work for my own bounty.' } })
  check('creator cannot submit to a milestone', r.status === 403, r.body)
  r = await api('POST', `/bounties/${id2}/milestones/${m1}/submissions`, {
    auth: tok.alice,
    body: { description: 'Chart components with tests and storybook.', links: ['https://github.com/acme/dash/pull/7'] },
  })
  check('alice submits to milestone 1', r.status === 201, r.body)
  r = await api('POST', `/bounties/${id2}/milestones/${m1}/submissions`, { auth: tok.alice, body: { description: 'Another try at the same milestone.' } })
  check('one submission per milestone per contributor', r.status === 409, r.body)

  r = await api('GET', `/bounties/${id2}/milestones`, { auth: tok.creator })
  const aliceMs = r.body.items[0].submissions[0]
  check('creator sees milestone submissions', r.body.items[0].status === 'in_review' && aliceMs?.submitterWallet === accounts.alice.address.toLowerCase(), r.body.items[0])
  r = await api('GET', `/bounties/${id2}/milestones`, { auth: tok.bob })
  check('other contributors do not see submissions', r.body.items[0].submissions.length === 0 && r.body.items[0].submissionCount === 1)

  r = await api('GET', `/reviews/milestone_submission/${aliceMs.id}`, { auth: tok.bob })
  check('strangers cannot read a review thread', r.status === 404, r.body)
  r = await api('POST', `/reviews/milestone_submission/${aliceMs.id}/decision`, { auth: tok.alice, body: { decision: 'approved' } })
  check('contributors cannot decide', r.status === 403, r.body)
  r = await api('POST', `/reviews/milestone_submission/${aliceMs.id}/decision`, { auth: tok.creator, body: { decision: 'changes_requested' } })
  check('a revision request needs a note', r.status === 400, r.body)
  r = await api('POST', `/reviews/milestone_submission/${aliceMs.id}/decision`, { auth: tok.creator, body: { decision: 'changes_requested', note: 'Please add keyboard navigation.' } })
  check('creator requests changes', r.status === 200 && r.body.reviewStatus === 'changes_requested', r.body)
  r = await api('POST', `/reviews/milestone_submission/${aliceMs.id}/comments`, {
    auth: tok.alice,
    body: { kind: 'update', body: 'Added keyboard navigation and a test.', links: ['https://github.com/acme/dash/pull/8'] },
  })
  check('contributor replies with an update', r.status === 201, r.body)
  r = await api('GET', `/reviews/milestone_submission/${aliceMs.id}`, { auth: tok.alice })
  check('update puts the submission back in review', r.body.target.reviewStatus === 'submitted' && r.body.comments.length === 2 && r.body.role === 'contributor', r.body)
  r = await api('POST', `/reviews/milestone_submission/${aliceMs.id}/decision`, { auth: tok.creator, body: { decision: 'approved', note: 'Looks great.' } })
  check('creator approves the milestone', r.status === 200, r.body)
  r = await api('GET', `/bounties/${id2}/milestones`)
  check(
    'approved milestone is public with its contributor but not their text',
    r.body.items[0].status === 'approved' && r.body.items[0].submissions[0]?.submitterWallet === accounts.alice.address.toLowerCase() && r.body.items[0].submissions[0].description === undefined,
    r.body.items[0],
  )
  r = await api('POST', `/bounties/${id2}/milestones/${m1}`, { auth: tok.creator, body: { title: 'Changed', rewardAmount: String(usd(10)) } })
  check('approved milestones cannot be edited', r.status === 409, r.body)
  r = await api('DELETE', `/bounties/${id2}/milestones/${m1}`, { auth: tok.creator })
  check('milestones with submissions cannot be deleted', r.status === 409, r.body)
  r = await api('DELETE', `/bounties/${id2}/milestones/${m2}`, { auth: tok.creator })
  check('an empty milestone can be deleted', r.status === 200, r.body)

  // ---- team coordination ---------------------------------------------------------------------------
  r = await api('POST', '/bounties/1/team/join', { auth: tok.bob, body: {} })
  check('joining a solo bounty is rejected', r.status === 409 || r.status === 404, r.body)
  r = await api('POST', `/bounties/${id2}/team/join`, { auth: tok.creator, body: {} })
  check('creator cannot join their own team', r.status === 403, r.body)
  r = await api('POST', `/bounties/${id2}/team/join`, { auth: tok.bob, body: { message: 'I can build the export feature.' } })
  check('bob asks to join the team', r.status === 201, r.body)
  r = await api('POST', `/bounties/${id2}/team/join`, { auth: tok.bob, body: {} })
  check('duplicate request is 409', r.status === 409, r.body)
  r = await api('POST', `/bounties/${id2}/team/join`, { auth: tok.carol, body: {} })
  check('carol asks to join', r.status === 201, r.body)
  r = await api('GET', `/bounties/${id2}/team`, { auth: tok.creator })
  check('creator sees both requests', r.body.requests.length === 2 && r.body.members.length === 0, r.body)
  const requests = r.body.requests
  r = await api('GET', `/bounties/${id2}/team`)
  check('public sees no pending requests', r.body.requests.length === 0)
  const bobReq = requests.find((m) => m.wallet === accounts.bob.address.toLowerCase())
  const carolReq = requests.find((m) => m.wallet === accounts.carol.address.toLowerCase())
  r = await api('POST', `/bounties/${id2}/team/${bobReq.id}`, { auth: tok.bob, body: { decision: 'accept', role: 'Lead' } })
  check('contributors cannot accept themselves', r.status === 403, r.body)
  r = await api('POST', `/bounties/${id2}/team/${bobReq.id}`, { auth: tok.creator, body: { decision: 'accept', role: 'Export lead', responsibility: 'CSV export and tests', shareBps: 6000 } })
  check('creator accepts bob with a 60% share', r.status === 200, r.body)
  r = await api('POST', `/bounties/${id2}/team/${carolReq.id}`, { auth: tok.creator, body: { decision: 'accept', role: 'QA', shareBps: 5000 } })
  check('shares cannot exceed 100%', r.status === 409, r.body)
  r = await api('POST', `/bounties/${id2}/team/${carolReq.id}`, { auth: tok.creator, body: { decision: 'accept', role: 'QA', responsibility: 'Accessibility review', shareBps: 4000 } })
  check('creator accepts carol with 40%', r.status === 200, r.body)
  r = await api('GET', `/bounties/${id2}/team`)
  check('team progress and allocation are public', r.body.members.length === 2 && r.body.assignedBps === 10000 && r.body.progress.milestonesApproved === 1, r.body)

  // ---- on-chain submissions, review, winners ---------------------------------------------------------
  const subMeta2 = (who) => ({
    description: `Dashboard built by ${who}: weekly active users, retention and export.`,
    pullRequestUrl: `https://github.com/acme/dash/pull/${who.length + 20}`,
    attachments: ['https://example.com/preview.png'],
  })
  for (const who of ['alice', 'bob']) {
    await send(who, board, boardArtifact.abi, 'submitWork', [BigInt(id2), submissionCommitment(id2, subMeta2(who))])
    r = await api('POST', `/bounties/${id2}/submissions`, { auth: tok[who], body: subMeta2(who) })
    check(`${who} attaches dashboard notes`, r.status === 201, r.body)
  }
  r = await api('GET', `/bounties/${id2}/submissions`, { auth: tok.creator })
  const aliceSub = r.body.submissions.find((s) => s.submitterWallet === accounts.alice.address.toLowerCase())
  check('creator sees review status', aliceSub.reviewStatus === 'submitted' && r.body.submissions.length === 2, r.body)
  r = await api('GET', `/bounties/${id2}/submissions`, { auth: tok.bob })
  check('contributors only see their own review status', r.body.submissions.find((s) => s.submitterWallet === accounts.alice.address.toLowerCase()).reviewStatus === null)
  r = await api('GET', `/bounties/${id2}/submissions`)
  check('the public sees no review status', r.body.submissions.every((s) => s.reviewStatus === null))
  r = await api('POST', `/reviews/submission/${aliceSub.id}/decision`, { auth: tok.creator, body: { decision: 'approved', note: 'Best of the two.' } })
  check("creator approves alice's submission", r.status === 200, r.body)
  r = await api('POST', `/reviews/submission/${aliceSub.id}/decision`, { auth: tok.creator, body: { decision: 'approved' } })
  check('repeating a status is rejected', r.status === 409, r.body)

  await send('creator', board, boardArtifact.abi, 'approveWinners', [BigInt(id2), [accounts.alice.address]])
  await send('alice', board, boardArtifact.abi, 'claimReward', [BigInt(id2)])
  await waitFor(async () => (await db.query("SELECT 1 FROM bounty_activity WHERE onchain_id = 2 AND kind = 'claimed'")).rowCount > 0, 'the claim of bounty 2 to be indexed')
  r = await api('POST', `/reviews/submission/${aliceSub.id}/decision`, { auth: tok.creator, body: { decision: 'rejected', note: 'Too late.' } })
  check('reviews are frozen once the bounty is closed', r.status === 409, r.body)

  // ---- notifications ------------------------------------------------------------------------------
  r = await api('GET', '/me/notifications', { auth: tok.alice })
  const kindsAlice = r.body.items.map((n) => n.kind)
  check('alice was notified about reviews and her win', kindsAlice.includes('review_changes_requested') && kindsAlice.includes('review_approved') && kindsAlice.includes('won'), kindsAlice)
  check('unread count matches', r.body.unread === r.body.items.length, r.body.unread)
  r = await api('POST', '/me/notifications/read', { auth: tok.alice, body: { all: true } })
  r = await api('GET', '/me/notifications/unread-count', { auth: tok.alice })
  check('mark all read clears the badge', r.body.unread === 0, r.body)
  r = await api('GET', '/me/notifications', { auth: tok.creator })
  const kindsCreator = r.body.items.map((n) => n.kind)
  check('creator was notified about submissions, requests and approval', ['new_submission', 'milestone_submission', 'team_request', 'bounty_approved'].every((k) => kindsCreator.includes(k)), kindsCreator)
  r = await api('GET', '/me/notifications', { auth: tok.stranger })
  check('notifications work without a linked wallet', r.status === 200 && r.body.items.length === 0)

  // ---- profiles ----------------------------------------------------------------------------------
  r = await api('POST', '/me/profile', { auth: tok.alice, body: { displayName: 'Alice Dev', bio: 'Frontend engineer.', skills: ['React', 'TypeScript'], githubUrl: 'https://github.com/alice' } })
  check('alice saves her profile', r.status === 200, r.body)
  r = await api('GET', `/profiles/${accounts.alice.address}`)
  check(
    'public profile shows verified payout numbers',
    r.status === 200 && r.body.profile.name === 'Alice Dev' && r.body.stats.claims === 2 && r.body.stats.won === 2,
    r.body,
  )
  check('profile lists project participation and milestones', r.body.projects.some((p) => p.slug === 'acme') && r.body.stats.milestonesApproved === 1, r.body)
  check(
    'achievements are evidence based',
    r.body.achievements.some((a) => a.kind === 'first_payout' && a.source === 'chain' && a.txHash) && r.body.achievements.some((a) => a.kind === 'milestone' && a.source === 'platform'),
    r.body.achievements,
  )
  check('profile does not leak e-mail', !JSON.stringify(r.body).includes('@test.dev'))
  r = await api('GET', `/profiles/${accounts.stranger.address}`)
  check('unknown wallet has no profile', r.status === 404, r.body)
  r = await api('GET', '/profiles/not-a-wallet')
  check('malformed wallet is a clean 400', r.status === 400)

  // ---- project board -----------------------------------------------------------------------------
  r = await api('GET', '/projects/acme')
  check(
    'project board shows verified totals',
    r.status === 200 && BigInt(r.body.project.fundedAmount) === reward2 && BigInt(r.body.project.distributedAmount) === usd(95) && r.body.project.contributorCount === 2,
    r.body.project,
  )
  r = await api('GET', '/projects/acme/contributors')
  check('contributors list includes earnings', r.body.items.some((c) => c.wallet === accounts.alice.address.toLowerCase() && BigInt(c.earned) === usd(95) && c.wins === 1), r.body)
  r = await api('GET', '/projects/acme/rewards')
  check('reward history lists the claim with its transaction', r.body.total === 1 && /^0x[0-9a-f]{64}$/.test(r.body.items[0].txHash) && BigInt(r.body.items[0].net) === usd(95), r.body)
  r = await api('GET', '/projects/acme/activity')
  check('project activity comes from contract events', r.body.items.some((a) => a.kind === 'claimed'))
  r = await api('GET', '/projects')
  check('project directory lists acme', r.body.items.some((p) => p.slug === 'acme'))
  r = await api('GET', '/projects/missing-project')
  check('unknown project is 404', r.status === 404)

  // ---- recurring programs -----------------------------------------------------------------------------
  r = await api('POST', '/projects/acme/recurring', { auth: tok.alice, body: { title: 'Weekly docs', cadence: 'weekly', rewardPerCycle: String(usd(20)) } })
  check('only the owner can add recurring programs', r.status === 403, r.body)
  r = await api('POST', '/projects/acme/recurring', {
    auth: tok.creator,
    body: { title: 'Weekly documentation update', description: 'Refresh the docs each week.', category: 'community', cadence: 'weekly', rewardPerCycle: String(usd(20)) },
  })
  check('owner adds a recurring program', r.status === 201, r.body)
  const programId = r.body.id
  r = await api('GET', '/projects/acme/recurring')
  check('program lists with a next due date and no cycles yet', r.body.items.length === 1 && r.body.items[0].cycleCount === 0 && Boolean(r.body.items[0].nextDue), r.body)
  r = await api('POST', `/recurring/${programId}`, { auth: tok.alice, body: { active: false } })
  check('only the owner can pause a program', r.status === 403, r.body)
  r = await api('POST', `/recurring/${programId}`, { auth: tok.creator, body: { active: false } })
  check('owner pauses the program', r.status === 200, r.body)
  r = await api('GET', '/projects/acme/recurring')
  check('paused programs are hidden from the public', r.body.items.length === 0)
  r = await api('GET', '/projects/acme/recurring', { auth: tok.creator })
  check('owners still see paused programs', r.body.items.length === 1 && r.body.items[0].active === false && r.body.items[0].nextDue === null)
  await api('POST', `/recurring/${programId}`, { auth: tok.creator, body: { active: true } })

  const meta3 = { title: 'Weekly docs cycle 1', description: 'Update the getting started guide with the new CLI flags.', acceptanceCriteria: 'Guide matches the released CLI.', tags: ['docs'], links: [] }
  await send('creator', board, boardArtifact.abi, 'createBounty', [meta3.title, bountyCommitment(meta3), usd(20), BigInt(Math.floor(Date.now() / 1000) + 3600), [10000]])
  r = await api('POST', '/bounties', { auth: tok.creator, body: { ...meta3, onchainId: 3, listing: { category: 'community', recurringProgramId: programId } } })
  check('a bounty can be published as a cycle of a program', r.status === 201 && r.body.bounty.projectSlug === 'acme', r.body)
  r = await api('GET', '/projects/acme/recurring', { auth: tok.creator })
  check('program counts its cycles', r.body.items[0].cycleCount === 1 && r.body.items[0].lastBountyId === 3, r.body)
  r = await api('POST', '/bounties/3/listing', { auth: tok.alice, body: { category: 'design' } })
  check('only the creator can change listing details', r.status === 403, r.body)
  r = await api('POST', '/bounties/3/listing', { auth: tok.creator, body: { category: 'design', difficulty: 'beginner', skills: ['writing'], workMode: 'solo', project: 'acme' } })
  check('creator updates listing details', r.status === 200, r.body)

  // ---- workspace ------------------------------------------------------------------------------------
  const firstPrize = (reward * 5000n) / 10_000n
  const secondPrize = (reward * 3000n) / 10_000n
  const aliceNet = secondPrize - (secondPrize * 500n) / 10_000n + (reward2 - (reward2 * 500n) / 10_000n)
  r = await api('GET', '/me/workspace', { auth: tok.creator })
  check('owner dashboard counts come from stored data', r.body.owner.projects === 1 && r.body.owner.completed === 2 && BigInt(r.body.owner.distributed) > 0n && r.body.owner.unfunded === 1, r.body.owner)
  r = await api('GET', '/me/workspace', { auth: tok.alice })
  check('contributor dashboard shows earnings and milestones', BigInt(r.body.contributor.earned) === aliceNet && r.body.contributor.milestonesApproved === 1, r.body.contributor)
  r = await api('GET', '/me/rewards', { auth: tok.alice })
  check('reward history lists both payouts', r.body.received.length === 2, r.body.received)
  r = await api('GET', '/me/review-queue', { auth: tok.creator })
  check('review queue lists submissions of both kinds', r.body.items.some((i) => i.type === 'milestone_submission') && r.body.items.some((i) => i.type === 'submission'), r.body.items.length)
  r = await api('GET', '/me/teams', { auth: tok.bob })
  check("my teams lists bob's membership", r.body.memberships.length === 1 && r.body.memberships[0].shareBps === 6000, r.body)
  r = await api('GET', '/me/projects', { auth: tok.creator })
  check('my projects lists owned projects', r.body.items.length === 1 && r.body.items[0].slug === 'acme', r.body)
  void firstPrize

  // ---- admin ---------------------------------------------------------------------------------------
  r = await api('POST', '/admin/categories', { auth: tok.creator, body: { slug: 'ops', name: 'Operations' } })
  check('non-admins cannot manage categories', r.status === 403)
  r = await api('POST', '/admin/categories', { auth: tok.admin, body: { slug: 'ops', name: 'Operations', description: 'Run things.', icon: 'cpu', examples: ['Runbooks'] } })
  check('admin adds a category', r.status === 200, r.body)
  r = await api('GET', '/categories')
  check('new category is public', r.body.items.some((c) => c.slug === 'ops'))
  await api('POST', '/admin/categories', { auth: tok.admin, body: { slug: 'ops', name: 'Operations', active: false } })
  r = await api('GET', '/categories')
  check('inactive categories are hidden', !r.body.items.some((c) => c.slug === 'ops'))
  r = await api('POST', '/admin/projects/acme/status', { auth: tok.admin, body: { status: 'hidden' } })
  check('admin hides a project', r.status === 200, r.body)
  r = await api('GET', '/projects/acme')
  check('hidden project is 404 for the public', r.status === 404)
  r = await api('GET', '/projects/acme', { auth: tok.creator })
  check('hidden project is still visible to its owner', r.status === 200 && r.body.isOwner === true)
  await api('POST', '/admin/projects/acme/status', { auth: tok.admin, body: { status: 'active' } })
}
