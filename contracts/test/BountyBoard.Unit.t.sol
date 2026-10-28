// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BountyBoardTestBase} from "./BountyBoard.Base.t.sol";
import {BountyBoard} from "../BountyBoard.sol";

contract BountyBoardUnitTest is BountyBoardTestBase {

    // =================================================================
    // Constructor
    // =================================================================

    function test_Deploy_SetsUsdcAddress() public view {
        assertEq(address(board.usdc()), address(usdc));
    }

    function test_Deploy_ZeroAddressReverts() public {
        vm.expectRevert(BountyBoard.ZeroAddress.selector);
        new BountyBoard(address(0));
    }

    function test_Deploy_InitialBountyCountIsZero() public view {
        assertEq(board.getBountyCount(), 0);
    }

    // =================================================================
    // createBounty — happy path
    // =================================================================

    function test_CreateBounty_ReturnsId1() public {
        uint256 id = _createBounty();
        assertEq(id, 1);
    }

    function test_CreateBounty_StoresCorrectFields() public {
        uint256 id = _createBounty();
        BountyBoard.Bounty memory b = board.getBounty(id);
        assertEq(b.id,       id);
        assertEq(b.creator,  creator);
        assertEq(b.title,    TITLE);
        assertEq(b.reward,   REWARD);
        assertEq(b.deadline, deadline);
        assertEq(uint8(b.status), uint8(BountyBoard.BountyStatus.Open));
        assertEq(b.approvedContributor, address(0));
        assertEq(b.fundedAt, 0);
    }

    function test_CreateBounty_IncrementsBountyCount() public {
        _createBounty();
        assertEq(board.getBountyCount(), 1);
        _createBounty();
        assertEq(board.getBountyCount(), 2);
    }

    function test_CreateBounty_EmitsBountyCreated() public {
        vm.expectEmit(true, true, false, true, address(board));
        emit BountyBoard.BountyCreated(1, creator, REWARD, deadline);
        vm.prank(creator);
        board.createBounty(TITLE, CONTENT_HASH, REWARD, deadline);
    }

    // createBounty — reverts
    function test_CreateBounty_Revert_EmptyTitle() public {
        vm.prank(creator);
        vm.expectRevert(BountyBoard.EmptyTitle.selector);
        board.createBounty("", CONTENT_HASH, REWARD, deadline);
    }

    function test_CreateBounty_Revert_ZeroReward() public {
        vm.prank(creator);
        vm.expectRevert(BountyBoard.ZeroReward.selector);
        board.createBounty(TITLE, CONTENT_HASH, 0, deadline);
    }

    function test_CreateBounty_Revert_DeadlineInPast() public {
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidDeadline.selector);
        board.createBounty(TITLE, CONTENT_HASH, REWARD, block.timestamp);
    }

    function test_CreateBounty_Revert_DeadlineEqualsTimestamp() public {
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidDeadline.selector);
        board.createBounty(TITLE, CONTENT_HASH, REWARD, block.timestamp - 1);
    }

    // =================================================================
    // fundBounty — happy path
    // =================================================================

    function test_FundBounty_StatusBecomeFunded() public {
        uint256 id = _createAndFundBounty();
        BountyBoard.Bounty memory b = board.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyBoard.BountyStatus.Funded));
    }

    function test_FundBounty_TransfersUsdcToBoard() public {
        uint256 creatorBefore = usdc.balanceOf(creator);
        uint256 boardBefore   = usdc.balanceOf(address(board));

        uint256 id = _createAndFundBounty();

        assertEq(usdc.balanceOf(creator),       creatorBefore - REWARD);
        assertEq(usdc.balanceOf(address(board)), boardBefore   + REWARD);

        (id); // silence unused var
    }

    function test_FundBounty_SetsFundedAt() public {
        uint256 id = _createAndFundBounty();
        BountyBoard.Bounty memory b = board.getBounty(id);
        assertEq(b.fundedAt, block.timestamp);
    }

    function test_FundBounty_EmitsBountyFunded() public {
        uint256 id = _createBounty();
        vm.startPrank(creator);
        usdc.approve(address(board), REWARD);
        vm.expectEmit(true, true, false, true, address(board));
        emit BountyBoard.BountyFunded(id, creator, REWARD);
        board.fundBounty(id);
        vm.stopPrank();
    }

    // fundBounty — reverts
    function test_FundBounty_Revert_NotCreator() public {
        uint256 id = _createBounty();
        vm.prank(stranger);
        vm.expectRevert(BountyBoard.NotCreator.selector);
        board.fundBounty(id);
    }

    function test_FundBounty_Revert_InvalidStatus_AlreadyFunded() public {
        uint256 id = _createAndFundBounty();
        vm.startPrank(creator);
        usdc.approve(address(board), REWARD);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.fundBounty(id);
        vm.stopPrank();
    }

    function test_FundBounty_Revert_BountyNotFound() public {
        vm.prank(creator);
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.fundBounty(999);
    }

    // =================================================================
    // submitWork — happy path
    // =================================================================

    function test_SubmitWork_StoresSubmission() public {
        uint256 id = _createAndFundBounty();
        vm.prank(alice);
        board.submitWork(id, SUBMISSION_HASH);

        (string memory h, bool exists) = board.getSubmission(id, alice);
        assertTrue(exists);
        assertEq(h, SUBMISSION_HASH);
    }

    function test_SubmitWork_HasSubmittedReturnsTrue() public {
        uint256 id = _createFundSubmit();
        assertTrue(board.hasSubmitted(id, alice));
    }

    function test_SubmitWork_EmitsWorkSubmitted() public {
        uint256 id = _createAndFundBounty();
        vm.expectEmit(true, true, false, true, address(board));
        emit BountyBoard.WorkSubmitted(id, alice, SUBMISSION_HASH);
        vm.prank(alice);
        board.submitWork(id, SUBMISSION_HASH);
    }

    // submitWork — reverts
    function test_SubmitWork_Revert_NotFunded() public {
        uint256 id = _createBounty();
        vm.prank(alice);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.submitWork(id, SUBMISSION_HASH);
    }

    function test_SubmitWork_Revert_SelfSubmission() public {
        uint256 id = _createAndFundBounty();
        vm.prank(creator);
        vm.expectRevert(BountyBoard.SelfSubmission.selector);
        board.submitWork(id, SUBMISSION_HASH);
    }

    function test_SubmitWork_Revert_DeadlinePassed() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(BountyBoard.DeadlinePassed.selector);
        board.submitWork(id, SUBMISSION_HASH);
    }

    function test_SubmitWork_Revert_EmptySubmissionHash() public {
        uint256 id = _createAndFundBounty();
        vm.prank(alice);
        vm.expectRevert(BountyBoard.EmptySubmissionHash.selector);
        board.submitWork(id, "");
    }

    function test_SubmitWork_Revert_AlreadySubmitted() public {
        uint256 id = _createFundSubmit();
        vm.prank(alice);
        vm.expectRevert(BountyBoard.AlreadySubmitted.selector);
        board.submitWork(id, SUBMISSION_HASH);
    }

    // =================================================================
    // approveBounty — happy path
    // =================================================================

    function test_ApproveBounty_StatusBecomesApproved() public {
        uint256 id = _createFundSubmitApprove();
        BountyBoard.Bounty memory b = board.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyBoard.BountyStatus.Approved));
    }

    function test_ApproveBounty_SetsApprovedContributor() public {
        uint256 id = _createFundSubmitApprove();
        BountyBoard.Bounty memory b = board.getBounty(id);
        assertEq(b.approvedContributor, alice);
    }

    function test_ApproveBounty_EmitsBountyApproved() public {
        uint256 id = _createFundSubmit();
        vm.expectEmit(true, true, false, false, address(board));
        emit BountyBoard.BountyApproved(id, alice);
        vm.prank(creator);
        board.approveBounty(id, alice);
    }

    // approveBounty — reverts
    function test_ApproveBounty_Revert_NotCreator() public {
        uint256 id = _createFundSubmit();
        vm.prank(stranger);
        vm.expectRevert(BountyBoard.NotCreator.selector);
        board.approveBounty(id, alice);
    }

    function test_ApproveBounty_Revert_InvalidStatus_Open() public {
        uint256 id = _createBounty();
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.approveBounty(id, alice);
    }

    function test_ApproveBounty_Revert_ZeroAddress() public {
        uint256 id = _createFundSubmit();
        vm.prank(creator);
        vm.expectRevert(BountyBoard.ZeroAddress.selector);
        board.approveBounty(id, address(0));
    }

    function test_ApproveBounty_Revert_NoSubmission() public {
        uint256 id = _createAndFundBounty();
        // bob never submitted
        vm.prank(creator);
        vm.expectRevert(BountyBoard.NoSubmission.selector);
        board.approveBounty(id, bob);
    }

    // =================================================================
    // claimReward — happy path
    // =================================================================

    function test_ClaimReward_TransfersUsdcToContributor() public {
        uint256 id = _createFundSubmitApprove();
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        board.claimReward(id);
        assertEq(usdc.balanceOf(alice), aliceBefore + REWARD);
    }

    function test_ClaimReward_StatusBecomesClaimed() public {
        uint256 id = _createFundSubmitApprove();
        vm.prank(alice);
        board.claimReward(id);
        BountyBoard.Bounty memory b = board.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyBoard.BountyStatus.Claimed));
    }

    function test_ClaimReward_BoardBalanceDecreases() public {
        uint256 id = _createFundSubmitApprove();
        uint256 boardBefore = usdc.balanceOf(address(board));
        vm.prank(alice);
        board.claimReward(id);
        assertEq(usdc.balanceOf(address(board)), boardBefore - REWARD);
    }

    function test_ClaimReward_EmitsRewardClaimed() public {
        uint256 id = _createFundSubmitApprove();
        vm.expectEmit(true, true, false, true, address(board));
        emit BountyBoard.RewardClaimed(id, alice, REWARD);
        vm.prank(alice);
        board.claimReward(id);
    }

    // claimReward — reverts
    function test_ClaimReward_Revert_NotApprovedContributor() public {
        uint256 id = _createFundSubmitApprove();
        vm.prank(stranger);
        vm.expectRevert(BountyBoard.NotApprovedContributor.selector);
        board.claimReward(id);
    }

    function test_ClaimReward_Revert_InvalidStatus_Funded() public {
        uint256 id = _createFundSubmit();
        vm.prank(alice);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.claimReward(id);
    }

    function test_ClaimReward_Revert_DoubleClaim() public {
        uint256 id = _createFundSubmitApprove();
        vm.prank(alice);
        board.claimReward(id);
        vm.prank(alice);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.claimReward(id);
    }

    // =================================================================
    // refundBounty — happy path
    // =================================================================

    function test_RefundBounty_TransfersUsdcToCreator() public {
        uint256 id = _createAndFundBounty();
        uint256 creatorBefore = usdc.balanceOf(creator);
        vm.warp(deadline + 1);
        vm.prank(creator);
        board.refundBounty(id);
        assertEq(usdc.balanceOf(creator), creatorBefore + REWARD);
    }

    function test_RefundBounty_StatusBecomesRefunded() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline + 1);
        vm.prank(creator);
        board.refundBounty(id);
        BountyBoard.Bounty memory b = board.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyBoard.BountyStatus.Refunded));
    }

    function test_RefundBounty_EmitsBountyRefunded() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline + 1);
        vm.expectEmit(true, true, false, true, address(board));
        emit BountyBoard.BountyRefunded(id, creator, REWARD);
        vm.prank(creator);
        board.refundBounty(id);
    }

    // refundBounty — reverts
    function test_RefundBounty_Revert_NotCreator() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline + 1);
        vm.prank(stranger);
        vm.expectRevert(BountyBoard.NotCreator.selector);
        board.refundBounty(id);
    }

    function test_RefundBounty_Revert_DeadlineNotPassed() public {
        uint256 id = _createAndFundBounty();
        // still before deadline
        vm.prank(creator);
        vm.expectRevert(BountyBoard.DeadlineNotPassed.selector);
        board.refundBounty(id);
    }

    function test_RefundBounty_Revert_InvalidStatus_Open() public {
        uint256 id = _createBounty();
        vm.warp(deadline + 1);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.refundBounty(id);
    }

    // =================================================================
    // refundAfterApproval — happy path
    // =================================================================

    function test_RefundAfterApproval_TransfersUsdcToCreator() public {
        uint256 id = _createFundSubmitApprove();
        // warp past deadline + grace period
        vm.warp(deadline + CLAIM_GRACE + 1);
        uint256 creatorBefore = usdc.balanceOf(creator);
        vm.prank(creator);
        board.refundAfterApproval(id);
        assertEq(usdc.balanceOf(creator), creatorBefore + REWARD);
    }

    function test_RefundAfterApproval_StatusBecomesRefunded() public {
        uint256 id = _createFundSubmitApprove();
        vm.warp(deadline + CLAIM_GRACE + 1);
        vm.prank(creator);
        board.refundAfterApproval(id);
        BountyBoard.Bounty memory b = board.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyBoard.BountyStatus.Refunded));
    }

    function test_RefundAfterApproval_EmitsBountyRefunded() public {
        uint256 id = _createFundSubmitApprove();
        vm.warp(deadline + CLAIM_GRACE + 1);
        vm.expectEmit(true, true, false, true, address(board));
        emit BountyBoard.BountyRefunded(id, creator, REWARD);
        vm.prank(creator);
        board.refundAfterApproval(id);
    }

    // refundAfterApproval — reverts
    function test_RefundAfterApproval_Revert_NotCreator() public {
        uint256 id = _createFundSubmitApprove();
        vm.warp(deadline + CLAIM_GRACE + 1);
        vm.prank(stranger);
        vm.expectRevert(BountyBoard.NotCreator.selector);
        board.refundAfterApproval(id);
    }

    function test_RefundAfterApproval_Revert_GracePeriodNotOver_AtDeadline() public {
        uint256 id = _createFundSubmitApprove();
        vm.warp(deadline);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.GracePeriodNotOver.selector);
        board.refundAfterApproval(id);
    }

    function test_RefundAfterApproval_Revert_GracePeriodNotOver_ExactlyAtEnd() public {
        uint256 id = _createFundSubmitApprove();
        // strictly <= deadline+grace should still revert
        vm.warp(deadline + CLAIM_GRACE);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.GracePeriodNotOver.selector);
        board.refundAfterApproval(id);
    }

    function test_RefundAfterApproval_Revert_InvalidStatus_Funded() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline + CLAIM_GRACE + 1);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.refundAfterApproval(id);
    }

    // =================================================================
    // cancelBounty — happy path
    // =================================================================

    function test_CancelBounty_StatusBecomesCancelled() public {
        uint256 id = _createBounty();
        vm.prank(creator);
        board.cancelBounty(id);
        BountyBoard.Bounty memory b = board.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyBoard.BountyStatus.Cancelled));
    }

    function test_CancelBounty_EmitsBountyCancelled() public {
        uint256 id = _createBounty();
        vm.expectEmit(true, true, false, false, address(board));
        emit BountyBoard.BountyCancelled(id, creator);
        vm.prank(creator);
        board.cancelBounty(id);
    }

    // cancelBounty — reverts
    function test_CancelBounty_Revert_NotCreator() public {
        uint256 id = _createBounty();
        vm.prank(stranger);
        vm.expectRevert(BountyBoard.NotCreator.selector);
        board.cancelBounty(id);
    }

    function test_CancelBounty_Revert_InvalidStatus_Funded() public {
        uint256 id = _createAndFundBounty();
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.cancelBounty(id);
    }

    // =================================================================
    // getBounty / getSubmission / hasSubmitted — view reverts
    // =================================================================

    function test_GetBounty_Revert_BountyNotFound() public {
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.getBounty(42);
    }

    function test_GetSubmission_Revert_BountyNotFound() public {
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.getSubmission(42, alice);
    }

    function test_HasSubmitted_Revert_BountyNotFound() public {
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.hasSubmitted(42, alice);
    }

    function test_GetSubmission_ExistsIsFalseBeforeSubmission() public {
        uint256 id = _createAndFundBounty();
        (, bool exists) = board.getSubmission(id, alice);
        assertFalse(exists);
    }

    // =================================================================
    // Full happy-path flow (Open → Funded → Approved → Claimed)
    // =================================================================

    function test_FullFlow_OpenToFundedToApprovedToClaimed() public {
        // 1. create
        vm.prank(creator);
        uint256 id = board.createBounty(TITLE, CONTENT_HASH, REWARD, deadline);
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoard.BountyStatus.Open));

        // 2. fund
        vm.startPrank(creator);
        usdc.approve(address(board), REWARD);
        board.fundBounty(id);
        vm.stopPrank();
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoard.BountyStatus.Funded));

        // 3. submit (alice)
        vm.prank(alice);
        board.submitWork(id, SUBMISSION_HASH);
        assertTrue(board.hasSubmitted(id, alice));

        // 4. approve
        vm.prank(creator);
        board.approveBounty(id, alice);
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoard.BountyStatus.Approved));

        // 5. claim
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        board.claimReward(id);
        assertEq(usdc.balanceOf(alice), aliceBefore + REWARD);
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoard.BountyStatus.Claimed));

        // board drained
        assertEq(usdc.balanceOf(address(board)), 0);
    }
}
