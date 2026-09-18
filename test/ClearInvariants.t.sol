// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ClearObligations} from "../contracts/ClearObligations.sol";
import {IERC20} from "../contracts/IERC20.sol";

contract MockStable3 is IERC20 {
    mapping(address => uint256) public bal;
    mapping(address => mapping(address => uint256)) public allow;

    function mint(address to, uint256 amt) external {
        bal[to] += amt;
    }

    function approve(address s, uint256 amt) external returns (bool) {
        allow[msg.sender][s] = amt;
        return true;
    }

    function transferFrom(address f, address t, uint256 amt) external returns (bool) {
        require(bal[f] >= amt, "BAL");
        require(allow[f][msg.sender] >= amt, "ALLOW");
        allow[f][msg.sender] -= amt;
        bal[f] -= amt;
        bal[t] += amt;
        return true;
    }

    function transfer(address t, uint256 amt) external returns (bool) {
        require(bal[msg.sender] >= amt, "BAL");
        bal[msg.sender] -= amt;
        bal[t] += amt;
        return true;
    }
}

/// @notice Fuzzed economic invariants I1–I6. I7/I8 (result binding) are
///         enforced off-chain in verifier/evidence.ts and proven live in
///         the attack lab, where the binding check executes per attack.
contract ClearInvariantsTest is Test {
    ClearObligations c;
    MockStable3 usdt;
    address buyer = address(0xA001);
    address b = address(0xB002);
    address cc = address(0xC003);
    address verifier = address(0x9E81);

    bytes32 constant SCHEMA = keccak256("SCHEMA:FXv1");
    bytes32 constant EVIDENCE = keccak256("EVIDENCE:3src");
    bytes32 constant METHODS = keccak256("METHODS:readonly");

    function setUp() public {
        c = new ClearObligations(verifier);
        usdt = new MockStable3();
        address[4] memory actors = [buyer, b, cc, address(0xD004)];
        for (uint256 i = 0; i < actors.length; i++) {
            usdt.mint(actors[i], 100 ether);
            vm.prank(actors[i]);
            usdt.approve(address(c), type(uint256).max);
        }
    }

    function _root() internal returns (uint256 id) {
        vm.prank(buyer);
        id = c.createObligation(b, address(usdt), 1 ether, 100, 120, 300, SCHEMA, EVIDENCE, METHODS, 2, 1);
    }

    function _fields(uint256 id)
        internal
        view
        returns (uint256 amount, uint256 count, uint256 maxAge, uint256 expiry, bytes32 schema, bytes32 evidence, bytes32 methods)
    {
        (,,,,, amount, count, maxAge, expiry, schema, evidence, methods,,,,,) = c.obligations(id);
    }

    /// I1 + I2 — non-widening delegation + budget monotonicity, fuzzed amounts.
    function testFuzz_delegateNeverWeakens(uint256 childAmount) public {
        childAmount = bound(childAmount, 1, 3 ether);
        uint256 root = _root();
        if (childAmount > 1 ether) {
            vm.prank(b);
            vm.expectRevert(
                abi.encodeWithSelector(ClearObligations.WeakenedDelegation.selector, "amount")
            );
            c.delegate(root, cc, childAmount, 3);
            return;
        }
        vm.prank(b);
        uint256 child = c.delegate(root, cc, childAmount, 3);
        (uint256 pAmt,,,,,,) = _fields(root);
        (uint256 cAmt, uint256 cCount, uint256 cAge, uint256 cExp, bytes32 cSch, bytes32 cEvi, bytes32 cMet) =
            _fields(child);
        assertLe(cAmt, pAmt, "I2: child budget exceeds parent");
        assertEq(cCount, 100, "I1: count changed");
        assertEq(cAge, 120, "I1: freshness weakened");
        assertEq(cExp, block.timestamp + 300, "I3: deadline extended");
        assertEq(cSch, SCHEMA, "I1: schema respec");
        assertEq(cEvi, EVIDENCE, "I1: evidence weakened");
        assertEq(cMet, METHODS, "I1: method escape");
    }

    /// I3 — deadline monotonicity under arbitrary time warp before delegation.
    function testFuzz_deadlineMonotonic(uint256 warpSec) public {
        warpSec = bound(warpSec, 0, 299);
        uint256 root = _root();
        vm.warp(block.timestamp + warpSec);
        vm.prank(b);
        uint256 child = c.delegate(root, cc, 0.5 ether, 3);
        (,,, uint256 pExp,,,) = _fields(root);
        (,,, uint256 cExp,,,) = _fields(child);
        assertLe(cExp, pExp, "I3: child expiry beyond parent");
    }

    /// I4 — verifier separation: no non-verifier caller can resolve, fuzzed caller.
    function testFuzz_verifierSeparation(address caller) public {
        vm.assume(caller != verifier);
        vm.assume(caller != address(0));
        uint256 root = _root();
        vm.prank(b);
        c.submitWork(root, keccak256("R"));
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(ClearObligations.OnlyVerifier.selector));
        c.resolve(root, true, "self-approved");
    }

    /// I5 — settlement uniqueness: second resolve always reverts, any flag combo.
    function testFuzz_settlementUnique(bool first, bool second) public {
        uint256 root = _root();
        vm.prank(b);
        c.submitWork(root, keccak256("R"));
        vm.prank(verifier);
        c.resolve(root, first, "first");
        vm.prank(verifier);
        vm.expectRevert();
        c.resolve(root, second, "replay");
    }

    /// I6 — immutable acceptance criteria across the full lifecycle.
    function testFuzz_criteriaImmutable(bytes32 resultHash) public {
        vm.assume(resultHash != bytes32(0));
        uint256 root = _root();
        (uint256 a0, uint256 c0, uint256 m0, uint256 e0, bytes32 s0, bytes32 v0, bytes32 h0) = _fields(root);
        vm.prank(b);
        c.submitWork(root, resultHash);
        vm.prank(verifier);
        c.resolve(root, true, "ok");
        (uint256 a1, uint256 c1, uint256 m1, uint256 e1, bytes32 s1, bytes32 v1, bytes32 h1) = _fields(root);
        assertEq(a1, a0, "I6: amount mutated");
        assertEq(c1, c0, "I6: count mutated");
        assertEq(m1, m0, "I6: freshness mutated");
        assertEq(e1, e0, "I6: expiry mutated");
        assertEq(s1, s0, "I6: schema mutated");
        assertEq(v1, v0, "I6: evidence mutated");
        assertEq(h1, h0, "I6: methods mutated");
    }

    /// Delegation depth is bounded: chain of 5 children ok, 6th reverts.
    function test_delegationDepthBounded() public {
        uint256 parent = _root();
        address provider = b;
        for (uint256 i = 0; i < 5; i++) {
            address sub = address(uint160(0xE000 + i));
            usdt.mint(provider, 1 ether);
            vm.prank(provider);
            usdt.approve(address(c), type(uint256).max);
            vm.prank(provider);
            parent = c.delegate(parent, sub, 0.1 ether, 10 + i);
            provider = sub;
        }
        usdt.mint(provider, 1 ether);
        vm.prank(provider);
        usdt.approve(address(c), type(uint256).max);
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(ClearObligations.MaxDepth.selector));
        c.delegate(parent, address(0xFFFF), 0.1 ether, 99);
    }
}
