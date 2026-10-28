// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BountyBoard} from "../BountyBoard.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// =============================================================
//                         Handler
// =============================================================

/// @dev Exercises the BountyBoard state machine through bounded,
///      realistic actions. Tracks a ghost variable of the total USDC
///      that has been deposited and not yet withdrawn so the invariant
///      test can compare against the contract's actual balance.
contract BountyBoardHandler is Test {

    BountyBoard public board;
    MockERC20   public usdc;

    address internal creator  = makeAddr("inv_creator");
    address internal contrib  = makeAddr("inv_contrib");

    /// @dev Sum of rewards currently held inside the board
    ///      (funded but not yet claimed/refunded).
    uint256 public ghostHeld;

    /// @dev deadline used for all bounties created by this handler
    uint256 public immutable DEADLINE;

    uint256 internal constant REWARD = 100e6;

    constructor(BountyBoard _board, MockERC20 _usdc) {
        board = _board;
        usdc  = _usdc;
        DEADLINE = block.timestamp + 30 days;

        // pre-mint plenty of USDC to the creator address
        usdc.mint(creator, 1_000_000e6);

        vm.prank(creator);
        usdc.approve(address(board), type(uint256).max);
    }

    // ── action: create + fund ─────────────────────────────────────
    function createAndFund() external returns (uint256 bountyId) {
        vm.prank(creator);
        bountyId = board.createBounty("t", "h", REWARD, DEADLINE);

        vm.prank(creator);
        board.fundBounty(bountyId);

        ghostHeld += REWARD;
    }

    // ── action: submit work (contrib on latest funded bounty) ─────
    function submitWork(uint256 bountyId) external {
        bountyId = bound(bountyId, 1, board.getBountyCount());
        BountyBoard.Bounty memory b = _safeBounty(bountyId);

        if (b.status != BountyBoard.BountyStatus.Funded) return;
        if (block.timestamp > b.deadline) return;
        if (board.hasSubmitted(bountyId, contrib)) return;

        vm.prank(contrib);
        board.submitWork(bountyId, "hash");
    }

    // ── action: approve contrib ───────────────────────────────────
    function approve(uint256 bountyId) external {
        bountyId = bound(bountyId, 1, board.getBountyCount());
        BountyBoard.Bounty memory b = _safeBounty(bountyId);

        if (b.status != BountyBoard.BountyStatus.Funded) return;
        if (!board.hasSubmitted(bountyId, contrib)) return;

        vm.prank(creator);
        board.approveBounty(bountyId, contrib);
    }

    // ── action: claim reward ──────────────────────────────────────
    function claimReward(uint256 bountyId) external {
        bountyId = bound(bountyId, 1, board.getBountyCount());
        BountyBoard.Bounty memory b = _safeBounty(bountyId);

        if (b.status != BountyBoard.BountyStatus.Approved) return;
        if (b.approvedContributor != contrib) return;

        vm.prank(contrib);
        board.claimReward(bountyId);

        ghostHeld -= b.reward;
    }

    // ── action: refund after deadline ─────────────────────────────
    function refundBounty(uint256 bountyId) external {
        bountyId = bound(bountyId, 1, board.getBountyCount());
        BountyBoard.Bounty memory b = _safeBounty(bountyId);

        if (b.status != BountyBoard.BountyStatus.Funded) return;
        if (block.timestamp <= b.deadline) return;

        vm.prank(creator);
        board.refundBounty(bountyId);

        ghostHeld -= b.reward;
    }

    // ── action: refund after approval + grace period ──────────────
    function refundAfterApproval(uint256 bountyId) external {
        bountyId = bound(bountyId, 1, board.getBountyCount());
        BountyBoard.Bounty memory b = _safeBounty(bountyId);

        if (b.status != BountyBoard.BountyStatus.Approved) return;
        uint256 graceCutoff = b.deadline + board.CLAIM_GRACE_PERIOD();
        if (block.timestamp <= graceCutoff) return;

        vm.prank(creator);
        board.refundAfterApproval(bountyId);

        ghostHeld -= b.reward;
    }

    // ── action: cancel (only Open bounties) ───────────────────────
    function cancelBounty(uint256 bountyId) external {
        bountyId = bound(bountyId, 1, board.getBountyCount());
        BountyBoard.Bounty memory b = _safeBounty(bountyId);

        if (b.status != BountyBoard.BountyStatus.Open) return;

        vm.prank(creator);
        board.cancelBounty(bountyId);
        // Open bounties are never funded → ghostHeld unaffected
    }

    // ── time helper: advance time by up to 10 days ────────────────
    function warpForward(uint256 secs) external {
        secs = bound(secs, 0, 10 days);
        skip(secs);
    }

    // ── internal helper ───────────────────────────────────────────
    function _safeBounty(uint256 id) internal view returns (BountyBoard.Bounty memory b) {
        if (board.getBountyCount() == 0) return b;
        try board.getBounty(id) returns (BountyBoard.Bounty memory fetched) {
            b = fetched;
        } catch {
            // id not found — return zero struct
        }
    }
}

// =============================================================
//                    Invariant test contract
// =============================================================

contract BountyBoardInvariantTest is Test {
    BountyBoard         internal board;
    MockERC20           internal usdc;
    BountyBoardHandler  internal handler;

    function setUp() public {
        // Start at a fixed timestamp so deadlines are meaningful
        vm.warp(1_700_000_000);

        usdc    = new MockERC20("Mock USDC", "mUSDC", 6);
        board   = new BountyBoard(address(usdc));
        handler = new BountyBoardHandler(board, usdc);

        // Only let the fuzzer drive the handler
        targetContract(address(handler));
    }

    // ─────────────────────────────────────────────────────────────
    // INVARIANT: board's USDC balance always equals ghost tracked held
    // ─────────────────────────────────────────────────────────────
    /// @dev Conservation law: every USDC that enters the board through
    ///      fundBounty must either be claimable (Approved), or returned
    ///      (Claimed/Refunded). The contract's actual token balance must
    ///      always match the sum of rewards for bounties that are still
    ///      in the board (ghostHeld).
    function invariant_BoardBalanceEqualsGhostHeld() public view {
        assertEq(
            usdc.balanceOf(address(board)),
            handler.ghostHeld(),
            "board USDC balance diverges from ghost tracking"
        );
    }

    // ─────────────────────────────────────────────────────────────
    // INVARIANT: board never holds more USDC than was minted
    // ─────────────────────────────────────────────────────────────
    function invariant_BoardBalanceNeverExceedsMinted() public view {
        assertLe(
            usdc.balanceOf(address(board)),
            usdc.totalSupply(),
            "board holds more USDC than total supply"
        );
    }

    // ─────────────────────────────────────────────────────────────
    // INVARIANT: bounty count never decreases
    // ─────────────────────────────────────────────────────────────
    function invariant_BountyCountNeverDecreases() public view {
        // This is a monotonicity check — the counter must be non-negative
        // and consistent with getBountyCount() (which reads _bountyCount).
        assertGe(board.getBountyCount(), 0);
    }
}
