// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BountyBoardTestBase} from "./BountyBoard.Base.t.sol";
import {BountyBoard} from "../BountyBoard.sol";

contract BountyBoardUnitTest is BountyBoardTestBase {
    // =============================================================
    //                        Constructor
    // =============================================================

    function test_constructor_setsImmutables() public view {
        assertEq(address(board.usdc()), address(usdc));
        assertEq(board.treasury(), treasury);
        assertEq(board.POST_FEE_BPS(), 50);
        assertEq(board.CLAIM_FEE_BPS(), 500);
    }

    function test_constructor_revertsOnZeroUsdc() public {
        vm.expectRevert(BountyBoard.ZeroAddress.selector);
        new BountyBoard(address(0), treasury);
    }

    function test_constructor_revertsOnZeroTreasury() public {
        vm.expectRevert(BountyBoard.ZeroAddress.selector);
        new BountyBoard(address(usdc), address(0));
    }

    // =============================================================
    //                        createBounty
    // =============================================================

    function test_create_storesBounty() public {
        uint256 id = _createBounty();
        BountyBoard.Bounty memory b = board.getBounty(id);
        assertEq(id, 1);
        assertEq(b.id, 1);
        assertEq(b.creator, creator);
        assertEq(b.title, TITLE);
        assertEq(b.contentHash, CONTENT_HASH);
        assertEq(b.reward, REWARD);
        assertEq(b.deadline, deadline);
        assertEq(uint8(b.status), uint8(BountyBoard.BountyStatus.Open));
        assertEq(b.winnerSlots, 1);
        assertEq(b.winnerCount, 0);
        assertEq(b.submissionCount, 0);
        assertEq(board.getBountyCount(), 1);
    }

    function test_create_incrementsIds() public {
        assertEq(_createBounty(), 1);
        assertEq(_createBounty(), 2);
        assertEq(board.getBountyCount(), 2);
    }

    function test_create_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit BountyBoard.BountyCreated(1, creator, REWARD, deadline, 3);
        _create(_podium());
    }

    function test_create_revertsOnEmptyTitle() public {
        vm.prank(creator);
        vm.expectRevert(BountyBoard.EmptyTitle.selector);
        board.createBounty("", CONTENT_HASH, REWARD, deadline, _single());
    }

    function test_create_revertsOnLongTitle() public {
        bytes memory long = new bytes(201);
        for (uint256 i; i < long.length; ++i) long[i] = "a";
        vm.prank(creator);
        vm.expectRevert(BountyBoard.TitleTooLong.selector);
        board.createBounty(string(long), CONTENT_HASH, REWARD, deadline, _single());
    }

    function test_create_acceptsMaxLengthTitle() public {
        bytes memory long = new bytes(200);
        for (uint256 i; i < long.length; ++i) long[i] = "a";
        vm.prank(creator);
        board.createBounty(string(long), CONTENT_HASH, REWARD, deadline, _single());
    }

    function test_create_revertsOnLongContentHash() public {
        bytes memory long = new bytes(129);
        for (uint256 i; i < long.length; ++i) long[i] = "a";
        vm.prank(creator);
        vm.expectRevert(BountyBoard.ContentHashTooLong.selector);
        board.createBounty(TITLE, string(long), REWARD, deadline, _single());
    }

    function test_create_revertsOnZeroReward() public {
        vm.prank(creator);
        vm.expectRevert(BountyBoard.ZeroReward.selector);
        board.createBounty(TITLE, CONTENT_HASH, 0, deadline, _single());
    }

    function test_create_revertsOnPastDeadline() public {
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidDeadline.selector);
        board.createBounty(TITLE, CONTENT_HASH, REWARD, block.timestamp, _single());
    }

    function test_create_allowsEmptyContentHash() public {
        vm.prank(creator);
        board.createBounty(TITLE, "", REWARD, deadline, _single());
    }

    // ─── prize shares ───────────────────────────────────────────────

    function test_shares_emptyReverts() public {
        uint16[] memory s = new uint16[](0);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidPrizeShares.selector);
        board.createBounty(TITLE, CONTENT_HASH, REWARD, deadline, s);
    }

    function test_shares_tooManyReverts() public {
        uint16[] memory s = new uint16[](11);
        for (uint256 i; i < 10; ++i) s[i] = 909;
        s[10] = 910;
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidPrizeShares.selector);
        board.createBounty(TITLE, CONTENT_HASH, REWARD, deadline, s);
    }

    function test_shares_maxWinnersAccepted() public {
        uint16[] memory s = new uint16[](10);
        for (uint256 i; i < 10; ++i) s[i] = 1_000;
        vm.prank(creator);
        uint256 id = board.createBounty(TITLE, CONTENT_HASH, REWARD, deadline, s);
        assertEq(board.getBounty(id).winnerSlots, 10);
    }

    function test_shares_mustSumToDenominator() public {
        uint16[] memory s = new uint16[](2);
        s[0] = 6_000;
        s[1] = 3_000;
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidPrizeShares.selector);
        board.createBounty(TITLE, CONTENT_HASH, REWARD, deadline, s);
    }

    function test_shares_overSumReverts() public {
        uint16[] memory s = new uint16[](2);
        s[0] = 6_000;
        s[1] = 5_000;
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidPrizeShares.selector);
        board.createBounty(TITLE, CONTENT_HASH, REWARD, deadline, s);
    }

    function test_shares_zeroShareReverts() public {
        uint16[] memory s = new uint16[](2);
        s[0] = 10_000;
        s[1] = 0;
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidPrizeShares.selector);
        board.createBounty(TITLE, CONTENT_HASH, REWARD, deadline, s);
    }

    function test_shares_mustBeNonIncreasing() public {
        uint16[] memory s = new uint16[](2);
        s[0] = 3_000;
        s[1] = 7_000;
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidPrizeShares.selector);
        board.createBounty(TITLE, CONTENT_HASH, REWARD, deadline, s);
    }

    function test_shares_equalSplitAllowed() public {
        uint16[] memory s = new uint16[](4);
        for (uint256 i; i < 4; ++i) s[i] = 2_500;
        vm.prank(creator);
        uint256 id = board.createBounty(TITLE, CONTENT_HASH, REWARD, deadline, s);
        (, uint256[] memory payouts) = board.getPrizeStructure(id);
        for (uint256 i; i < 4; ++i) assertEq(payouts[i], 125e6);
    }

    function test_shares_payoutsSumToRewardWithDust() public {
        // 3 equal-ish positions of an amount not divisible by 3
        uint16[] memory s = new uint16[](3);
        s[0] = 3_334;
        s[1] = 3_333;
        s[2] = 3_333;
        vm.prank(creator);
        uint256 id = board.createBounty(TITLE, CONTENT_HASH, 100, deadline, s);
        (, uint256[] memory payouts) = board.getPrizeStructure(id);
        assertEq(payouts[0] + payouts[1] + payouts[2], 100);
        assertGe(payouts[0], payouts[1]);
    }

    function test_shares_payoutTooSmallReverts() public {
        // 1 base unit split 50/50 leaves the second payout at zero
        uint16[] memory s = new uint16[](2);
        s[0] = 5_000;
        s[1] = 5_000;
        vm.prank(creator);
        vm.expectRevert(BountyBoard.PayoutTooSmall.selector);
        board.createBounty(TITLE, CONTENT_HASH, 1, deadline, s);
    }

    function test_prizeStructure_podium() public {
        uint256 id = _create(_podium());
        (uint16[] memory shares, uint256[] memory payouts) = board.getPrizeStructure(id);
        assertEq(shares.length, 3);
        assertEq(shares[0], 5_000);
        assertEq(payouts[0], 250e6);
        assertEq(payouts[1], 150e6);
        assertEq(payouts[2], 100e6);
    }

    // =============================================================
    //                         fundBounty
    // =============================================================

    function test_fund_movesRewardAndPostFee() public {
        uint256 id = _createBounty();
        uint256 creatorBefore = usdc.balanceOf(creator);
        _fund(id);

        assertEq(usdc.balanceOf(address(board)), REWARD);
        assertEq(usdc.balanceOf(treasury), POST_FEE);
        assertEq(usdc.balanceOf(creator), creatorBefore - REWARD - POST_FEE);

        BountyBoard.Bounty memory b = board.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyBoard.BountyStatus.Funded));
        assertEq(b.fundedAt, block.timestamp);
    }

    function test_fund_emitsEvents() public {
        uint256 id = _createBounty();
        vm.startPrank(creator);
        usdc.approve(address(board), REWARD + POST_FEE);

        vm.expectEmit(true, true, false, true);
        emit BountyBoard.PlatformFeePaid(id, creator, POST_FEE, 0);
        vm.expectEmit(true, true, false, true);
        emit BountyBoard.BountyFunded(id, creator, REWARD, POST_FEE);
        board.fundBounty(id);
        vm.stopPrank();
    }

    function test_fund_revertsWithoutFeeAllowance() public {
        uint256 id = _createBounty();
        vm.startPrank(creator);
        usdc.approve(address(board), REWARD); // forgot the fee
        vm.expectRevert();
        board.fundBounty(id);
        vm.stopPrank();
    }

    function test_fund_revertsForNonCreator() public {
        uint256 id = _createBounty();
        vm.prank(alice);
        vm.expectRevert(BountyBoard.NotCreator.selector);
        board.fundBounty(id);
    }

    function test_fund_revertsWhenAlreadyFunded() public {
        uint256 id = _createAndFundBounty();
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.fundBounty(id);
    }

    function test_fund_revertsAfterDeadline() public {
        uint256 id = _createBounty();
        vm.warp(deadline + 1);
        vm.startPrank(creator);
        usdc.approve(address(board), REWARD + POST_FEE);
        vm.expectRevert(BountyBoard.DeadlinePassed.selector);
        board.fundBounty(id);
        vm.stopPrank();
    }

    function test_fund_allowedAtDeadlineBoundary() public {
        uint256 id = _createBounty();
        vm.warp(deadline);
        _fund(id);
    }

    function test_fund_revertsWhenMissing() public {
        vm.prank(creator);
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.fundBounty(99);
    }

    function test_previewFunding() public view {
        (uint256 fee, uint256 total) = board.previewFunding(REWARD);
        assertEq(fee, POST_FEE);
        assertEq(total, REWARD + POST_FEE);
    }

    // =============================================================
    //                          submitWork
    // =============================================================

    function test_submit_recordsSubmission() public {
        uint256 id = _createAndFundBounty();
        _submit(id, alice);
        (string memory h, bool exists) = board.getSubmission(id, alice);
        assertTrue(exists);
        assertEq(h, SUBMISSION_HASH);
        assertTrue(board.hasSubmitted(id, alice));
        assertEq(board.getBounty(id).submissionCount, 1);
    }

    function test_submit_countsMultipleContributors() public {
        uint256 id = _createAndFundBounty();
        _submit(id, alice);
        _submit(id, bob);
        assertEq(board.getBounty(id).submissionCount, 2);
    }

    function test_submit_emitsEvent() public {
        uint256 id = _createAndFundBounty();
        vm.expectEmit(true, true, false, true);
        emit BountyBoard.WorkSubmitted(id, alice, SUBMISSION_HASH);
        _submit(id, alice);
    }

    function test_submit_revertsWhenNotFunded() public {
        uint256 id = _createBounty();
        vm.prank(alice);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.submitWork(id, SUBMISSION_HASH);
    }

    function test_submit_revertsForCreator() public {
        uint256 id = _createAndFundBounty();
        vm.prank(creator);
        vm.expectRevert(BountyBoard.SelfSubmission.selector);
        board.submitWork(id, SUBMISSION_HASH);
    }

    function test_submit_revertsAfterDeadline() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(BountyBoard.DeadlinePassed.selector);
        board.submitWork(id, SUBMISSION_HASH);
    }

    function test_submit_allowedAtDeadline() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline);
        _submit(id, alice);
    }

    function test_submit_revertsOnEmptyHash() public {
        uint256 id = _createAndFundBounty();
        vm.prank(alice);
        vm.expectRevert(BountyBoard.EmptySubmissionHash.selector);
        board.submitWork(id, "");
    }

    function test_submit_revertsOnLongHash() public {
        uint256 id = _createAndFundBounty();
        bytes memory long = new bytes(129);
        for (uint256 i; i < long.length; ++i) long[i] = "a";
        vm.prank(alice);
        vm.expectRevert(BountyBoard.SubmissionHashTooLong.selector);
        board.submitWork(id, string(long));
    }

    function test_submit_revertsOnDuplicate() public {
        uint256 id = _createAndFundBounty();
        _submit(id, alice);
        vm.prank(alice);
        vm.expectRevert(BountyBoard.AlreadySubmitted.selector);
        board.submitWork(id, SUBMISSION_HASH);
    }

    function test_submit_revertsAfterApproval() public {
        uint256 id = _createAndFundBounty();
        _submit(id, alice);
        _approve(id, _addrs(alice));
        vm.prank(bob);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.submitWork(id, SUBMISSION_HASH);
    }

    function test_getSubmission_unknownContributor() public {
        uint256 id = _createAndFundBounty();
        (string memory h, bool exists) = board.getSubmission(id, stranger);
        assertFalse(exists);
        assertEq(bytes(h).length, 0);
    }

    // =============================================================
    //                        approveWinners
    // =============================================================

    function test_approve_singleWinner() public {
        uint256 id = _createAndFundBounty();
        _submit(id, alice);
        _approve(id, _addrs(alice));

        BountyBoard.Bounty memory b = board.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyBoard.BountyStatus.Approved));
        assertEq(b.approvedAt, block.timestamp);
        assertEq(b.winnerCount, 1);
        assertEq(b.unclaimedAmount, REWARD);
        assertEq(board.winnerPosition(id, alice), 1);
        assertEq(board.winnerPosition(id, bob), 0);
    }

    function test_approve_multipleWinnersInOrder() public {
        uint256 id = _createAndFund(_podium());
        _submit(id, alice);
        _submit(id, bob);
        _submit(id, carol);
        _approve(id, _addrs(bob, carol, alice));

        assertEq(board.winnerPosition(id, bob), 1);
        assertEq(board.winnerPosition(id, carol), 2);
        assertEq(board.winnerPosition(id, alice), 3);

        (address[] memory winners, bool[] memory claimed) = board.getWinners(id);
        assertEq(winners.length, 3);
        assertEq(winners[0], bob);
        assertFalse(claimed[0]);
        assertEq(board.getBounty(id).unclaimedAmount, REWARD);
    }

    function test_approve_fewerWinnersReturnsUnusedPositionsToCreator() public {
        uint256 id = _createAndFund(_podium());
        _submit(id, alice);
        uint256 creatorBefore = usdc.balanceOf(creator);

        vm.expectEmit(true, false, false, true);
        emit BountyBoard.BountyApproved(id, 1, 250e6);
        _approve(id, _addrs(alice));

        // positions 2 + 3 (150 + 100) return to the creator right away
        assertEq(usdc.balanceOf(creator), creatorBefore + 250e6);
        assertEq(usdc.balanceOf(address(board)), 250e6);
        assertEq(board.getBounty(id).unclaimedAmount, 250e6);
    }

    function test_approve_emitsWinnerEvents() public {
        uint256 id = _createAndFund(_podium());
        _submit(id, alice);
        _submit(id, bob);

        vm.expectEmit(true, true, false, true);
        emit BountyBoard.WinnerApproved(id, alice, 1, 250e6);
        vm.expectEmit(true, true, false, true);
        emit BountyBoard.WinnerApproved(id, bob, 2, 150e6);
        _approve(id, _addrs(alice, bob));
    }

    function test_approve_canApproveBeforeDeadline() public {
        uint256 id = _createAndFundBounty();
        _submit(id, alice);
        assertLt(block.timestamp, deadline);
        _approve(id, _addrs(alice));
    }

    function test_approve_canApproveAfterDeadline() public {
        uint256 id = _createAndFundBounty();
        _submit(id, alice);
        vm.warp(deadline + 3 days);
        _approve(id, _addrs(alice));
    }

    function test_approve_revertsForNonCreator() public {
        uint256 id = _createAndFundBounty();
        _submit(id, alice);
        vm.prank(alice);
        vm.expectRevert(BountyBoard.NotCreator.selector);
        board.approveWinners(id, _addrs(alice));
    }

    function test_approve_revertsWhenNotFunded() public {
        uint256 id = _createBounty();
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.approveWinners(id, _addrs(alice));
    }

    function test_approve_revertsOnEmptyList() public {
        uint256 id = _createAndFundBounty();
        address[] memory none = new address[](0);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidWinners.selector);
        board.approveWinners(id, none);
    }

    function test_approve_revertsWhenMoreWinnersThanPositions() public {
        uint256 id = _createAndFundBounty(); // 1 position
        _submit(id, alice);
        _submit(id, bob);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidWinners.selector);
        board.approveWinners(id, _addrs(alice, bob));
    }

    function test_approve_revertsOnZeroAddress() public {
        uint256 id = _createAndFundBounty();
        vm.prank(creator);
        vm.expectRevert(BountyBoard.ZeroAddress.selector);
        board.approveWinners(id, _addrs(address(0)));
    }

    function test_approve_revertsWithoutSubmission() public {
        uint256 id = _createAndFundBounty();
        vm.prank(creator);
        vm.expectRevert(BountyBoard.NoSubmission.selector);
        board.approveWinners(id, _addrs(alice));
    }

    function test_approve_revertsOnDuplicateWinner() public {
        uint256 id = _createAndFund(_podium());
        _submit(id, alice);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.DuplicateWinner.selector);
        board.approveWinners(id, _addrs(alice, alice));
    }

    function test_approve_isFinal() public {
        uint256 id = _createAndFund(_podium());
        _submit(id, alice);
        _submit(id, bob);
        _approve(id, _addrs(alice));
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.approveWinners(id, _addrs(bob));
    }

    // =============================================================
    //                         claimReward
    // =============================================================

    function test_claim_singleWinnerPaysNetAndFee() public {
        uint256 id = _approvedSingle();
        uint256 fee = _claimFee(REWARD); // 25 USDC
        assertEq(fee, 25e6);

        vm.expectEmit(true, true, false, true);
        emit BountyBoard.PlatformFeePaid(id, alice, fee, 1);
        vm.expectEmit(true, true, false, true);
        emit BountyBoard.RewardClaimed(id, alice, 1, REWARD, fee);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.prank(alice);
        board.claimReward(id);

        assertEq(usdc.balanceOf(alice), aliceBefore + REWARD - fee);
        assertEq(usdc.balanceOf(treasury), treasuryBefore + fee);
        assertEq(usdc.balanceOf(address(board)), 0);

        BountyBoard.Bounty memory b = board.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyBoard.BountyStatus.Claimed));
        assertEq(b.unclaimedAmount, 0);
        assertEq(b.claimedCount, 1);
    }

    function test_claim_multiWinnerEachPaysOwnFee() public {
        uint256 id = _createAndFund(_podium());
        _submit(id, alice);
        _submit(id, bob);
        _submit(id, carol);
        _approve(id, _addrs(alice, bob, carol));

        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(bob); // 2nd place: 150 USDC, 5% = 7.5
        board.claimReward(id);
        assertEq(usdc.balanceOf(bob), 150e6 - _claimFee(150e6));
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoard.BountyStatus.Approved));

        vm.prank(alice); // 1st place: 250 USDC
        board.claimReward(id);
        assertEq(usdc.balanceOf(alice), 10_000e6 + 250e6 - _claimFee(250e6));

        vm.prank(carol); // 3rd place: 100 USDC -> last claim closes the bounty
        board.claimReward(id);
        assertEq(usdc.balanceOf(carol), 100e6 - _claimFee(100e6));

        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoard.BountyStatus.Claimed));
        assertEq(usdc.balanceOf(treasury), treasuryBefore + _claimFee(REWARD));
        assertEq(usdc.balanceOf(address(board)), 0);
    }

    function test_claim_revertsForNonWinner() public {
        uint256 id = _approvedSingle();
        vm.prank(bob);
        vm.expectRevert(BountyBoard.NotWinner.selector);
        board.claimReward(id);
    }

    function test_claim_revertsForCreator() public {
        uint256 id = _approvedSingle();
        vm.prank(creator);
        vm.expectRevert(BountyBoard.NotWinner.selector);
        board.claimReward(id);
    }

    function test_claim_revertsOnSecondClaim() public {
        uint256 id = _createAndFund(_podium());
        _submit(id, alice);
        _submit(id, bob);
        _approve(id, _addrs(alice, bob));
        vm.startPrank(alice);
        board.claimReward(id);
        vm.expectRevert(BountyBoard.AlreadyClaimed.selector);
        board.claimReward(id);
        vm.stopPrank();
    }

    function test_claim_revertsBeforeApproval() public {
        uint256 id = _createAndFundBounty();
        _submit(id, alice);
        vm.prank(alice);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.claimReward(id);
    }

    function test_claim_revertsAfterFullClaim() public {
        uint256 id = _approvedSingle();
        vm.startPrank(alice);
        board.claimReward(id);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.claimReward(id);
        vm.stopPrank();
    }

    function test_claim_worksAfterGraceForWinnerIfCreatorHasNotRefunded() public {
        uint256 id = _approvedSingle();
        vm.warp(block.timestamp + CLAIM_GRACE + 30 days);
        vm.prank(alice);
        board.claimReward(id);
    }

    function test_claim_dustPositionStillSumsToReward() public {
        uint16[] memory s = new uint16[](3);
        s[0] = 3_334;
        s[1] = 3_333;
        s[2] = 3_333;
        vm.prank(creator);
        uint256 id = board.createBounty(TITLE, CONTENT_HASH, 100, deadline, s);
        vm.startPrank(creator);
        usdc.approve(address(board), 1_000);
        board.fundBounty(id);
        vm.stopPrank();
        _submit(id, alice);
        _submit(id, bob);
        _submit(id, carol);
        _approve(id, _addrs(alice, bob, carol));

        vm.prank(alice);
        board.claimReward(id);
        vm.prank(bob);
        board.claimReward(id);
        vm.prank(carol);
        board.claimReward(id);
        assertEq(usdc.balanceOf(address(board)), 0);
    }

    // =============================================================
    //                         refundBounty
    // =============================================================

    function test_refund_noSubmissions_afterDeadline() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline + 1);
        uint256 before = usdc.balanceOf(creator);
        vm.prank(creator);
        board.refundBounty(id);

        // reward returns, the post fee stays with the treasury
        assertEq(usdc.balanceOf(creator), before + REWARD);
        assertEq(usdc.balanceOf(treasury), POST_FEE);
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoard.BountyStatus.Refunded));
    }

    function test_refund_revertsBeforeDeadline() public {
        uint256 id = _createAndFundBounty();
        vm.prank(creator);
        vm.expectRevert(BountyBoard.DeadlineNotPassed.selector);
        board.refundBounty(id);
    }

    function test_refund_revertsAtDeadlineBoundary() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.DeadlineNotPassed.selector);
        board.refundBounty(id);
    }

    function test_refund_withSubmissions_requiresReviewPeriod() public {
        uint256 id = _createAndFundBounty();
        _submit(id, alice);
        vm.warp(deadline + 1);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.ReviewPeriodNotOver.selector);
        board.refundBounty(id);

        vm.warp(deadline + REVIEW);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.ReviewPeriodNotOver.selector);
        board.refundBounty(id);

        vm.warp(deadline + REVIEW + 1);
        vm.prank(creator);
        board.refundBounty(id);
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoard.BountyStatus.Refunded));
    }

    function test_refund_revertsForNonCreator() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(BountyBoard.NotCreator.selector);
        board.refundBounty(id);
    }

    function test_refund_revertsWhenApproved() public {
        uint256 id = _approvedSingle();
        vm.warp(deadline + REVIEW + 1);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.refundBounty(id);
    }

    function test_refund_revertsWhenOpen() public {
        uint256 id = _createBounty();
        vm.warp(deadline + 1);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.refundBounty(id);
    }

    function test_refund_cannotRefundTwice() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline + 1);
        vm.startPrank(creator);
        board.refundBounty(id);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.refundBounty(id);
        vm.stopPrank();
    }

    // =============================================================
    //                     refundAfterApproval
    // =============================================================

    function test_refundAfterApproval_afterGraceFromApproval() public {
        uint256 id = _approvedSingle();
        uint256 approvedAt = board.getBounty(id).approvedAt;
        vm.warp(approvedAt + CLAIM_GRACE + 1);
        uint256 before = usdc.balanceOf(creator);
        vm.prank(creator);
        board.refundAfterApproval(id);

        assertEq(usdc.balanceOf(creator), before + REWARD);
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoard.BountyStatus.Refunded));
        assertEq(board.getBounty(id).unclaimedAmount, 0);
    }

    /// @dev The grace window is measured from approval, so approving late cannot cut the winner's window.
    function test_refundAfterApproval_lateApprovalStillGivesFullGrace() public {
        uint256 id = _createAndFundBounty();
        _submit(id, alice);
        vm.warp(deadline + REVIEW + 5 days); // well past deadline + grace
        _approve(id, _addrs(alice));

        vm.prank(creator);
        vm.expectRevert(BountyBoard.GracePeriodNotOver.selector);
        board.refundAfterApproval(id);

        vm.prank(alice);
        board.claimReward(id);
    }

    function test_refundAfterApproval_revertsAtBoundary() public {
        uint256 id = _approvedSingle();
        uint256 approvedAt = board.getBounty(id).approvedAt;
        vm.warp(approvedAt + CLAIM_GRACE);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.GracePeriodNotOver.selector);
        board.refundAfterApproval(id);
    }

    function test_refundAfterApproval_revertsForNonCreator() public {
        uint256 id = _approvedSingle();
        vm.warp(block.timestamp + CLAIM_GRACE + 1);
        vm.prank(alice);
        vm.expectRevert(BountyBoard.NotCreator.selector);
        board.refundAfterApproval(id);
    }

    function test_refundAfterApproval_revertsWhenFunded() public {
        uint256 id = _createAndFundBounty();
        vm.warp(deadline + CLAIM_GRACE + 1);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.refundAfterApproval(id);
    }

    function test_refundAfterApproval_keepsPaidWinnersAndRecoversRest() public {
        uint256 id = _createAndFund(_podium());
        _submit(id, alice);
        _submit(id, bob);
        _approve(id, _addrs(alice, bob)); // 250 + 150; 100 already returned

        vm.prank(alice);
        board.claimReward(id);

        vm.warp(block.timestamp + CLAIM_GRACE + 1);
        uint256 before = usdc.balanceOf(creator);
        vm.prank(creator);
        board.refundAfterApproval(id);

        assertEq(usdc.balanceOf(creator), before + 150e6); // only bob's unclaimed share
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoard.BountyStatus.Claimed));

        vm.prank(bob);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.claimReward(id);
        assertEq(usdc.balanceOf(address(board)), 0);
    }

    function test_refundAfterApproval_afterClaimReverts() public {
        uint256 id = _approvedSingle();
        vm.prank(alice);
        board.claimReward(id);
        vm.warp(block.timestamp + CLAIM_GRACE + 1);
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.refundAfterApproval(id);
    }

    // =============================================================
    //                         cancelBounty
    // =============================================================

    function test_cancel_open() public {
        uint256 id = _createBounty();
        vm.expectEmit(true, true, false, false);
        emit BountyBoard.BountyCancelled(id, creator);
        vm.prank(creator);
        board.cancelBounty(id);
        assertEq(uint8(board.getBounty(id).status), uint8(BountyBoard.BountyStatus.Cancelled));
    }

    function test_cancel_revertsForNonCreator() public {
        uint256 id = _createBounty();
        vm.prank(alice);
        vm.expectRevert(BountyBoard.NotCreator.selector);
        board.cancelBounty(id);
    }

    function test_cancel_revertsWhenFunded() public {
        uint256 id = _createAndFundBounty();
        vm.prank(creator);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.cancelBounty(id);
    }

    function test_cancel_cannotFundAfterCancel() public {
        uint256 id = _createBounty();
        vm.prank(creator);
        board.cancelBounty(id);
        vm.startPrank(creator);
        usdc.approve(address(board), REWARD + POST_FEE);
        vm.expectRevert(BountyBoard.InvalidStatus.selector);
        board.fundBounty(id);
        vm.stopPrank();
    }

    // =============================================================
    //                            views
    // =============================================================

    function test_views_revertOnUnknownBounty() public {
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.getBounty(1);
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.getSubmission(1, alice);
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.hasSubmitted(1, alice);
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.getPrizeStructure(1);
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.getWinners(1);
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.winnerPosition(1, alice);
    }

    function test_actions_revertOnUnknownBounty() public {
        vm.startPrank(creator);
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.cancelBounty(5);
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.approveWinners(5, _addrs(alice));
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.refundBounty(5);
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.refundAfterApproval(5);
        vm.expectRevert(BountyBoard.BountyNotFound.selector);
        board.claimReward(5);
        vm.stopPrank();
    }

    function test_noOwnerOrAdminSurface() public view {
        // Treasury is the only privileged address and it only receives funds.
        assertEq(board.treasury(), treasury);
    }
}
