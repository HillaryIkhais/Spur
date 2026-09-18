// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ClearSettlement} from "../contracts/ClearSettlement.sol";
import {IERC20} from "../contracts/IERC20.sol";

contract MockStable is IERC20 {
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

contract ClearSettlementTest is Test {
    ClearSettlement c;
    MockStable usdt;
    address buyer = address(0xB001);
    address seller = address(0xBE11);
    address verifier = address(0x9E81);
    address attacker = address(0xBAD);

    function setUp() public {
        vm.prank(address(this));
        c = new ClearSettlement(verifier);
        usdt = new MockStable();
        usdt.mint(buyer, 100 ether);
        vm.prank(buyer);
        usdt.approve(address(c), type(uint256).max);
    }

    function _commit() internal returns (uint256 id) {
        vm.prank(buyer);
        id = c.createCommitment(seller, address(usdt), 0.06 ether, keccak256("SPEC:100xUSD/NGN<60s"), 120, 1, 103);
    }

    function test_happy_path_settles() public {
        uint256 id = _commit();
        vm.prank(seller);
        c.submitWork(id, keccak256("RESULT"));
        vm.prank(verifier);
        c.resolve(id, true, "all checks passed");
        assertEq(uint256(_status(id)), uint256(ClearSettlement.Status.SETTLED));
        assertEq(usdt.bal(seller), 0.06 ether);
    }

    function test_attack1_incomplete_blocked() public {
        // Verifier rejects 73/100 — funds return to buyer, seller gets 0.
        uint256 id = _commit();
        vm.prank(seller);
        c.submitWork(id, keccak256("73-records"));
        vm.prank(verifier);
        c.resolve(id, false, "count: 73 / 100 records");
        assertEq(usdt.bal(seller), 0);
        assertEq(usdt.bal(buyer), 100 ether);
    }

    function test_attack4_requirement_mutation_impossible() public {
        // No setter exists: requirementsHash is immutable. This test asserts
        // the stored hash matches the spec agreed at funding time.
        uint256 id = _commit();
        assertTrue(_req(id) == keccak256("SPEC:100xUSD/NGN<60s"));
        // There is simply no `updateRequirements` to call — by design.
    }

    function test_attack5_no_double_settle() public {
        uint256 id = _commit();
        vm.prank(seller);
        c.submitWork(id, keccak256("RESULT"));
        vm.prank(verifier);
        c.resolve(id, true, "ok");
        vm.prank(verifier);
        vm.expectRevert();
        c.resolve(id, true, "replay");
    }

    function test_attack6_seller_cannot_self_verify() public {
        uint256 id = _commit();
        vm.prank(seller);
        c.submitWork(id, keccak256("RESULT"));
        vm.prank(seller); // attacker = seller trying to release own payment
        vm.expectRevert(abi.encodeWithSelector(ClearSettlement.OnlyVerifier.selector));
        c.resolve(id, true, "self-approved");
    }

    function test_attack7_timeout_refunds() public {
        uint256 id = _commit();
        vm.warp(block.timestamp + 121);
        c.expire(id);
        assertEq(usdt.bal(buyer), 100 ether);
    }

    function test_nonSeller_cannot_submit() public {
        uint256 id = _commit();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(ClearSettlement.OnlySeller.selector));
        c.submitWork(id, keccak256("FORGED"));
    }

    function _status(uint256 id) internal view returns (ClearSettlement.Status st) {
        (, , , , , , st, , , ) = c.commitments(id);
    }

    function _req(uint256 id) internal view returns (bytes32 req) {
        (, , , , req, , , , , ) = c.commitments(id);
    }
}
