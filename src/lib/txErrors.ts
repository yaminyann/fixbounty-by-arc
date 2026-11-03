import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'

const REVERTS: Record<string, string> = {
  BountyNotFound: 'This bounty does not exist on-chain.',
  NotCreator: 'Only the bounty creator can do this.',
  NotWinner: 'Only an approved winner can claim this prize.',
  AlreadyClaimed: 'This prize was already claimed.',
  InvalidStatus: 'This action is not available in the bounty’s current state.',
  DeadlinePassed: 'The deadline has passed.',
  DeadlineNotPassed: 'The deadline has not passed yet.',
  ReviewPeriodNotOver: 'Submissions were received, so the 7-day review period after the deadline must finish first.',
  GracePeriodNotOver: 'Winners still have time to claim. The 7-day claim window has not ended.',
  ZeroAddress: 'A required address is missing.',
  ZeroReward: 'The prize must be above zero.',
  InvalidDeadline: 'The deadline must be in the future.',
  EmptyTitle: 'The title cannot be empty.',
  TitleTooLong: 'The title is too long.',
  ContentHashTooLong: 'The content hash is too long.',
  EmptySubmissionHash: 'The submission hash is empty.',
  SubmissionHashTooLong: 'The submission hash is too long.',
  AlreadySubmitted: 'You already submitted work to this bounty.',
  SelfSubmission: 'You cannot submit to your own bounty.',
  NoSubmission: 'One of the selected winners has not submitted work.',
  InvalidPrizeShares: 'The prize split is not valid. It must total 100% and never increase from one place to the next.',
  PayoutTooSmall: 'The prize is too small to split this many ways.',
  InvalidWinners: 'Pick between one winner and the number of prize places.',
  DuplicateWinner: 'The same person was selected twice.',
}

/** Turns anything thrown by a wallet or the chain into one sentence the user can act on. */
export function describeTxError(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return 'You cancelled the request in your wallet. Nothing was sent.'

    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
      if (name && REVERTS[name]) return REVERTS[name]
      if (reverted.reason) return reverted.reason
    }

    const message = `${err.shortMessage} ${err.details ?? ''}`.toLowerCase()
    if (/user (rejected|denied)|rejected the request/.test(message)) return 'You cancelled the request in your wallet. Nothing was sent.'
    if (/insufficient funds|exceeds the balance|gas required exceeds/.test(message)) {
      return 'Your wallet does not have enough USDC to pay the network fee. Get test USDC from the Circle faucet and try again.'
    }
    if (/allowance/.test(message)) return 'Approve USDC for the contract first, then try again.'
    if (/exceeds balance|transfer amount exceeds/.test(message)) return 'Your USDC balance is too low for this amount.'
    if (/chain mismatch|does not match the target chain/.test(message)) return 'Switch your wallet to the right network and try again.'
    return err.shortMessage || 'The transaction could not be sent.'
  }
  if (err instanceof Error) {
    if (/user (rejected|denied)/i.test(err.message)) return 'You cancelled the request in your wallet. Nothing was sent.'
    return err.message
  }
  return 'The transaction could not be sent.'
}
