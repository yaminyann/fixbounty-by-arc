// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BountyBoard} from "../BountyBoard.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// =============================================================
//                         Handler
// =============================================================

/// @dev Drives the BountyBoard state machine through bounded, realistic actions
///      with several contributors and prize structures. Tracks the fees the
///      treasury should have collected so the invariants can cross-check them.
contract BountyBoardHandler is Test {
    BountyBoard public board;
    MockERC20 public usdc;

    address public creator = makeAddr("inv_creator");
    address public treasury;
    address[3] public contribs;

    uint256 public ghostFees;
    uint256 public immutable DEADLINE;
    uint256 internal constant REWARD = 100e6;

    constructor(BountyBoard _board, MockERC20 _usdc, address _treasury) {
        board = _board;
        usdc = _usdc;
        treasury = _treasury;
        DEADLINE = block.timestamp + 30 days;

        for (uint256 i; i < 3; ++i) {
            contribs[i] = makeAddr(string.concat("inv_contrib", vm.toString(i)));
        }

        usdc.mint(creator, 1_000_000_000e6);
        vm.prank(creator);
        usdc.approve(address(board), type(uint256).max);
    }

    function _shares(uint256 kind) internal pure returns (uint16[] memory s) {
        if (kind == 0) {
            s = new uint16[](1);
            s[0] = 10_000;
        } else if (kind == 1) {
            s = new uint16[](2);
            s[0] = 6_000;
            s[1] = 4_000;
        } else {
            s = new uint16[](3);
            s[0] = 5_000;
            s[1] = 3_000;
            s[2] = 2_000;
        }
    }

    function createAndFund(uint256 kind) external {
        kind = bound(kind, 0, 2);
        vm.prank(creator);
        uint256 id = board.createBounty("t", "h", REWARD, DEADLINE, _shares(kind));
        vm.prank(creator);
        board.fundBounty(id);
        ghostFees += (REWARD * 50) / 10_000;
    }

    function createOnly(uint256 kind) external {
        kind = bound(kind, 0, 2);
        vm.prank(creator);
        board.createBounty("t", "h", REWARD, DEADLINE, _shares(kind));
    }

    function submitWork(uint256 bountyId, uint256 who) external {
        bountyId = _id(bountyId);
        if (bountyId == 0) return;
        address c = contribs[bound(who, 0, 2)];
        BountyBoard.Bounty memory b = board.getBounty(bountyId);

        if (b.status != BountyBoard.BountyStatus.Funded) return;
        if (block.timestamp > b.deadline) return;
        if (board.hasSubmitted(bountyId, c)) return;

        vm.prank(c);
        board.submitWork(bountyId, "hash");
    }

    function approve(uint256 bountyId, uint256 count) external {
        bountyId = _id(bountyId);
        if (bountyId == 0) return;
        BountyBoard.Bounty memory b = board.getBounty(bountyId);
        if (b.status != BountyBoard.BountyStatus.Funded) return;

        uint256 max = b.winnerSlots < 3 ? b.winnerSlots : 3;
        uint256 n = bound(count, 1, max);

        address[] memory picks = new address[](n);
        uint256 found;
        for (uint256 i; i < 3 && found < n; ++i) {
            if (board.hasSubmitted(bountyId, contribs[i])) picks[found++] = contribs[i];
        }
        if (found == 0) return;

        address[] memory winners = new address[](found);
        for (uint256 i; i < found; ++i) winners[i] = picks[i];

        vm.prank(creator);
        board.approveWinners(bountyId, winners);
    }

    function claimReward(uint256 bountyId, uint256 who) external {
        bountyId = _id(bountyId);
        if (bountyId == 0) return;
        address c = contribs[bound(who, 0, 2)];
        BountyBoard.Bounty memory b = board.getBounty(bountyId);
        if (b.status != BountyBoard.BountyStatus.Approved) return;

        uint8 pos = board.winnerPosition(bountyId, c);
        if (pos == 0) return;
        (address[] memory winners, bool[] memory claimed) = board.getWinners(bountyId);
        if (claimed[pos - 1]) return;
        winners; // silence unused

        (, uint256[] memory payouts) = board.getPrizeStructure(bountyId);
        ghostFees += (payouts[pos - 1] * 500) / 10_000;

        vm.prank(c);
        board.claimReward(bountyId);
    }

    function refundBounty(uint256 bountyId) external {
        bountyId = _id(bountyId);
        if (bountyId == 0) return;
        BountyBoard.Bounty memory b = board.getBounty(bountyId);
        if (b.status != BountyBoard.BountyStatus.Funded) return;
        if (block.timestamp <= b.deadline) return;
        if (b.submissionCount > 0 && block.timestamp <= b.deadline + board.REVIEW_PERIOD()) return;

        vm.prank(creator);
        board.refundBounty(bountyId);
    }

    function refundAfterApproval(uint256 bountyId) external {
        bountyId = _id(bountyId);
        if (bountyId == 0) return;
        BountyBoard.Bounty memory b = board.getBounty(bountyId);
        if (b.status != BountyBoard.BountyStatus.Approved) return;
        if (block.timestamp <= b.approvedAt + board.CLAIM_GRACE_PERIOD()) return;

        vm.prank(creator);
        board.refundAfterApproval(bountyId);
    }

    function cancelBounty(uint256 bountyId) external {
        bountyId = _id(bountyId);
        if (bountyId == 0) return;
        BountyBoard.Bounty memory b = board.getBounty(bountyId);
        if (b.status != BountyBoard.BountyStatus.Open) return;

        vm.prank(creator);
        board.cancelBounty(bountyId);
    }

    function warpForward(uint256 secs) external {
        secs = bound(secs, 0, 10 days);
        skip(secs);
    }

    function _id(uint256 raw) internal view returns (uint256) {
        uint256 count = board.getBountyCount();
        if (count == 0) return 0;
        return bound(raw, 1, count);
    }
}

