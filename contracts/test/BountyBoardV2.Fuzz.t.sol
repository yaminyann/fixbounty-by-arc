// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BountyBoardV2TestBase} from "./BountyBoardV2.Base.t.sol";
import {BountyBoardV2} from "../BountyBoardV2.sol";

contract BountyBoardV2FuzzTest is BountyBoardV2TestBase {

    // =============================================================
    //              Fuzz: fee arithmetic correctness
    // =============================================================

    /// @dev Verify feeAmount + contributorPayout == reward for any valid inputs.
    ///      Uses bound() to constrain within legal range rather than vm.assume.
    function testFuzz_FeeArithmetic_SumsToReward(uint256 reward, uint256 feeBps) public {
        // Constrain to legal fee range [0, 1000]
        feeBps = bound(feeBps, 0, MAX_FEE_BPS);
        // Reward must be > 0 and fit in 6-decimal USDC space (max ~1 trillion)
        reward = bound(reward, 1, 1_000_000_000e6);

        uint256 feeAmount       = (reward * feeBps) / 10_000;
        uint256 contributorPayout = reward - feeAmount;

        assertEq(feeAmount + contributorPayout, reward, "parts must sum to reward");
    }

    /// @dev previewFee must always return parts that sum to the input.
    function testFuzz_PreviewFee_SumsToReward(uint256 reward, uint256 newFeeBps) public {
        newFeeBps = bound(newFeeBps, 0, MAX_FEE_BPS);
        reward    = bound(reward, 0, 1_000_000_000e6);

        vm.prank(owner);
        board.setFeeBps(newFeeBps);

        (uint256 feeAmount, uint256 contributorPayout) = board.previewFee(reward);
        assertEq(feeAmount + contributorPayout, reward, "previewFee parts must sum to reward");
    }

    /// @dev Fee must never exceed reward (no negative payouts).
    function testFuzz_FeeNeverExceedsReward(uint256 reward, uint256 feeBps) public pure {
        feeBps = bound(feeBps, 0, MAX_FEE_BPS);
        reward = bound(reward, 0, 1_000_000_000e6);

        uint256 feeAmount = (reward * feeBps) / 10_000;
        assertLe(feeAmount, reward, "fee must not exceed reward");
    }

    // =============================================================
    //              Fuzz: end-to-end claim with arbitrary fee
    // =============================================================

    /// @dev Full claim flow: treasury receives exactly feeAmount, contributor
    ///      receives exactly contributorPayout, board ends at zero.
    function testFuzz_ClaimReward_BalancesMatchFeeCalc(uint256 feeBps) public {
        feeBps = bound(feeBps, 0, MAX_FEE_BPS);

        // Deploy fresh board with fuzzed fee
        BountyBoardV2 b = new BountyBoardV2(address(usdc), owner, feeBps, treasury);

        // Give creator enough USDC
        usdc.mint(creator, REWARD);

        vm.prank(creator);
        uint256 id = b.createBounty(TITLE, CONTENT_HASH, REWARD, deadline);

        vm.startPrank(creator);
        usdc.approve(address(b), REWARD);
        b.fundBounty(id);
        vm.stopPrank();

        vm.prank(alice);
        b.submitWork(id, SUBMISSION_HASH);

        vm.prank(creator);
        b.approveBounty(id, alice);

        uint256 aliceBefore    = usdc.balanceOf(alice);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(alice);
        b.claimReward(id);

        uint256 expectedFee    = (REWARD * feeBps) / 10_000;
        uint256 expectedPayout = REWARD - expectedFee;

        assertEq(usdc.balanceOf(alice),    aliceBefore    + expectedPayout, "contributor payout");
        assertEq(usdc.balanceOf(treasury), treasuryBefore + expectedFee,    "treasury fee");
        assertEq(usdc.balanceOf(address(b)), 0,                              "board zero after claim");
    }

    // =============================================================
    //              Fuzz: refund always returns full reward
    // =============================================================

    /// @dev Refund must return the entire reward regardless of fee setting.
    function testFuzz_RefundBounty_ReturnsFullReward(uint256 feeBps) public {
        feeBps = bound(feeBps, 0, MAX_FEE_BPS);

        BountyBoardV2 b = new BountyBoardV2(address(usdc), owner, feeBps, treasury);
        usdc.mint(creator, REWARD);

        vm.prank(creator);
        uint256 id = b.createBounty(TITLE, CONTENT_HASH, REWARD, deadline);

        vm.startPrank(creator);
        usdc.approve(address(b), REWARD);
        b.fundBounty(id);
        vm.stopPrank();

        uint256 creatorBefore    = usdc.balanceOf(creator);
        uint256 treasuryBefore   = usdc.balanceOf(treasury);

        vm.warp(deadline + 1);
        vm.prank(creator);
        b.refundBounty(id);

        assertEq(usdc.balanceOf(creator),   creatorBefore + REWARD, "full reward returned");
        assertEq(usdc.balanceOf(treasury),  treasuryBefore,         "no fee on refund");
        assertEq(usdc.balanceOf(address(b)), 0,                     "board zero after refund");
    }

    // =============================================================
    //              Fuzz: setFeeBps boundary
    // =============================================================

    function testFuzz_SetFeeBps_AcceptsValidRange(uint256 feeBps) public {
        feeBps = bound(feeBps, 0, MAX_FEE_BPS);
        vm.prank(owner);
        board.setFeeBps(feeBps);
        assertEq(board.feeBps(), feeBps);
    }

    function testFuzz_SetFeeBps_RevertsAboveMax(uint256 feeBps) public {
        feeBps = bound(feeBps, MAX_FEE_BPS + 1, type(uint256).max);
        vm.prank(owner);
        vm.expectRevert(BountyBoardV2.FeeTooHigh.selector);
        board.setFeeBps(feeBps);
    }

    // =============================================================
    //              Fuzz: reward amount variation
    // =============================================================

    /// @dev createBounty + fundBounty with arbitrary reward amounts.
    function testFuzz_CreateAndFund_AnyReward(uint256 reward) public {
        reward = bound(reward, 1, 1_000_000e6); // up to 1M USDC

        // Fresh creator with enough balance
        address fuzzCreator = makeAddr("fuzzCreator");
        usdc.mint(fuzzCreator, reward);

        vm.prank(fuzzCreator);
        uint256 id = board.createBounty(TITLE, CONTENT_HASH, reward, deadline);

        vm.startPrank(fuzzCreator);
        usdc.approve(address(board), reward);
        board.fundBounty(id);
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(board)), reward);
        assertEq(board.getBounty(id).reward, reward);
    }
}
