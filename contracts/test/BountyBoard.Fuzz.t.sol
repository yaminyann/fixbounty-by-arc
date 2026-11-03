// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BountyBoardTestBase} from "./BountyBoard.Base.t.sol";
import {BountyBoard} from "../BountyBoard.sol";

contract BountyBoardFuzzTest is BountyBoardTestBase {
    /// @dev Builds a valid non-increasing share list of `n` positions summing to 10_000.
    function _equalShares(uint256 n) internal pure returns (uint16[] memory s) {
        s = new uint16[](n);
        uint256 base = 10_000 / n;
        uint256 rem = 10_000 - base * n;
        for (uint256 i; i < n; ++i) {
            s[i] = uint16(base + (i < rem ? 1 : 0));
        }
    }

    /// @dev Payouts always add up to the reward, whatever the amount and position count.
    function testFuzz_payoutsSumToReward(uint256 reward, uint8 slotsSeed) public {
        uint256 n = bound(slotsSeed, 1, 10);
        reward = bound(reward, 10_000, 1_000_000_000e6);

        vm.prank(creator);
        uint256 id = board.createBounty(TITLE, CONTENT_HASH, reward, deadline, _equalShares(n));
        (uint16[] memory shares, uint256[] memory payouts) = board.getPrizeStructure(id);

        uint256 totalShares;
        uint256 totalPayout;
        for (uint256 i; i < n; ++i) {
            totalShares += shares[i];
            totalPayout += payouts[i];
            assertGt(payouts[i], 0);
        }
        assertEq(totalShares, 10_000);
        assertEq(totalPayout, reward);
        if (n > 1) assertGe(payouts[0], payouts[1]);
    }

    /// @dev Funding moves exactly reward + floor(reward * 0.5%) out of the creator.
    function testFuzz_fundingChargesExactPostFee(uint256 reward) public {
        reward = bound(reward, 1, 1_000_000e6);
        usdc.mint(creator, reward * 2);

        vm.prank(creator);
        uint256 id = board.createBounty(TITLE, CONTENT_HASH, reward, deadline, _single());

        (uint256 fee, uint256 total) = board.previewFunding(reward);
        assertEq(fee, (reward * 50) / 10_000);
        assertEq(total, reward + fee);

        uint256 before = usdc.balanceOf(creator);
        vm.startPrank(creator);
        usdc.approve(address(board), total);
        board.fundBounty(id);
        vm.stopPrank();

        assertEq(before - usdc.balanceOf(creator), total);
        assertEq(usdc.balanceOf(address(board)), reward);
        assertEq(usdc.balanceOf(treasury), fee);
    }

    /// @dev Every winner receives gross - 5% and the treasury receives the 5%; nothing is left behind.
    function testFuzz_claimsConserveFunds(uint256 reward, uint8 slotsSeed, uint8 winnersSeed) public {
        uint256 slots = bound(slotsSeed, 1, 5);
        uint256 winnersN = bound(winnersSeed, 1, slots);
        reward = bound(reward, 10_000, 1_000_000e6);
        usdc.mint(creator, reward * 2);

        vm.prank(creator);
        uint256 id = board.createBounty(TITLE, CONTENT_HASH, reward, deadline, _equalShares(slots));
        (, uint256 total) = board.previewFunding(reward);
        vm.startPrank(creator);
        usdc.approve(address(board), total);
        board.fundBounty(id);
        vm.stopPrank();

        address[] memory winners = new address[](winnersN);
        for (uint256 i; i < winnersN; ++i) {
            winners[i] = address(uint160(0x1000 + i));
            _submit(id, winners[i]);
        }
        _approve(id, winners);

        (, uint256[] memory payouts) = board.getPrizeStructure(id);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 feeTotal;
        for (uint256 i; i < winnersN; ++i) {
            uint256 fee = (payouts[i] * 500) / 10_000;
            vm.prank(winners[i]);
            board.claimReward(id);
            assertEq(usdc.balanceOf(winners[i]), payouts[i] - fee);
            feeTotal += fee;
        }

        assertEq(usdc.balanceOf(address(board)), 0);
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoard.BountyStatus.Claimed));
        assertEq(usdc.balanceOf(treasury), treasuryBefore + feeTotal);
    }

    /// @dev Deadline gates: submissions only through the deadline, refunds only after it.
    function testFuzz_deadlineGates(uint256 warpBy) public {
        warpBy = bound(warpBy, 0, 60 days);
        uint256 id = _createAndFundBounty();
        vm.warp(block.timestamp + warpBy);
        bool late = block.timestamp > deadline;

        vm.prank(alice);
        if (late) vm.expectRevert(BountyBoard.DeadlinePassed.selector);
        board.submitWork(id, SUBMISSION_HASH);

        // A late submitter never got in, so a refund after the deadline is immediate.
        vm.prank(creator);
        if (!late) vm.expectRevert(BountyBoard.DeadlineNotPassed.selector);
        board.refundBounty(id);
    }

    /// @dev The claim window is always measured from approval, never from the deadline.
    function testFuzz_graceMeasuredFromApproval(uint256 approveDelay, uint256 waitAfter) public {
        approveDelay = bound(approveDelay, 0, 90 days);
        waitAfter = bound(waitAfter, 0, 14 days);

        uint256 id = _createAndFundBounty();
        _submit(id, alice);
        vm.warp(block.timestamp + approveDelay);
        _approve(id, _addrs(alice));
        uint256 approvedAt = block.timestamp;

        vm.warp(approvedAt + waitAfter);
        vm.prank(creator);
        if (waitAfter <= CLAIM_GRACE) {
            vm.expectRevert(BountyBoard.GracePeriodNotOver.selector);
        }
        board.refundAfterApproval(id);
    }

    /// @dev Strangers can never move funds.
    function testFuzz_strangersCannotAct(address caller) public {
        vm.assume(caller != creator && caller != alice && caller != address(0));
        uint256 id = _approvedSingle();
        vm.startPrank(caller);
        vm.expectRevert(BountyBoard.NotWinner.selector);
        board.claimReward(id);
        vm.expectRevert(BountyBoard.NotCreator.selector);
        board.refundAfterApproval(id);
        vm.expectRevert(BountyBoard.NotCreator.selector);
        board.approveWinners(id, _addrs(alice));
        vm.stopPrank();
    }
}
