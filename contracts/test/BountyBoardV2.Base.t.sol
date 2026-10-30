// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BountyBoardV2} from "../BountyBoardV2.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

/// @dev Shared setup, actors, constants, and helpers for BountyBoardV2 tests.
///      No test/fuzz/invariant functions — every category file inherits this.
abstract contract BountyBoardV2TestBase is Test {
    // ─── contracts ──────────────────────────────────────────────────
    BountyBoardV2 internal board;
    MockERC20     internal usdc;

    // ─── actors ─────────────────────────────────────────────────────
    address internal owner     = makeAddr("owner");
    address internal treasury  = makeAddr("treasury");
    address internal creator   = makeAddr("creator");
    address internal alice     = makeAddr("alice");
    address internal bob       = makeAddr("bob");
    address internal stranger  = makeAddr("stranger");

    // ─── constants ──────────────────────────────────────────────────
    uint256 internal constant REWARD          = 500e6;   // 500 USDC (6 decimals)
    uint256 internal constant FEE_BPS         = 200;     // 2 %
    uint256 internal constant MAX_FEE_BPS     = 1000;    // 10 %
    uint256 internal constant CLAIM_GRACE     = 7 days;
    string  internal constant TITLE           = "Fix CI pipeline";
    string  internal constant CONTENT_HASH    = "QmABCDEF";
    string  internal constant SUBMISSION_HASH = "QmWORK123";

    // deadline is always 30 days from the timestamp forge starts at
    uint256 internal deadline;

    // ─── setUp ──────────────────────────────────────────────────────
    function setUp() public virtual {
        usdc  = new MockERC20("Mock USDC", "mUSDC", 6);
        board = new BountyBoardV2(address(usdc), owner, FEE_BPS, treasury);

        // fund actors
        usdc.mint(creator, 10_000e6);
        usdc.mint(alice,   10_000e6);
        usdc.mint(bob,     10_000e6);

        // all tests start at a known timestamp
        vm.warp(1_700_000_000);
        deadline = block.timestamp + 30 days;
    }

    // ─── helper: create a bounty as `creator` ───────────────────────
    function _createBounty() internal returns (uint256 bountyId) {
        vm.prank(creator);
        bountyId = board.createBounty(TITLE, CONTENT_HASH, REWARD, deadline);
    }

    // ─── helper: create + fund ───────────────────────────────────────
    function _createAndFundBounty() internal returns (uint256 bountyId) {
        bountyId = _createBounty();
        vm.startPrank(creator);
        usdc.approve(address(board), REWARD);
        board.fundBounty(bountyId);
        vm.stopPrank();
    }

    // ─── helper: create + fund + submit (alice) ──────────────────────
    function _createFundSubmit() internal returns (uint256 bountyId) {
        bountyId = _createAndFundBounty();
        vm.prank(alice);
        board.submitWork(bountyId, SUBMISSION_HASH);
    }

    // ─── helper: full flow through Approved ─────────────────────────
    function _createFundSubmitApprove() internal returns (uint256 bountyId) {
        bountyId = _createFundSubmit();
        vm.prank(creator);
        board.approveBounty(bountyId, alice);
    }
}
