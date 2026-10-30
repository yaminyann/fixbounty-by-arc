// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BountyBoardV2TestBase} from "./BountyBoardV2.Base.t.sol";
import {BountyBoardV2} from "../BountyBoardV2.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract BountyBoardV2UnitTest is BountyBoardV2TestBase {

    // =============================================================
    //              1. Deployment & initialisation
    // =============================================================

    function test_Constructor_SetsState() public view {
        assertEq(address(board.usdc()), address(usdc));
        assertEq(board.feeBps(), FEE_BPS);
        assertEq(board.treasury(), treasury);
        assertEq(board.owner(), owner);
    }

    function test_Constructor_RevertsOnZeroUsdc() public {
        vm.expectRevert(BountyBoardV2.ZeroAddress.selector);
        new BountyBoardV2(address(0), owner, FEE_BPS, treasury);
    }

    function test_Constructor_RevertsOnZeroOwner() public {
        // OZ's Ownable base reverts with OwnableInvalidOwner before our ZeroAddress
        // check can fire, so we match the OZ error.
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new BountyBoardV2(address(usdc), address(0), FEE_BPS, treasury);
    }

    function test_Constructor_RevertsOnZeroTreasury() public {
        vm.expectRevert(BountyBoardV2.ZeroAddress.selector);
        new BountyBoardV2(address(usdc), owner, FEE_BPS, address(0));
    }

    function test_Constructor_RevertsOnFeeTooHigh() public {
        vm.expectRevert(BountyBoardV2.FeeTooHigh.selector);
        new BountyBoardV2(address(usdc), owner, MAX_FEE_BPS + 1, treasury);
    }

    function test_Constructor_AcceptsZeroFee() public {
        BountyBoardV2 b = new BountyBoardV2(address(usdc), owner, 0, treasury);
        assertEq(b.feeBps(), 0);
    }

    function test_Constructor_AcceptsMaxFee() public {
        BountyBoardV2 b = new BountyBoardV2(address(usdc), owner, MAX_FEE_BPS, treasury);
        assertEq(b.feeBps(), MAX_FEE_BPS);
    }

    // =============================================================
    //              2. setFeeBps
    // =============================================================

    function test_SetFeeBps_HappyPath() public {
        vm.prank(owner);
        vm.expectEmit(true, true, false, false, address(board));
        emit BountyBoardV2.FeeBpsUpdated(FEE_BPS, 500);
        board.setFeeBps(500);
        assertEq(board.feeBps(), 500);
    }

    function test_SetFeeBps_ToZero() public {
        vm.prank(owner);
        board.setFeeBps(0);
        assertEq(board.feeBps(), 0);
    }

    function test_SetFeeBps_ToMaxFee() public {
        vm.prank(owner);
        board.setFeeBps(MAX_FEE_BPS);
        assertEq(board.feeBps(), MAX_FEE_BPS);
    }

    function test_SetFeeBps_RevertsIfTooHigh() public {
        vm.prank(owner);
        vm.expectRevert(BountyBoardV2.FeeTooHigh.selector);
        board.setFeeBps(MAX_FEE_BPS + 1);
    }

    function test_SetFeeBps_RevertsIfNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        board.setFeeBps(100);
    }

    // =============================================================
    //              3. setTreasury
    // =============================================================

    address internal newTreasury = makeAddr("newTreasury");

    function test_SetTreasury_HappyPath() public {
        vm.prank(owner);
        vm.expectEmit(true, true, false, false, address(board));
        emit BountyBoardV2.TreasuryUpdated(treasury, newTreasury);
        board.setTreasury(newTreasury);
        assertEq(board.treasury(), newTreasury);
    }

    function test_SetTreasury_RevertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(BountyBoardV2.ZeroAddress.selector);
        board.setTreasury(address(0));
    }

    function test_SetTreasury_RevertsIfNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        board.setTreasury(newTreasury);
    }

    // =============================================================
    //              4. createBounty
    // =============================================================

    function test_CreateBounty_HappyPath() public {
        vm.prank(creator);
        vm.expectEmit(true, true, false, true, address(board));
        emit BountyBoardV2.BountyCreated(1, creator, REWARD, deadline);
        uint256 id = board.createBounty(TITLE, CONTENT_HASH, REWARD, deadline);
        assertEq(id, 1);
        BountyBoardV2.Bounty memory b = board.getBounty(id);
        assertEq(b.creator, creator);
        assertEq(b.reward, REWARD);
        assertEq(b.deadline, deadline);
        assertEq(uint8(b.status), uint8(BountyBoardV2.BountyStatus.Open));
    }

    function test_CreateBounty_RevertsOnEmptyTitle() public {
        vm.prank(creator);
        vm.expectRevert(BountyBoardV2.EmptyTitle.selector);
        board.createBounty("", CONTENT_HASH, REWARD, deadline);
    }

    function test_CreateBounty_RevertsOnZeroReward() public {
        vm.prank(creator);
        vm.expectRevert(BountyBoardV2.ZeroReward.selector);
        board.createBounty(TITLE, CONTENT_HASH, 0, deadline);
    }

    function test_CreateBounty_RevertsOnInvalidDeadline() public {
        vm.prank(creator);
        vm.expectRevert(BountyBoardV2.InvalidDeadline.selector);
        board.createBounty(TITLE, CONTENT_HASH, REWARD, block.timestamp);
    }

    // =============================================================
    //              5. fundBounty
    // =============================================================

    function test_FundBounty_HappyPath() public {
        uint256 id = _createBounty();
        uint256 creatorBefore = usdc.balanceOf(creator);

        vm.startPrank(creator);
        usdc.approve(address(board), REWARD);
        vm.expectEmit(true, true, false, true, address(board));
        emit BountyBoardV2.BountyFunded(id, creator, REWARD);
        board.fundBounty(id);
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(board)), REWARD);
        assertEq(usdc.balanceOf(creator), creatorBefore - REWARD);
        BountyBoardV2.Bounty memory b = board.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyBoardV2.BountyStatus.Funded));
    }

    function test_FundBounty_SnapshotsFeeAndTreasury() public {
        uint256 id = _createBounty();
        vm.startPrank(creator);
        usdc.approve(address(board), REWARD);
        board.fundBounty(id);
        vm.stopPrank();

        assertEq(board.getFeeForBounty(id), FEE_BPS);
        assertEq(board.getTreasuryForBounty(id), treasury);
    }

    function test_FundBounty_RevertsIfNotCreator() public {
        uint256 id = _createBounty();
        vm.prank(stranger);
        vm.expectRevert(BountyBoardV2.NotCreator.selector);
        board.fundBounty(id);
    }

    function test_FundBounty_RevertsIfAlreadyFunded() public {
        uint256 id = _createAndFundBounty();
        vm.startPrank(creator);
        usdc.approve(address(board), REWARD);
        vm.expectRevert(BountyBoardV2.InvalidStatus.selector);
        board.fundBounty(id);
        vm.stopPrank();
    }

    function test_FundBounty_RevertsOnBountyNotFound() public {
        vm.expectRevert(BountyBoardV2.BountyNotFound.selector);
        board.fundBounty(999);
    }

    // =============================================================
    //              6. submitWork
    // =============================================================

    function test_SubmitWork_HappyPath() public {
        uint256 id = _createAndFundBounty();
        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(board));
        emit BountyBoardV2.WorkSubmitted(id, alice, SUBMISSION_HASH);
        board.submitWork(id, SUBMISSION_HASH);

        (, bool exists) = board.getSubmission(id, alice);
        assertTrue(exists);
    }

    function test_SubmitWork_RevertsSelfSubmission() public {
        uint256 id = _createAndFundBounty();
        vm.prank(creator);
        vm.expectRevert(BountyBoardV2.SelfSubmission.selector);
        board.submitWork(id, SUBMISSION_HASH);
    }

    function test_SubmitWork_RevertsAlreadySubmitted() public {
        uint256 id = _createFundSubmit();
        vm.prank(alice);
        vm.expectRevert(BountyBoardV2.AlreadySubmitted.selector);
        board.submitWork(id, SUBMISSION_HASH);
    }

    function test_SubmitWork_RevertsAfterDeadline() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(BountyBoardV2.DeadlinePassed.selector);
        board.submitWork(id, SUBMISSION_HASH);
    }

    function test_SubmitWork_RevertsEmptyHash() public {
        uint256 id = _createAndFundBounty();
        vm.prank(alice);
        vm.expectRevert(BountyBoardV2.EmptySubmissionHash.selector);
        board.submitWork(id, "");
    }

    function test_SubmitWork_RevertsIfNotFunded() public {
        uint256 id = _createBounty();
        vm.prank(alice);
        vm.expectRevert(BountyBoardV2.InvalidStatus.selector);
        board.submitWork(id, SUBMISSION_HASH);
    }

    // =============================================================
    //              7. approveBounty
    // =============================================================

    function test_ApproveBounty_HappyPath() public {
        uint256 id = _createFundSubmit();
        vm.prank(creator);
        vm.expectEmit(true, true, false, false, address(board));
        emit BountyBoardV2.BountyApproved(id, alice);
        board.approveBounty(id, alice);

        BountyBoardV2.Bounty memory b = board.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyBoardV2.BountyStatus.Approved));
        assertEq(b.approvedContributor, alice);
    }

    function test_ApproveBounty_RevertsIfNotCreator() public {
        uint256 id = _createFundSubmit();
        vm.prank(stranger);
        vm.expectRevert(BountyBoardV2.NotCreator.selector);
        board.approveBounty(id, alice);
    }

    function test_ApproveBounty_RevertsNoSubmission() public {
        uint256 id = _createAndFundBounty();
        vm.prank(creator);
        vm.expectRevert(BountyBoardV2.NoSubmission.selector);
        board.approveBounty(id, alice);
    }

    function test_ApproveBounty_RevertsZeroContributor() public {
        uint256 id = _createFundSubmit();
        vm.prank(creator);
        vm.expectRevert(BountyBoardV2.ZeroAddress.selector);
        board.approveBounty(id, address(0));
    }

    // =============================================================
    //              8. claimReward — happy paths
    // =============================================================

    function test_ClaimReward_HappyPathWithFee() public {
        uint256 id = _createFundSubmitApprove();

        uint256 expectedFee       = (REWARD * FEE_BPS) / 10_000;
        uint256 expectedPayout    = REWARD - expectedFee;
        uint256 aliceBefore       = usdc.balanceOf(alice);
        uint256 treasuryBefore    = usdc.balanceOf(treasury);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(board));
        emit BountyBoardV2.RewardClaimed(id, alice, expectedPayout, expectedFee);
        board.claimReward(id);

        assertEq(usdc.balanceOf(alice),    aliceBefore    + expectedPayout, "contributor payout");
        assertEq(usdc.balanceOf(treasury), treasuryBefore + expectedFee,    "treasury fee");
        assertEq(usdc.balanceOf(address(board)), 0,                         "board drained");
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoardV2.BountyStatus.Claimed));
    }

    function test_ClaimReward_HappyPathZeroFee() public {
        // deploy a board with 0% fee
        BountyBoardV2 zeroFeeBoard = new BountyBoardV2(address(usdc), owner, 0, treasury);

        vm.prank(creator);
        uint256 id = zeroFeeBoard.createBounty(TITLE, CONTENT_HASH, REWARD, deadline);

        vm.startPrank(creator);
        usdc.approve(address(zeroFeeBoard), REWARD);
        zeroFeeBoard.fundBounty(id);
        vm.stopPrank();

        vm.prank(alice);
        zeroFeeBoard.submitWork(id, SUBMISSION_HASH);

        vm.prank(creator);
        zeroFeeBoard.approveBounty(id, alice);

        uint256 aliceBefore    = usdc.balanceOf(alice);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(zeroFeeBoard));
        emit BountyBoardV2.RewardClaimed(id, alice, REWARD, 0);
        zeroFeeBoard.claimReward(id);

        assertEq(usdc.balanceOf(alice),    aliceBefore + REWARD, "contributor gets full reward");
        assertEq(usdc.balanceOf(treasury), treasuryBefore,       "treasury unchanged with 0 fee");
    }

    function test_ClaimReward_RevertsIfNotApprovedContributor() public {
        uint256 id = _createFundSubmitApprove();
        vm.prank(stranger);
        vm.expectRevert(BountyBoardV2.NotApprovedContributor.selector);
        board.claimReward(id);
    }

    function test_ClaimReward_RevertsIfNotApproved() public {
        uint256 id = _createFundSubmit();
        vm.prank(alice);
        vm.expectRevert(BountyBoardV2.InvalidStatus.selector);
        board.claimReward(id);
    }

    // =============================================================
    //              9. Fee snapshot isolation
    // =============================================================

    function test_FeeSnapshot_OldBountyUsesOldFee() public {
        // Fund bounty at FEE_BPS=200 (2%)
        uint256 id = _createFundSubmitApprove();

        // Owner changes fee to 500 bps AFTER funding
        vm.prank(owner);
        board.setFeeBps(500);

        // Snapshot for the old bounty must still be 200
        assertEq(board.getFeeForBounty(id), FEE_BPS);

        uint256 expectedFee    = (REWARD * FEE_BPS) / 10_000;
        uint256 expectedPayout = REWARD - expectedFee;

        uint256 aliceBefore    = usdc.balanceOf(alice);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(alice);
        board.claimReward(id);

        assertEq(usdc.balanceOf(alice),    aliceBefore    + expectedPayout, "payout uses old fee");
        assertEq(usdc.balanceOf(treasury), treasuryBefore + expectedFee,    "fee uses old bps");
    }

    function test_FeeSnapshot_NewBountyUsesNewFee() public {
        // Change fee before funding
        vm.prank(owner);
        board.setFeeBps(500);

        // Create + fund after the change
        uint256 id = _createAndFundBounty();
        assertEq(board.getFeeForBounty(id), 500);
    }

    // =============================================================
    //              10. Treasury snapshot isolation
    // =============================================================

    address internal altTreasury = makeAddr("altTreasury");

    function test_TreasurySnapshot_OldBountyUsesOldTreasury() public {
        uint256 id = _createFundSubmitApprove();

        // Change treasury after bounty is funded
        vm.prank(owner);
        board.setTreasury(altTreasury);

        assertEq(board.getTreasuryForBounty(id), treasury, "snapshot unchanged");

        uint256 oldTreasuryBefore = usdc.balanceOf(treasury);
        uint256 altTreasuryBefore = usdc.balanceOf(altTreasury);

        vm.prank(alice);
        board.claimReward(id);

        uint256 expectedFee = (REWARD * FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(treasury),    oldTreasuryBefore + expectedFee, "old treasury received fee");
        assertEq(usdc.balanceOf(altTreasury), altTreasuryBefore,               "alt treasury untouched");
    }

    function test_TreasurySnapshot_NewBountyUsesNewTreasury() public {
        vm.prank(owner);
        board.setTreasury(altTreasury);

        uint256 id = _createAndFundBounty();
        assertEq(board.getTreasuryForBounty(id), altTreasury);
    }

    // =============================================================
    //              11. refundBounty
    // =============================================================

    function test_RefundBounty_HappyPath_ReturnsFullReward() public {
        uint256 id = _createAndFundBounty();
        uint256 creatorBefore = usdc.balanceOf(creator);

        vm.warp(deadline + 1);
        vm.prank(creator);
        vm.expectEmit(true, true, false, true, address(board));
        emit BountyBoardV2.BountyRefunded(id, creator, REWARD);
        board.refundBounty(id);

        // Full reward returned — no fee on refund
        assertEq(usdc.balanceOf(creator),       creatorBefore + REWARD, "full reward returned");
        assertEq(usdc.balanceOf(treasury),       0,                     "treasury unchanged");
        assertEq(usdc.balanceOf(address(board)), 0,                     "board drained");
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoardV2.BountyStatus.Refunded));
    }

    function test_RefundBounty_RevertsBeforeDeadline() public {
        uint256 id = _createAndFundBounty();
        vm.prank(creator);
        vm.expectRevert(BountyBoardV2.DeadlineNotPassed.selector);
        board.refundBounty(id);
    }

    function test_RefundBounty_RevertsIfNotCreator() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline + 1);
        vm.prank(stranger);
        vm.expectRevert(BountyBoardV2.NotCreator.selector);
        board.refundBounty(id);
    }

    function test_RefundBounty_RevertsIfNotFunded() public {
        uint256 id = _createBounty();
        vm.warp(deadline + 1);
        vm.prank(creator);
        vm.expectRevert(BountyBoardV2.InvalidStatus.selector);
        board.refundBounty(id);
    }

    // =============================================================
    //              12. refundAfterApproval
    // =============================================================

    function test_RefundAfterApproval_HappyPath_ReturnsFullReward() public {
        uint256 id = _createFundSubmitApprove();
        uint256 creatorBefore = usdc.balanceOf(creator);

        // Warp past deadline + grace period
        vm.warp(deadline + CLAIM_GRACE + 1);
        vm.prank(creator);
        vm.expectEmit(true, true, false, true, address(board));
        emit BountyBoardV2.BountyRefunded(id, creator, REWARD);
        board.refundAfterApproval(id);

        assertEq(usdc.balanceOf(creator),       creatorBefore + REWARD, "full reward returned");
        assertEq(usdc.balanceOf(treasury),       0,                     "no fee on refund");
        assertEq(usdc.balanceOf(address(board)), 0,                     "board drained");
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoardV2.BountyStatus.Refunded));
    }

    function test_RefundAfterApproval_RevertsIfGracePeriodNotOver() public {
        uint256 id = _createFundSubmitApprove();
        vm.warp(deadline + CLAIM_GRACE);
        vm.prank(creator);
        vm.expectRevert(BountyBoardV2.GracePeriodNotOver.selector);
        board.refundAfterApproval(id);
    }

    function test_RefundAfterApproval_RevertsIfNotCreator() public {
        uint256 id = _createFundSubmitApprove();
        vm.warp(deadline + CLAIM_GRACE + 1);
        vm.prank(stranger);
        vm.expectRevert(BountyBoardV2.NotCreator.selector);
        board.refundAfterApproval(id);
    }

    function test_RefundAfterApproval_RevertsIfNotApproved() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline + CLAIM_GRACE + 1);
        vm.prank(creator);
        vm.expectRevert(BountyBoardV2.InvalidStatus.selector);
        board.refundAfterApproval(id);
    }

    // =============================================================
    //              13. cancelBounty
    // =============================================================

    function test_CancelBounty_HappyPath() public {
        uint256 id = _createBounty();
        vm.prank(creator);
        vm.expectEmit(true, true, false, false, address(board));
        emit BountyBoardV2.BountyCancelled(id, creator);
        board.cancelBounty(id);
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoardV2.BountyStatus.Cancelled));
    }

    function test_CancelBounty_RevertsIfNotCreator() public {
        uint256 id = _createBounty();
        vm.prank(stranger);
        vm.expectRevert(BountyBoardV2.NotCreator.selector);
        board.cancelBounty(id);
    }

    function test_CancelBounty_RevertsIfNotOpen() public {
        uint256 id = _createAndFundBounty();
        vm.prank(creator);
        vm.expectRevert(BountyBoardV2.InvalidStatus.selector);
        board.cancelBounty(id);
    }

    // =============================================================
    //              14. View helpers
    // =============================================================

    function test_GetBountyCount() public {
        assertEq(board.getBountyCount(), 0);
        _createBounty();
        assertEq(board.getBountyCount(), 1);
        _createBounty();
        assertEq(board.getBountyCount(), 2);
    }

    function test_GetBounty_RevertsOnNotFound() public {
        vm.expectRevert(BountyBoardV2.BountyNotFound.selector);
        board.getBounty(999);
    }

    function test_HasSubmitted_TrueAfterSubmit() public {
        uint256 id = _createFundSubmit();
        assertTrue(board.hasSubmitted(id, alice));
    }

    function test_HasSubmitted_FalseBeforeSubmit() public {
        uint256 id = _createAndFundBounty();
        assertFalse(board.hasSubmitted(id, alice));
    }

    function test_PreviewFee_MatchesClaimRewardMath() public view {
        (uint256 feeAmount, uint256 contributorPayout) = board.previewFee(REWARD);
        uint256 expectedFee = (REWARD * FEE_BPS) / 10_000;
        assertEq(feeAmount,        expectedFee,          "fee");
        assertEq(contributorPayout, REWARD - expectedFee, "payout");
    }

    function test_PreviewFee_ZeroReward() public view {
        (uint256 feeAmount, uint256 contributorPayout) = board.previewFee(0);
        assertEq(feeAmount,        0, "fee zero");
        assertEq(contributorPayout, 0, "payout zero");
    }

    function test_GetFeeForBounty_RevertsOnNotFound() public {
        vm.expectRevert(BountyBoardV2.BountyNotFound.selector);
        board.getFeeForBounty(999);
    }

    function test_GetTreasuryForBounty_RevertsOnNotFound() public {
        vm.expectRevert(BountyBoardV2.BountyNotFound.selector);
        board.getTreasuryForBounty(999);
    }

    // =============================================================
    //              15. Ownable2Step transfer
    // =============================================================

    function test_Ownable2Step_PendingOwner() public {
        vm.prank(owner);
        board.transferOwnership(alice);
        assertEq(board.pendingOwner(), alice);
        // ownership not transferred yet
        assertEq(board.owner(), owner);
    }

    function test_Ownable2Step_AcceptOwnership() public {
        vm.prank(owner);
        board.transferOwnership(alice);
        vm.prank(alice);
        board.acceptOwnership();
        assertEq(board.owner(), alice);
    }
}
