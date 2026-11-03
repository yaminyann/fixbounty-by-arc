// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BountyBoard
/// @notice USDC-backed bounty escrow with multi-winner prize splits and a platform fee.
/// @dev Access control is per bounty (creator / winners). There is no owner or admin role.
///
///      Fees (all paid to the immutable `treasury`):
///        - POST_FEE_BPS  (0.5%): charged to the creator on top of the reward when funding.
///                                Non-refundable once the bounty is funded.
///        - CLAIM_FEE_BPS (5%):   deducted from each winner's payout when they claim.
///
///      Prize structure: each bounty carries 1..MAX_WINNERS positions whose shares (basis
///      points) sum to 10_000 and never increase from one position to the next. The
///      creator may approve fewer winners than positions; the unused positions' payouts
///      are returned to the creator in the same transaction.
contract BountyBoard is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // =============================================================
    //                           Errors
    // =============================================================

    error BountyNotFound();
    error NotCreator();
    error NotWinner();
    error AlreadyClaimed();
    error InvalidStatus();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error ReviewPeriodNotOver();
    error GracePeriodNotOver();
    error ZeroAddress();
    error ZeroReward();
    error InvalidDeadline();
    error EmptyTitle();
    error TitleTooLong();
    error ContentHashTooLong();
    error EmptySubmissionHash();
    error SubmissionHashTooLong();
    error AlreadySubmitted();
    error SelfSubmission();
    error NoSubmission();
    error InvalidPrizeShares();
    error PayoutTooSmall();
    error InvalidWinners();
    error DuplicateWinner();

    // =============================================================
    //                           Types
    // =============================================================

    enum BountyStatus {
        Open,
        Funded,
        Approved,
        Claimed,
        Refunded,
        Cancelled
    }

    struct Bounty {
        uint256 id;
        address creator;
        string title;
        string contentHash;
        uint256 reward; // total prize pool in USDC base units (6 decimals)
        uint256 deadline;
        BountyStatus status;
        uint256 fundedAt;
        uint256 approvedAt;
        uint256 unclaimedAmount; // gross payouts still held for approved winners
        uint32 submissionCount;
        uint8 winnerSlots; // number of prize positions
        uint8 winnerCount; // number of approved winners
        uint8 claimedCount; // number of winners who already claimed
    }

    struct Submission {
        string submissionHash;
        bool exists;
    }

    // =============================================================
    //                           Events
    // =============================================================

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed creator,
        uint256 reward,
        uint256 deadline,
        uint8 winnerSlots
    );
    event BountyFunded(uint256 indexed bountyId, address indexed creator, uint256 reward, uint256 fee);
    event WorkSubmitted(uint256 indexed bountyId, address indexed contributor, string submissionHash);
    event WinnerApproved(uint256 indexed bountyId, address indexed contributor, uint8 position, uint256 payout);
    event BountyApproved(uint256 indexed bountyId, uint8 winnerCount, uint256 returnedToCreator);
    event RewardClaimed(
        uint256 indexed bountyId,
        address indexed contributor,
        uint8 position,
        uint256 payout,
        uint256 fee
    );
    event BountyRefunded(uint256 indexed bountyId, address indexed creator, uint256 amount);
    event BountyCancelled(uint256 indexed bountyId, address indexed creator);
    /// @dev kind: 0 = post fee (paid by creator at funding), 1 = claim fee (paid by winner at claim).
    event PlatformFeePaid(uint256 indexed bountyId, address indexed payer, uint256 amount, uint8 kind);

    // =============================================================
    //                          Constants
    // =============================================================

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant POST_FEE_BPS = 50; // 0.5%
    uint256 public constant CLAIM_FEE_BPS = 500; // 5%

    /// @notice Time winners have to claim after the creator approves them.
    uint256 public constant CLAIM_GRACE_PERIOD = 7 days;

    /// @notice After the deadline, a creator who received submissions must wait this long
    ///         before reclaiming the pool, so every submission can be reviewed.
    uint256 public constant REVIEW_PERIOD = 7 days;

    uint8 public constant MAX_WINNERS = 10;
    uint256 public constant MAX_TITLE_BYTES = 200;
    uint256 public constant MAX_HASH_BYTES = 128;

    // =============================================================
    //                           Storage
    // =============================================================

    IERC20 public immutable usdc;

    /// @notice Wallet that receives every platform fee.
    address public immutable treasury;

    uint256 private _bountyCount;

    mapping(uint256 => Bounty) private _bounties;
    mapping(uint256 => mapping(address => Submission)) private _submissions;
    mapping(uint256 => uint16[]) private _sharesBps;
    mapping(uint256 => uint256[]) private _payouts;
    mapping(uint256 => address[]) private _winners;
    /// @dev 1-based prize position of an approved winner (0 = not a winner).
    mapping(uint256 => mapping(address => uint8)) private _winnerPosition;
    mapping(uint256 => mapping(address => bool)) private _claimed;

    // =============================================================
    //                         Constructor
    // =============================================================

    /// @param _usdc Address of the USDC ERC-20 token contract.
    /// @param _treasury Wallet that receives all platform fees.
    constructor(address _usdc, address _treasury) {
        if (_usdc == address(0) || _treasury == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        treasury = _treasury;
    }

    // =============================================================
    //                      External Functions
    // =============================================================

    /// @notice Creates a bounty in Open status.
    /// @param title Short bounty title.
    /// @param contentHash Hash of the off-chain bounty description (e.g. "sha256:<hex>").
    /// @param reward Total prize pool in USDC base units, split across all positions.
    /// @param deadline UNIX timestamp after which submissions close.
    /// @param sharesBps Prize share per position in basis points. Length 1..MAX_WINNERS,
    ///        non-increasing, summing to 10_000. `[10000]` is a single-winner bounty.
    function createBounty(
        string calldata title,
        string calldata contentHash,
        uint256 reward,
        uint256 deadline,
        uint16[] calldata sharesBps
    ) external returns (uint256 bountyId) {
        uint256 titleLen = bytes(title).length;
        if (titleLen == 0) revert EmptyTitle();
        if (titleLen > MAX_TITLE_BYTES) revert TitleTooLong();
        if (bytes(contentHash).length > MAX_HASH_BYTES) revert ContentHashTooLong();
        if (reward == 0) revert ZeroReward();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        bountyId = ++_bountyCount;
        _setPrizeStructure(bountyId, reward, sharesBps);

        Bounty storage bounty = _bounties[bountyId];
        bounty.id = bountyId;
        bounty.creator = msg.sender;
        bounty.title = title;
        bounty.contentHash = contentHash;
        bounty.reward = reward;
        bounty.deadline = deadline;
        bounty.winnerSlots = uint8(sharesBps.length);

        emit BountyCreated(bountyId, msg.sender, reward, deadline, uint8(sharesBps.length));
    }

    /// @notice Funds an Open bounty. Pulls `reward + postFee` from the creator: the reward
    ///         is escrowed here and the 0.5% post fee goes straight to the treasury.
    /// @param bountyId Id of the bounty to fund.
    function fundBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _getBountyOrRevert(bountyId);

        if (msg.sender != bounty.creator) revert NotCreator();
        if (bounty.status != BountyStatus.Open) revert InvalidStatus();
        if (block.timestamp > bounty.deadline) revert DeadlinePassed();

        uint256 reward = bounty.reward;
        uint256 fee = (reward * POST_FEE_BPS) / BPS_DENOMINATOR;

        bounty.status = BountyStatus.Funded;
        bounty.fundedAt = block.timestamp;

        usdc.safeTransferFrom(msg.sender, address(this), reward);
        if (fee > 0) {
            usdc.safeTransferFrom(msg.sender, treasury, fee);
            emit PlatformFeePaid(bountyId, msg.sender, fee, 0);
        }

        emit BountyFunded(bountyId, msg.sender, reward, fee);
    }

    /// @notice Submits work for a funded bounty before its deadline.
    /// @param bountyId Id of the bounty.
    /// @param submissionHash Hash of the off-chain submission notes (e.g. "sha256:<hex>").
    function submitWork(uint256 bountyId, string calldata submissionHash) external {
        Bounty storage bounty = _getBountyOrRevert(bountyId);

        if (bounty.status != BountyStatus.Funded) revert InvalidStatus();
        if (msg.sender == bounty.creator) revert SelfSubmission();
        if (block.timestamp > bounty.deadline) revert DeadlinePassed();

        uint256 hashLen = bytes(submissionHash).length;
        if (hashLen == 0) revert EmptySubmissionHash();
        if (hashLen > MAX_HASH_BYTES) revert SubmissionHashTooLong();

        Submission storage submission = _submissions[bountyId][msg.sender];
        if (submission.exists) revert AlreadySubmitted();

        submission.submissionHash = submissionHash;
        submission.exists = true;
        bounty.submissionCount += 1;

        emit WorkSubmitted(bountyId, msg.sender, submissionHash);
    }

    /// @notice Selects winners. `winners[i]` receives prize position `i + 1`. Fewer winners
    ///         than positions is allowed; the unused positions' payouts return to the creator.
    ///         Approval is final and closes submissions.
    /// @param bountyId Id of the bounty.
    /// @param winners Ordered winner list (1st place first). Every entry must have submitted.
    function approveWinners(uint256 bountyId, address[] calldata winners) external nonReentrant {
        Bounty storage bounty = _getBountyOrRevert(bountyId);

        if (msg.sender != bounty.creator) revert NotCreator();
        if (bounty.status != BountyStatus.Funded) revert InvalidStatus();

        uint256 count = winners.length;
        if (count == 0 || count > bounty.winnerSlots) revert InvalidWinners();

        uint256[] storage payouts = _payouts[bountyId];
        uint256 gross;
        for (uint256 i; i < count; ++i) {
            address winner = winners[i];
            if (winner == address(0)) revert ZeroAddress();
            if (!_submissions[bountyId][winner].exists) revert NoSubmission();
            if (_winnerPosition[bountyId][winner] != 0) revert DuplicateWinner();

            _winnerPosition[bountyId][winner] = uint8(i + 1);
            _winners[bountyId].push(winner);
            gross += payouts[i];

            emit WinnerApproved(bountyId, winner, uint8(i + 1), payouts[i]);
        }

        uint256 returned = bounty.reward - gross;

        bounty.status = BountyStatus.Approved;
        bounty.approvedAt = block.timestamp;
        bounty.unclaimedAmount = gross;
        bounty.winnerCount = uint8(count);

        if (returned > 0) usdc.safeTransfer(msg.sender, returned);

        emit BountyApproved(bountyId, uint8(count), returned);
    }

    /// @notice Claims an approved winner's payout, minus the 5% platform fee.
    /// @param bountyId Id of the bounty.
    function claimReward(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _getBountyOrRevert(bountyId);

        if (bounty.status != BountyStatus.Approved) revert InvalidStatus();

        uint8 position = _winnerPosition[bountyId][msg.sender];
        if (position == 0) revert NotWinner();
        if (_claimed[bountyId][msg.sender]) revert AlreadyClaimed();

        uint256 gross = _payouts[bountyId][position - 1];
        uint256 fee = (gross * CLAIM_FEE_BPS) / BPS_DENOMINATOR;

        // Effects
        _claimed[bountyId][msg.sender] = true;
        bounty.unclaimedAmount -= gross;
        bounty.claimedCount += 1;
        if (bounty.claimedCount == bounty.winnerCount) bounty.status = BountyStatus.Claimed;

        // Interactions
        usdc.safeTransfer(msg.sender, gross - fee);
        if (fee > 0) {
            usdc.safeTransfer(treasury, fee);
            emit PlatformFeePaid(bountyId, msg.sender, fee, 1);
        }

        emit RewardClaimed(bountyId, msg.sender, position, gross, fee);
    }

    /// @notice Returns a funded bounty's pool to the creator once the deadline has passed.
    ///         If anyone submitted, the creator must also wait out REVIEW_PERIOD.
    /// @dev The 0.5% post fee already paid to the treasury is not refunded.
    function refundBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _getBountyOrRevert(bountyId);

        if (msg.sender != bounty.creator) revert NotCreator();
        if (bounty.status != BountyStatus.Funded) revert InvalidStatus();
        if (block.timestamp <= bounty.deadline) revert DeadlineNotPassed();
        if (bounty.submissionCount > 0 && block.timestamp <= bounty.deadline + REVIEW_PERIOD) {
            revert ReviewPeriodNotOver();
        }

        uint256 amount = bounty.reward;
        bounty.status = BountyStatus.Refunded;

        usdc.safeTransfer(msg.sender, amount);

        emit BountyRefunded(bountyId, msg.sender, amount);
    }

    /// @notice Lets the creator reclaim payouts that approved winners did not claim within
    ///         CLAIM_GRACE_PERIOD of the approval. Winners who already claimed keep their funds.
    function refundAfterApproval(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _getBountyOrRevert(bountyId);

        if (bounty.status != BountyStatus.Approved) revert InvalidStatus();
        if (msg.sender != bounty.creator) revert NotCreator();
        if (block.timestamp <= bounty.approvedAt + CLAIM_GRACE_PERIOD) revert GracePeriodNotOver();

        uint256 amount = bounty.unclaimedAmount;
        bounty.unclaimedAmount = 0;
        bounty.status = bounty.claimedCount > 0 ? BountyStatus.Claimed : BountyStatus.Refunded;

        usdc.safeTransfer(msg.sender, amount);

        emit BountyRefunded(bountyId, msg.sender, amount);
    }

    /// @notice Cancels an unfunded bounty.
    function cancelBounty(uint256 bountyId) external {
        Bounty storage bounty = _getBountyOrRevert(bountyId);

        if (msg.sender != bounty.creator) revert NotCreator();
        if (bounty.status != BountyStatus.Open) revert InvalidStatus();

        bounty.status = BountyStatus.Cancelled;

        emit BountyCancelled(bountyId, msg.sender);
    }

    // =============================================================
    //                         View Functions
    // =============================================================

    function getBounty(uint256 bountyId) external view returns (Bounty memory bounty) {
        bounty = _bounties[bountyId];
        if (bounty.id == 0) revert BountyNotFound();
    }

    function getSubmission(
        uint256 bountyId,
        address contributor
    ) external view returns (string memory submissionHash, bool exists) {
        _requireExists(bountyId);
        Submission storage submission = _submissions[bountyId][contributor];
        return (submission.submissionHash, submission.exists);
    }

    function hasSubmitted(uint256 bountyId, address contributor) external view returns (bool) {
        _requireExists(bountyId);
        return _submissions[bountyId][contributor].exists;
    }

    /// @notice Prize shares (basis points) and gross payouts (USDC base units) per position.
    function getPrizeStructure(
        uint256 bountyId
    ) external view returns (uint16[] memory sharesBps, uint256[] memory payouts) {
        _requireExists(bountyId);
        return (_sharesBps[bountyId], _payouts[bountyId]);
    }

    /// @notice Approved winners in position order and whether each has claimed.
    function getWinners(
        uint256 bountyId
    ) external view returns (address[] memory winners, bool[] memory claimed) {
        _requireExists(bountyId);
        winners = _winners[bountyId];
        claimed = new bool[](winners.length);
        for (uint256 i; i < winners.length; ++i) {
            claimed[i] = _claimed[bountyId][winners[i]];
        }
    }

    /// @notice 1-based prize position of `account` for a bounty (0 if not an approved winner).
    function winnerPosition(uint256 bountyId, address account) external view returns (uint8) {
        _requireExists(bountyId);
        return _winnerPosition[bountyId][account];
    }

    function getBountyCount() external view returns (uint256) {
        return _bountyCount;
    }

    /// @notice What a creator pays to fund a bounty: the reward plus the post fee.
    function previewFunding(uint256 reward) external pure returns (uint256 fee, uint256 total) {
        fee = (reward * POST_FEE_BPS) / BPS_DENOMINATOR;
        total = reward + fee;
    }

    // =============================================================
    //                       Internal Helpers
    // =============================================================

    /// @dev Validates the share list and stores shares plus gross payouts. Position 0
    ///      absorbs rounding dust so payouts always add up to `reward`.
    function _setPrizeStructure(uint256 bountyId, uint256 reward, uint16[] calldata sharesBps) internal {
        uint256 slots = sharesBps.length;
        if (slots == 0 || slots > MAX_WINNERS) revert InvalidPrizeShares();

        uint256[] storage payouts = _payouts[bountyId];
        uint16[] storage shares = _sharesBps[bountyId];
        uint256 totalShares;
        uint256 distributed;
        for (uint256 i; i < slots; ++i) {
            uint16 share = sharesBps[i];
            if (share == 0) revert InvalidPrizeShares();
            if (i > 0 && share > sharesBps[i - 1]) revert InvalidPrizeShares();
            totalShares += share;
            shares.push(share);

            uint256 payout = (reward * share) / BPS_DENOMINATOR;
            payouts.push(payout);
            if (i > 0) distributed += payout;
        }
        if (totalShares != BPS_DENOMINATOR) revert InvalidPrizeShares();

        payouts[0] = reward - distributed;
        for (uint256 i; i < slots; ++i) {
            if (payouts[i] == 0) revert PayoutTooSmall();
        }
    }

    function _getBountyOrRevert(uint256 bountyId) internal view returns (Bounty storage bounty) {
        bounty = _bounties[bountyId];
        if (bounty.id == 0) revert BountyNotFound();
    }

    function _requireExists(uint256 bountyId) internal view {
        if (_bounties[bountyId].id == 0) revert BountyNotFound();
    }
}
