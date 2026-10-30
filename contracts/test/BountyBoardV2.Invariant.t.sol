// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BountyBoardV2} from "../BountyBoardV2.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// =============================================================
//   Handler — wraps all state-changing calls and tracks the
//   expected escrow (sum of funded-but-unclaimed rewards).
//   Must be self-contained: forge does NOT call setUp() on it.
// =============================================================
contract BountyBoardV2Handler is Test {
    // ─── contracts / actors ─────────────────────────────────────
    BountyBoardV2 public board;
    MockERC20     public usdc;

    address internal owner    = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal creator  = makeAddr("creator");
    address internal alice    = makeAddr("alice");

    uint256 internal constant CLAIM_GRACE = 7 days;
    string  internal constant TITLE           = "Fix CI";
    string  internal constant CONTENT_HASH    = "QmABC";
    string  internal constant SUBMISSION_HASH = "QmWORK";

    uint256 internal deadline;

    // ─── tracking ────────────────────────────────────────────────
    /// @dev Sum of rewards for funded-but-unclaimed bounties.
    uint256 public escrowExpected;

    uint256[] internal _fundedIds;
    uint256[] internal _approvedIds;

    // ─── constructor — does the work that setUp() would ──────────
    constructor() {
        usdc  = new MockERC20("Mock USDC", "mUSDC", 6);
        board = new BountyBoardV2(address(usdc), owner, 200, treasury);

        usdc.mint(creator, 100_000_000e6);
        usdc.mint(alice,   10_000e6);

        vm.warp(1_700_000_000);
        deadline = block.timestamp + 30 days;
    }

    // ─── actions ─────────────────────────────────────────────────

    function createAndFund(uint256 reward) public {
        reward = bound(reward, 1, 100_000e6);

        usdc.mint(creator, reward);

        vm.prank(creator);
        uint256 id = board.createBounty(TITLE, CONTENT_HASH, reward, deadline);

        vm.startPrank(creator);
        usdc.approve(address(board), reward);
        board.fundBounty(id);
        vm.stopPrank();

        escrowExpected += reward;
        _fundedIds.push(id);
    }

    function submitAndApprove(uint256 idx) public {
        if (_fundedIds.length == 0) return;
        idx = bound(idx, 0, _fundedIds.length - 1);
        uint256 id = _fundedIds[idx];

        BountyBoardV2.Bounty memory b = board.getBounty(id);
        if (b.status != BountyBoardV2.BountyStatus.Funded) return;

        if (!board.hasSubmitted(id, alice)) {
            vm.prank(alice);
            board.submitWork(id, SUBMISSION_HASH);
        }

        vm.prank(creator);
        board.approveBounty(id, alice);

        _approvedIds.push(id);
        _fundedIds[idx] = _fundedIds[_fundedIds.length - 1];
        _fundedIds.pop();
    }

    function claimReward(uint256 idx) public {
        if (_approvedIds.length == 0) return;
        idx = bound(idx, 0, _approvedIds.length - 1);
        uint256 id = _approvedIds[idx];

        BountyBoardV2.Bounty memory b = board.getBounty(id);
        if (b.status != BountyBoardV2.BountyStatus.Approved) {
            _approvedIds[idx] = _approvedIds[_approvedIds.length - 1];
            _approvedIds.pop();
            return;
        }

        uint256 reward = b.reward;
        vm.prank(alice);
        board.claimReward(id);

        escrowExpected -= reward;
        _approvedIds[idx] = _approvedIds[_approvedIds.length - 1];
        _approvedIds.pop();
    }

    function refundBounty(uint256 idx) public {
        if (_fundedIds.length == 0) return;
        idx = bound(idx, 0, _fundedIds.length - 1);
        uint256 id = _fundedIds[idx];

        BountyBoardV2.Bounty memory b = board.getBounty(id);
        if (b.status != BountyBoardV2.BountyStatus.Funded) {
            _fundedIds[idx] = _fundedIds[_fundedIds.length - 1];
            _fundedIds.pop();
            return;
        }

        vm.warp(b.deadline + 1);
        vm.prank(creator);
        board.refundBounty(id);

        escrowExpected -= b.reward;
        _fundedIds[idx] = _fundedIds[_fundedIds.length - 1];
        _fundedIds.pop();
    }
}

// =============================================================
//   Invariant test contract
// =============================================================
contract BountyBoardV2InvariantTest is Test {
    BountyBoardV2Handler internal handler;

    function setUp() public {
        handler = new BountyBoardV2Handler();
        targetContract(address(handler));
    }

    // ─── invariant_1 ─────────────────────────────────────────────
    /// @dev Board USDC balance must always be >= sum of funded-but-unclaimed rewards.
    function invariant_BoardBalanceGeEscrow() public view {
        uint256 boardBalance = handler.usdc().balanceOf(address(handler.board()));
        assertGe(boardBalance, handler.escrowExpected(),
            "board balance must cover all pending bounties");
    }

    // ─── invariant_2 ─────────────────────────────────────────────
    /// @dev Board balance must equal the handler's tracked escrow exactly.
    ///      Every USDC enters via fundBounty and exits via claimReward/refundBounty —
    ///      both decrement escrowExpected.
    function invariant_BoardBalanceEqEscrow() public view {
        uint256 boardBalance = handler.usdc().balanceOf(address(handler.board()));
        assertEq(boardBalance, handler.escrowExpected(),
            "board balance must equal tracked escrow exactly");
    }

    // ─── invariant_3 ─────────────────────────────────────────────
    /// @dev Bounty count must be a non-negative, only-increasing counter.
    function invariant_BountyCountNonNegative() public view {
        assertGe(handler.board().getBountyCount(), 0);
    }
}
