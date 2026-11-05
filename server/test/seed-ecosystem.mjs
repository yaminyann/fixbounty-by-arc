// Extra data for the local browser harness: a team + milestone bounty, design / research / community work,
// a project, a recurring program and a profile. Everything goes through the real API and the real contract.

export async function seedEcosystem({ api, seedBounty, accounts, usd }) {
  const t = await seedBounty({
    title: 'Build the analytics dashboard',
    description: 'Create a dashboard that shows weekly active users, retention and revenue with exportable charts, backed by the existing metrics API.',
    criteria: 'Charts render from the API, export to CSV, and pass the existing accessibility checks.',
    reward: usd(1000),
    shares: [10000],
    tags: ['react', 'dashboard'],
    days: 21,
    listing: {
      category: 'development',
      difficulty: 'intermediate',
      skills: ['react', 'charts', 'api'],
      workMode: 'team',
      project: 'acme-labs',
      submissionInstructions: 'Link a deployed preview for each milestone.',
      eligibility: 'Open to individuals and small teams.',
    },
  })
  for (const [title, description, amount] of [
    ['UI implementation', 'Layout, navigation and the chart components.', 200],
    ['Backend integration', 'Connect the charts to the metrics API with caching.', 300],
    ['Testing', 'Unit, integration and accessibility tests.', 200],
    ['Final delivery', 'Documentation, release notes and a handover call.', 300],
  ]) {
    await api('POST', `/bounties/${t}/milestones`, 'creator', { title, description, rewardAmount: String(usd(amount)) })
  }
  const ms = (await api('GET', `/bounties/${t}/milestones`, 'creator')).items
  await api('POST', `/bounties/${t}/milestones/${ms[0].id}/submissions`, 'alice', {
    description: 'Chart components and layout are done, with Storybook stories and keyboard support.',
    links: ['https://github.com/acme-labs/dashboard/pull/14'],
  })
  await api('POST', `/bounties/${t}/milestones/${ms[1].id}/submissions`, 'bob', {
    description: 'Metrics client with request caching and error states.',
    links: ['https://github.com/acme-labs/dashboard/pull/17'],
  })
  const subs = (await api('GET', `/bounties/${t}/milestones`, 'creator')).items
  await api('POST', `/reviews/milestone_submission/${subs[0].submissions[0].id}/decision`, 'creator', { decision: 'approved', note: 'Clean work. Approved.' })
  await api('POST', `/reviews/milestone_submission/${subs[1].submissions[0].id}/decision`, 'creator', {
    decision: 'changes_requested',
    note: 'Please handle the empty state when the API returns no rows.',
  })

  await api('POST', `/bounties/${t}/team/join`, 'alice', { message: 'I can own the front end.' })
  await api('POST', `/bounties/${t}/team/join`, 'bob', { message: 'I will take the data layer and tests.' })
  await api('POST', `/bounties/${t}/team/join`, 'carol', { message: 'Happy to help with accessibility testing.' })
  const requests = (await api('GET', `/bounties/${t}/team`, 'creator')).requests
  const member = (who) => requests.find((m) => m.wallet === accounts[who].address.toLowerCase())
  await api('POST', `/bounties/${t}/team/${member('alice').id}`, 'creator', { decision: 'accept', role: 'Front-end lead', responsibility: 'Chart components and layout', shareBps: 5500 })
  await api('POST', `/bounties/${t}/team/${member('bob').id}`, 'creator', { decision: 'accept', role: 'Data and testing', responsibility: 'Metrics client and tests', shareBps: 4500 })

  await seedBounty({
    title: 'Design a logo and brand sheet for the docs site',
    description: 'We need a simple mark, a colour palette and a one-page brand sheet for the new documentation site. Delivery as SVG and a PDF.',
    criteria: 'SVG logo in light and dark variants, a palette with contrast ratios, and a one-page PDF.',
    reward: usd(150),
    shares: [10000],
    tags: ['branding', 'logo'],
    days: 14,
    listing: { category: 'design', difficulty: 'beginner', skills: ['branding', 'figma'], workMode: 'solo', project: 'acme-labs' },
  })
  await seedBounty({
    title: 'Research how competing tools price team plans',
    description: 'Compare the public pricing of five tools in our space and summarise limits, add-ons and anything that surprised you.',
    criteria: 'A spreadsheet with sources and a one-page summary of the findings.',
    reward: usd(80),
    shares: [6000, 4000],
    tags: ['research'],
    days: 9,
    listing: { category: 'research', skills: ['market research'], workMode: 'solo' },
  })
  await seedBounty({
    title: 'Translate the getting started guide into Spanish',
    description: 'Translate the getting started guide and keep code samples unchanged. Review by a second native speaker is welcome.',
    criteria: 'All headings and prose translated, code blocks untouched, links checked.',
    reward: usd(60),
    shares: [10000],
    tags: ['translation', 'docs'],
    days: 12,
    listing: { category: 'community', difficulty: 'beginner', skills: ['spanish', 'translation'], workMode: 'solo', project: 'acme-labs' },
  })

  await api('POST', '/projects/acme-labs/recurring', 'creator', {
    title: 'Weekly documentation update',
    description: 'Refresh the docs after each weekly release.',
    category: 'community',
    cadence: 'weekly',
    rewardPerCycle: String(usd(40)),
  })
  await api('POST', '/me/profile', 'alice', {
    displayName: 'Alice Johnson',
    bio: 'Front-end engineer focused on accessible interfaces and developer tools.',
    skills: ['react', 'typescript', 'css', 'accessibility'],
    githubUrl: 'https://github.com/alice-j',
  })
}
