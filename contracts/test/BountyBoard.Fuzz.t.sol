// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BountyBoardTestBase} from "./BountyBoard.Base.t.sol";
import {BountyBoard} from "../BountyBoard.sol";

contract BountyBoardFuzzTest is BountyBoardTestBase {

    // ----------------------------------------------------------------
    // testFuzz_CreateBounty_AnyValidInputsSucceed
    // ----------------------------------------------------------------
    /// @dev Any non-empty title, non-zero reward, and future deadline
    ///      must result in a bounty stored correctly.
    function testFuzz_CreateBounty_AnyValidInputsSucceed(
        uint256 reward,
        uint256 deadlineOffset
    ) public {
        // constrain inputs
        reward         = bound(reward, 1, type(uint128).max);
        deadlineOffset = bound(deadlineOffset, 1, 365 days);
        uint256 dl = block.timestamp + deadlineOffset;

        usdc.mint(creator, reward);

        vm.prank(creator);
        uint256 id = board.createBounty("t", "h", reward, dl);

        BountyBoard.Bounty memory b = board.getBounty(id);
        assertEq(b.reward,   reward);
        assertEq(b.deadline, dl);
        assertEq(uint8(b.status), uint8(BountyBoard.BountyStatus.Open));
    }

    // ----------------------------------------------------------------
    // testFuzz_FundBounty_ExactBalanceTransferred
    // ----------------------------------------------------------------
    /// @dev Whatever reward amount is set, funding transfers that exact
    ///      amount from creator to the board.
    function testFuzz_FundBounty_ExactBalanceTransferred(uint256 reward) public {
        reward = bound(reward, 1, type(uint128).max);

        // mint what the creator needs
        usdc.mint(creator, reward);

        vm.prank(creator);
        uint256 id = board.createBounty("t", "h", reward, block.timestamp + 1 days);

        uint256 creatorBefore = usdc.balanceOf(creator);
        uint256 boardBefore   = usdc.balanceOf(address(board));

        vm.startPrank(creator);
        usdc.approve(address(board), reward);
        board.fundBounty(id);
        vm.stopPrank();

        assertEq(usdc.balanceOf(creator),       creatorBefore - reward);
        assertEq(usdc.balanceOf(address(board)), boardBefore   + reward);
    }

    // ----------------------------------------------------------------
    // testFuzz_ClaimReward_ExactAmountReceived
    // ----------------------------------------------------------------
    /// @dev After the full flow, the approved contributor receives
    ///      exactly the reward amount — no rounding, no fee leakage.
    function testFuzz_ClaimReward_ExactAmountReceived(uint256 reward) public {
        reward = bound(reward, 1, type(uint128).max);

        usdc.mint(creator, reward);

        // create + fund
        vm.prank(creator);
        uint256 id = board.createBounty("t", "h", reward, deadline);

        vm.startPrank(creator);
        usdc.approve(address(board), reward);
        board.fundBounty(id);
        vm.stopPrank();

        // submit + approve + claim
        vm.prank(alice);
        board.submitWork(id, SUBMISSION_HASH);

        vm.prank(creator);
        board.approveBounty(id, alice);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        board.claimReward(id);

        assertEq(usdc.balanceOf(alice), aliceBefore + reward);
        // board must be fully drained for that bounty
        assertEq(usdc.balanceOf(address(board)), 0);
    }

    // ----------------------------------------------------------------
    // testFuzz_RefundBounty_ExactAmountReturned
    // ----------------------------------------------------------------
    /// @dev After deadline passes, creator gets back the exact reward.
    function testFuzz_RefundBounty_ExactAmountReturned(uint256 reward) public {
        reward = bound(reward, 1, type(uint128).max);

        usdc.mint(creator, reward);

        vm.prank(creator);
        uint256 id = board.createBounty("t", "h", reward, deadline);

        vm.startPrank(creator);
        usdc.approve(address(board), reward);
        board.fundBounty(id);
        vm.stopPrank();

        uint256 creatorBefore = usdc.balanceOf(creator);
        vm.warp(deadline + 1);
        vm.prank(creator);
        board.refundBounty(id);

        assertEq(usdc.balanceOf(creator),       creatorBefore + reward);
        assertEq(usdc.balanceOf(address(board)), 0);
    }

    // ----------------------------------------------------------------
    // testFuzz_CreateBounty_Revert_DeadlineNotFuture
    // ----------------------------------------------------------------
    /// @dev Any deadline ≤ block.timestamp must revert with InvalidDeadline.
    function testFuzz_CreateBounty_Revert_DeadlineNotFuture(uint256 pastTs) public {
        pastTs = bound(pastTs, 0, block.timestamp);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidDeadline.selector);
        board.createBounty("t", "h", 1e6, pastTs);
    }

    // ----------------------------------------------------------------
    // testFuzz_RefundAfterApproval_GracePeriodBoundary
    // ----------------------------------------------------------------
    /// @dev Refund must succeed only when block.timestamp > deadline + 7 days.
    function testFuzz_RefundAfterApproval_GracePeriodBoundary(uint256 warpOffset) public {
        // create, fund, submit, approve at block.timestamp = 1_700_000_000
        uint256 id = _createFundSubmitApprove();

        // split the fuzz domain: half below boundary, half above
        uint256 boundary = deadline + CLAIM_GRACE; // inclusive revert boundary

        if (warpOffset % 2 == 0) {
            // warp to a time that should still revert
            uint256 warpTo = bound(warpOffset, block.timestamp, boundary);
            vm.warp(warpTo);
            vm.prank(creator);
            vm.expectRevert(BountyBoard.GracePeriodNotOver.selector);
            board.refundAfterApproval(id);
        } else {
            // warp to a time after the boundary — must succeed
            uint256 warpTo = bound(warpOffset, boundary + 1, boundary + 365 days);
            vm.warp(warpTo);
            vm.prank(creator);
            board.refundAfterApproval(id); // must not revert
            assertEq(
                uint8(board.getBounty(id).status),
                uint8(BountyBoard.BountyStatus.Refunded)
            );
        }
    }

    // ----------------------------------------------------------------
    // testFuzz_MultipleBounties_CountMonotonicallyIncreases
    // ----------------------------------------------------------------
    /// @dev getBountyCount must equal the number of successful creates.
    function testFuzz_MultipleBounties_CountMonotonicallyIncreases(uint8 n) public {
        n = uint8(bound(uint256(n), 1, 20));
        for (uint256 i = 0; i < n; i++) {
            vm.prank(creator);
            board.createBounty("t", "h", 1e6, block.timestamp + 1 days);
        }
        assertEq(board.getBountyCount(), n);
    }
}