// =============================================================
//                    Invariant test contract
// =============================================================

contract BountyBoardInvariantTest is Test {
    BountyBoard internal board;
    MockERC20 internal usdc;
    BountyBoardHandler internal handler;
    address internal treasury = 0x378862A20B312298dc54585CbabC531D70F9baE9;

    function setUp() public {
        vm.warp(1_700_000_000);

        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        board = new BountyBoard(address(usdc), treasury);
        handler = new BountyBoardHandler(board, usdc, treasury);

        targetContract(address(handler));
    }

    /// @dev Escrow conservation: the board holds exactly what its live bounties are owed.
    ///      Funded bounties hold the full reward; Approved bounties hold unclaimed payouts.
    function invariant_BoardBalanceEqualsLiveEscrow() public view {
        uint256 expected;
        uint256 count = board.getBountyCount();
        for (uint256 id = 1; id <= count; ++id) {
            BountyBoard.Bounty memory b = board.getBounty(id);
            if (b.status == BountyBoard.BountyStatus.Funded) {
                expected += b.reward;
            } else if (b.status == BountyBoard.BountyStatus.Approved) {
                expected += b.unclaimedAmount;
            } else {
                assertEq(b.unclaimedAmount, 0, "settled bounty still holds funds");
            }
        }
        assertEq(usdc.balanceOf(address(board)), expected, "board balance diverges from live escrow");
    }

    /// @dev The treasury receives exactly the fees the handler expects (post + claim fees).
    function invariant_TreasuryReceivesExactFees() public view {
        assertEq(usdc.balanceOf(treasury), handler.ghostFees(), "treasury balance diverges from fee ledger");
    }

    /// @dev No USDC is created or destroyed by the board.
    function invariant_TotalSupplyConserved() public view {
        uint256 sum = usdc.balanceOf(address(board)) + usdc.balanceOf(treasury) + usdc.balanceOf(handler.creator());
        for (uint256 i; i < 3; ++i) sum += usdc.balanceOf(handler.contribs(i));
        assertEq(sum, usdc.totalSupply(), "token supply not conserved");
    }

    function invariant_BountyCountMatchesIds() public view {
        uint256 count = board.getBountyCount();
        if (count > 0) assertEq(board.getBounty(count).id, count);
    }

    /// @dev claimedCount never exceeds winnerCount; winnerCount never exceeds the positions.
    function invariant_WinnerCountsAreConsistent() public view {
        uint256 count = board.getBountyCount();
        for (uint256 id = 1; id <= count; ++id) {
            BountyBoard.Bounty memory b = board.getBounty(id);
            assertLe(b.claimedCount, b.winnerCount);
            assertLe(b.winnerCount, b.winnerSlots);
        }
    }
}
