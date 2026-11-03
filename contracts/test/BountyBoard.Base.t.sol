// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BountyBoard} from "../BountyBoard.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

/// @dev Shared setup, actors, constants, and helpers.
///      No test/fuzz/invariant functions — every category file inherits this.
abstract contract BountyBoardTestBase is Test {
    // ─── contracts ──────────────────────────────────────────────────
    BountyBoard internal board;
    MockERC20 internal usdc;

    // ─── actors ─────────────────────────────────────────────────────
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal stranger = makeAddr("stranger");
    address internal treasury = 0x378862A20B312298dc54585CbabC531D70F9baE9;

    // ─── constants ──────────────────────────────────────────────────
    uint256 internal constant REWARD = 500e6; // 500 USDC (6 decimals)
    uint256 internal constant POST_FEE = 2_500_000; // 0.5% of 500 USDC
    uint256 internal constant CLAIM_GRACE = 7 days;
    uint256 internal constant REVIEW = 7 days;
    string internal constant TITLE = "Fix CI pipeline";
    string internal constant CONTENT_HASH = "sha256:abcdef";
    string internal constant SUBMISSION_HASH = "sha256:work123";

    uint256 internal deadline;

    // ─── setUp ──────────────────────────────────────────────────────
    function setUp() public virtual {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        board = new BountyBoard(address(usdc), treasury);

        usdc.mint(creator, 100_000e6);
        usdc.mint(alice, 10_000e6);

        vm.warp(1_700_000_000);
        deadline = block.timestamp + 30 days;
    }

    // ─── share helpers ──────────────────────────────────────────────
    function _single() internal pure returns (uint16[] memory s) {
        s = new uint16[](1);
        s[0] = 10_000;
    }

    /// @dev 50 / 30 / 20
    function _podium() internal pure returns (uint16[] memory s) {
        s = new uint16[](3);
        s[0] = 5_000;
        s[1] = 3_000;
        s[2] = 2_000;
    }

    function _addrs(address a) internal pure returns (address[] memory r) {
        r = new address[](1);
        r[0] = a;
    }

    function _addrs(address a, address b) internal pure returns (address[] memory r) {
        r = new address[](2);
        r[0] = a;
        r[1] = b;
    }

    function _addrs(address a, address b, address c) internal pure returns (address[] memory r) {
        r = new address[](3);
        r[0] = a;
        r[1] = b;
        r[2] = c;
    }

    // ─── lifecycle helpers ──────────────────────────────────────────
    function _create(uint16[] memory shares) internal returns (uint256 bountyId) {
        vm.prank(creator);
        bountyId = board.createBounty(TITLE, CONTENT_HASH, REWARD, deadline, shares);
    }

    function _createBounty() internal returns (uint256) {
        return _create(_single());
    }

    function _fund(uint256 bountyId) internal {
        vm.startPrank(creator);
        usdc.approve(address(board), REWARD + POST_FEE);
        board.fundBounty(bountyId);
        vm.stopPrank();
    }

    function _createAndFund(uint16[] memory shares) internal returns (uint256 bountyId) {
        bountyId = _create(shares);
        _fund(bountyId);
    }

    function _createAndFundBounty() internal returns (uint256) {
        return _createAndFund(_single());
    }

    function _submit(uint256 bountyId, address who) internal {
        vm.prank(who);
        board.submitWork(bountyId, SUBMISSION_HASH);
    }

    function _approve(uint256 bountyId, address[] memory winners) internal {
        vm.prank(creator);
        board.approveWinners(bountyId, winners);
    }

    /// @dev funded single-winner bounty approved for alice
    function _approvedSingle() internal returns (uint256 bountyId) {
        bountyId = _createAndFundBounty();
        _submit(bountyId, alice);
        _approve(bountyId, _addrs(alice));
    }

    function _claimFee(uint256 gross) internal pure returns (uint256) {
        return (gross * 500) / 10_000;
    }
}
