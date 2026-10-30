// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BountyBoardV2
/// @notice A USDC-backed bounty platform for open-source development work with protocol fee support.
/// @dev Keeps V1 bounty lifecycle logic and adds fee snapshotting at funding time.
contract BountyBoardV2 is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // =============================================================
    //                           Errors
    // =============================================================

    /// @notice Thrown when a bounty id does not map to an existing bounty.
    error BountyNotFound();

    /// @notice Thrown when a caller is not the creator of the targeted bounty.
    error NotCreator();

    /// @notice Thrown when a caller is not the contributor approved for reward claim.
    error NotApprovedContributor();

    /// @notice Thrown when a function is called while bounty status is invalid for that transition.
    error InvalidStatus();

    /// @notice Thrown when an action requires the deadline to still be active but it has already passed.
    error DeadlinePassed();

    /// @notice Thrown when an action requires the deadline to be passed but it is still active.
    error DeadlineNotPassed();

    /// @notice Thrown when an approved-bounty refund grace period has not elapsed.
    error GracePeriodNotOver();

    /// @notice Thrown when a zero address is supplied where a non-zero address is required.
    error ZeroAddress();

    /// @notice Thrown when reward amount is zero.
    error ZeroReward();

    /// @notice Thrown when deadline is not strictly in the future.
    error InvalidDeadline();

    /// @notice Thrown when bounty title is empty.
    error EmptyTitle();

    /// @notice Thrown when a contributor tries to submit more than once for the same bounty.
    error AlreadySubmitted();

    /// @notice Thrown when creator attempts to submit work to their own bounty.
    error SelfSubmission();

    /// @notice Thrown when a contributor has no recorded submission for a bounty.
    error NoSubmission();

    /// @notice Thrown when submission hash is empty.
    error EmptySubmissionHash();

    /// @notice Thrown when the configured fee exceeds MAX_FEE_BPS.
    error FeeTooHigh();

    /// @notice Thrown when treasury is required for fee transfer but is not configured.
    error TreasuryNotSet();

    // =============================================================
    //                           Types
    // =============================================================

    /// @notice Bounty lifecycle states.
    enum BountyStatus {
        Open,
        Funded,
        Approved,
        Claimed,
        Refunded,
        Cancelled
    }

    /// @notice Core bounty state.
    struct Bounty {
        uint256 id;
        address creator;
        string title;
        string contentHash;
        uint256 reward;
        uint256 deadline;
        BountyStatus status;
        address approvedContributor;
        uint256 fundedAt;
    }

    /// @notice Submission state per bounty per contributor.
    struct Submission {
        string submissionHash;
        bool exists;
    }

    // =============================================================
    //                           Events
    // =============================================================

    event BountyCreated(uint256 indexed bountyId, address indexed creator, uint256 reward, uint256 deadline);
    event BountyFunded(uint256 indexed bountyId, address indexed creator, uint256 reward);
    event WorkSubmitted(uint256 indexed bountyId, address indexed contributor, string submissionHash);
    event BountyApproved(uint256 indexed bountyId, address indexed contributor);
    event RewardClaimed(uint256 indexed bountyId, address indexed contributor, uint256 reward, uint256 feeAmount);
    event BountyRefunded(uint256 indexed bountyId, address indexed creator, uint256 reward);
    event BountyCancelled(uint256 indexed bountyId, address indexed creator);
    event FeeBpsUpdated(uint256 indexed oldFeeBps, uint256 indexed newFeeBps);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // =============================================================
    //                           Storage
    // =============================================================

    /// @notice Arc Testnet USDC (or configured equivalent) used for bounty rewards.
    IERC20 public immutable usdc;

    /// @notice Grace period after deadline during which approved contributor can still claim.
    uint256 public constant CLAIM_GRACE_PERIOD = 7 days;

    /// @notice Maximum protocol fee in basis points (10%).
    uint256 public constant MAX_FEE_BPS = 1000;

    /// @notice Platform fee in basis points applied to newly funded bounties.
    uint256 public feeBps;

    /// @notice Treasury receiver for fee collection.
    address public treasury;

    /// @dev Auto-incrementing bounty counter. First bounty id is 1.
    uint256 private _bountyCount;

    /// @dev Bounty id => Bounty data.
    mapping(uint256 => Bounty) private _bounties;

    /// @dev Bounty id => Contributor => Submission data.
    mapping(uint256 => mapping(address => Submission)) private _submissions;

    /// @dev Bounty id => fee bps snapshot captured at funding time.
    mapping(uint256 => uint256) private _bountyFeeBps;

    /// @dev Bounty id => treasury snapshot captured at funding time.
    mapping(uint256 => address) private _bountyTreasury;

    // =============================================================
    //                         Constructor
    // =============================================================

    /// @param _usdc Address of the USDC ERC-20 token contract.
    /// @param _initialOwner Initial owner account for Ownable2Step controls.
    /// @param _initialFeeBps Initial platform fee in basis points.
    /// @param _treasury Initial treasury receiving protocol fee.
    constructor(address _usdc, address _initialOwner, uint256 _initialFeeBps, address _treasury) Ownable(_initialOwner) {
        if (_usdc == address(0)) revert ZeroAddress();
        if (_initialOwner == address(0)) revert ZeroAddress();
        if (_initialFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        if (_treasury == address(0)) revert ZeroAddress();

        usdc = IERC20(_usdc);
        feeBps = _initialFeeBps;
        treasury = _treasury;
    }

    // =============================================================
    //                Owner Configuration Functions
    // =============================================================

    /// @notice Updates the protocol fee for future bounty funding only.
    /// @param newFeeBps New fee in basis points.
    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();

        uint256 oldFeeBps = feeBps;
        feeBps = newFeeBps;

        emit FeeBpsUpdated(oldFeeBps, newFeeBps);
    }

    /// @notice Updates the treasury receiver used for fee transfers.
    /// @param newTreasury New treasury address.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();

        address oldTreasury = treasury;
        treasury = newTreasury;

        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    // =============================================================
    //                      External Functions
    // =============================================================

    /// @notice Creates a new bounty in Open status.
    /// @param title Short bounty title.
    /// @param contentHash IPFS CID or off-chain description hash.
    /// @param reward Reward amount in USDC base units (6 decimals).
    /// @param deadline UNIX timestamp after which submissions close.
    /// @return bountyId Newly created bounty id.
    function createBounty(
        string calldata title,
        string calldata contentHash,
        uint256 reward,
        uint256 deadline
    ) external returns (uint256 bountyId) {
        if (bytes(title).length == 0) revert EmptyTitle();
        if (reward == 0) revert ZeroReward();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        bountyId = ++_bountyCount;

        _bounties[bountyId] = Bounty({
            id: bountyId,
            creator: msg.sender,
            title: title,
            contentHash: contentHash,
            reward: reward,
            deadline: deadline,
            status: BountyStatus.Open,
            approvedContributor: address(0),
            fundedAt: 0
        });

        emit BountyCreated(bountyId, msg.sender, reward, deadline);
    }

    /// @notice Funds an Open bounty by transferring the full reward from creator into this contract.
    /// @dev Snapshots current feeBps at funding time to lock economic terms for this bounty.
    /// @param bountyId Id of the bounty to fund.
    function fundBounty(uint256 bountyId) external {
        Bounty storage bounty = _getBountyOrRevert(bountyId);

        if (msg.sender != bounty.creator) revert NotCreator();
        if (bounty.status != BountyStatus.Open) revert InvalidStatus();

        _bountyFeeBps[bountyId] = feeBps;
        _bountyTreasury[bountyId] = treasury;
        bounty.status = BountyStatus.Funded;
        bounty.fundedAt = block.timestamp;

        usdc.safeTransferFrom(msg.sender, address(this), bounty.reward);

        emit BountyFunded(bountyId, msg.sender, bounty.reward);
    }

    /// @notice Submits work for a funded bounty before its deadline.
    /// @param bountyId Id of the bounty.
    /// @param submissionHash IPFS CID or hash of submission content.
    function submitWork(uint256 bountyId, string calldata submissionHash) external {
        Bounty storage bounty = _getBountyOrRevert(bountyId);

        if (bounty.status != BountyStatus.Funded) revert InvalidStatus();
        if (msg.sender == bounty.creator) revert SelfSubmission();
        if (block.timestamp > bounty.deadline) revert DeadlinePassed();
        if (bytes(submissionHash).length == 0) revert EmptySubmissionHash();

        Submission storage submission = _submissions[bountyId][msg.sender];
        if (submission.exists) revert AlreadySubmitted();

        submission.submissionHash = submissionHash;
        submission.exists = true;

        emit WorkSubmitted(bountyId, msg.sender, submissionHash);
    }

    /// @notice Approves a contributor's submission and transitions bounty to Approved.
    /// @param bountyId Id of the bounty.
    /// @param contributor Contributor address to approve.
    function approveBounty(uint256 bountyId, address contributor) external {
        Bounty storage bounty = _getBountyOrRevert(bountyId);

        if (msg.sender != bounty.creator) revert NotCreator();
        if (bounty.status != BountyStatus.Funded) revert InvalidStatus();
        if (contributor == address(0)) revert ZeroAddress();

        Submission storage submission = _submissions[bountyId][contributor];
        if (!submission.exists) revert NoSubmission();

        bounty.approvedContributor = contributor;
        bounty.status = BountyStatus.Approved;

        emit BountyApproved(bountyId, contributor);
    }

    /// @notice Claims reward for an approved bounty with protocol fee deducted from escrow.
    /// @dev Uses fee and treasury snapshots captured at funding time; status is updated before token transfers.
    /// @param bountyId Id of the bounty.
    function claimReward(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _getBountyOrRevert(bountyId);
        address snapshotTreasury = _bountyTreasury[bountyId];

        if (bounty.status != BountyStatus.Approved) revert InvalidStatus();
        if (msg.sender != bounty.approvedContributor) revert NotApprovedContributor();

        uint256 reward = bounty.reward;
        uint256 snapshotFeeBps = _bountyFeeBps[bountyId];
        uint256 feeAmount = (reward * snapshotFeeBps) / 10_000;
        uint256 contributorPayout = reward - feeAmount;

        if (feeAmount > 0 && snapshotTreasury == address(0)) revert TreasuryNotSet();

        // Effects
        bounty.status = BountyStatus.Claimed;

        // Interactions
        if (feeAmount > 0) {
            usdc.safeTransfer(snapshotTreasury, feeAmount);
        }
        usdc.safeTransfer(msg.sender, contributorPayout);

        emit RewardClaimed(bountyId, msg.sender, contributorPayout, feeAmount);
    }

    /// @notice Refunds a funded bounty back to creator after deadline has passed.
    /// @dev Checks-effects-interactions: status is updated before token transfer.
    /// @param bountyId Id of the bounty.
    function refundBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _getBountyOrRevert(bountyId);

        if (msg.sender != bounty.creator) revert NotCreator();
        if (bounty.status != BountyStatus.Funded) revert InvalidStatus();
        if (block.timestamp <= bounty.deadline) revert DeadlineNotPassed();

        uint256 reward = bounty.reward;

        // Effects
        bounty.status = BountyStatus.Refunded;

        // Interaction
        usdc.safeTransfer(msg.sender, reward);

        emit BountyRefunded(bountyId, msg.sender, reward);
    }

    /// @notice Refunds an approved bounty back to creator after claim grace period has passed.
    /// @dev Checks-effects-interactions: status is updated before token transfer.
    /// @param bountyId Id of the bounty.
    function refundAfterApproval(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _getBountyOrRevert(bountyId);

        if (bounty.status != BountyStatus.Approved) revert InvalidStatus();
        if (msg.sender != bounty.creator) revert NotCreator();
        if (block.timestamp <= bounty.deadline + CLAIM_GRACE_PERIOD) revert GracePeriodNotOver();

        uint256 reward = bounty.reward;

        // Effects
        bounty.status = BountyStatus.Refunded;

        // Interaction
        usdc.safeTransfer(msg.sender, reward);

        emit BountyRefunded(bountyId, msg.sender, reward);
    }

    /// @notice Cancels an unfunded bounty.
    /// @param bountyId Id of the bounty.
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

    /// @notice Returns bounty data by id.
    /// @param bountyId Id of the bounty.
    /// @return bounty Full bounty struct.
    function getBounty(uint256 bountyId) external view returns (Bounty memory bounty) {
        bounty = _getBountyOrRevertView(bountyId);
    }

    /// @notice Returns submission data for a contributor on a bounty.
    /// @param bountyId Id of the bounty.
    /// @param contributor Contributor address.
    /// @return submissionHash Stored submission hash.
    /// @return exists True if a submission was recorded.
    function getSubmission(
        uint256 bountyId,
        address contributor
    ) external view returns (string memory submissionHash, bool exists) {
        _getBountyOrRevertView(bountyId);

        Submission storage submission = _submissions[bountyId][contributor];
        return (submission.submissionHash, submission.exists);
    }

    /// @notice Returns total number of created bounties.
    function getBountyCount() external view returns (uint256) {
        return _bountyCount;
    }

    /// @notice Returns whether contributor has submitted work for a bounty.
    /// @param bountyId Id of the bounty.
    /// @param contributor Contributor address.
    function hasSubmitted(uint256 bountyId, address contributor) external view returns (bool) {
        _getBountyOrRevertView(bountyId);
        return _submissions[bountyId][contributor].exists;
    }

    /// @notice Returns the fee basis points snapshotted when a bounty was funded.
    /// @param bountyId Id of the bounty.
    /// @return snapshotFeeBps Snapshotted fee basis points.
    function getFeeForBounty(uint256 bountyId) external view returns (uint256 snapshotFeeBps) {
        _getBountyOrRevertView(bountyId);
        snapshotFeeBps = _bountyFeeBps[bountyId];
    }

    /// @notice Returns the treasury address snapshotted when a bounty was funded.
    /// @param bountyId Id of the bounty.
    /// @return snapshotTreasury Snapshotted treasury address.
    function getTreasuryForBounty(uint256 bountyId) external view returns (address snapshotTreasury) {
        _getBountyOrRevertView(bountyId);
        snapshotTreasury = _bountyTreasury[bountyId];
    }

    /// @notice Previews fee split for a reward amount using current global feeBps.
    /// @param rewardAmount Reward amount in token base units.
    /// @return feeAmount Protocol fee amount.
    /// @return contributorPayout Contributor payout after fee deduction.
    function previewFee(uint256 rewardAmount) external view returns (uint256 feeAmount, uint256 contributorPayout) {
        feeAmount = (rewardAmount * feeBps) / 10_000;
        contributorPayout = rewardAmount - feeAmount;
    }

    // =============================================================
    //                       Internal Helpers
    // =============================================================

    /// @dev Returns mutable bounty storage pointer or reverts if not found.
    function _getBountyOrRevert(uint256 bountyId) internal view returns (Bounty storage bounty) {
        bounty = _bounties[bountyId];
        if (bounty.id == 0) revert BountyNotFound();
    }

    /// @dev Returns bounty memory copy or reverts if not found.
    function _getBountyOrRevertView(uint256 bountyId) internal view returns (Bounty memory bounty) {
        bounty = _bounties[bountyId];
        if (bounty.id == 0) revert BountyNotFound();
    }
}
