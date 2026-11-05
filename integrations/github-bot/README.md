# BountyFi GitHub bot

Comment `/bounty 200` on an issue. The bot replies with a link that opens BountyFi's **Post a bounty** form with the issue title, the prize and the issue link already filled in, and the issue's labels as tags. Add words after the amount to add tags: `/bounty 200 react css`.

The bot never creates a bounty. A bounty needs your wallet to lock the prize on-chain, so it only prepares the form. It uses the repository's own `GITHUB_TOKEN`, so it needs **no BountyFi account and no secret**. Only people with write, maintain or admin access to the repository can use the command.

## Install

Copy this workflow into your repository as `.github/workflows/bountyfi.yml`:

```yaml
name: BountyFi
on:
  issue_comment:
    types: [created]

permissions:
  issues: write

jobs:
  bounty:
    if: ${{ !github.event.issue.pull_request && startsWith(github.event.comment.body, '/bounty') }}
    runs-on: ubuntu-latest
    steps:
      - uses: yaminyann/fixbounty-by-arc/integrations/github-bot@main
```

Pin a commit hash instead of `@main` if you want updates only when you choose.

## Test

```
node integrations/github-bot/bot.test.mjs
```
