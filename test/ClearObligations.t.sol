// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ClearObligations} from "../contracts/ClearObligations.sol";
import {IERC20} from "../contracts/IERC20.sol";

contract MockStable2 is IERC20 {
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

contract ClearObligationsTest is Test {
    ClearObligations c;
    MockStable2 usdt;
    address buyer = address(0xA001); // Agent A
    address b = address(0xB002); // Agent B (accepts, delegates)
    address cc = address(0xC003); // Agent C (sub-provider)
    address verifier = address(0x9E81);

    bytes32 constant SCHEMA = keccak256("SCHEMA:FXv1{pair,rate,ts,source}");
    bytes32 constant EVIDENCE = keccak256("EVIDENCE:3src+provenance+freshness");
    bytes32 constant METHODS = keccak256("METHODS:cbn+parallel+binance,readonly");

    function setUp() public {
        c = new ClearObligations(verifier);
        usdt = new MockStable2();
        usdt.mint(buyer, 10 ether);
        usdt.mint(b, 10 ether);
        vm.prank(buyer);
        usdt.approve(address(c), type(uint256).max);
        vm.prank(b);
        usdt.approve(address(c), type(uint256).max);
    }

    function _root() internal returns (uint256 id) {
        vm.prank(buyer);
        id = c.createObligation(b, address(usdt), 1 ether, 100, 120, 300, SCHEMA, EVIDENCE, METHODS, 2, 1);
    }

    function test_chain_settles_and_reputation_accrues() public {
        uint256 root = _root();
        vm.prank(b);
        uint256 child = c.delegate(root, cc, 0.4 ether, 3);
        // C delivers, verifier confirms, C paid from B's stake
        vm.prank(cc);
        c.submitWork(child, keccak256("C-RESULT"));
        vm.prank(verifier);
        c.resolve(child, true, "satisfies obligation");
        assertEq(usdt.bal(cc), 0.4 ether);
        (uint64 done, , , uint256 earned, ) = c.reputation(3);
        assertEq(done, 1);
        assertEq(earned, 0.4 ether);
        // B then delivers root result, root settles: B nets the spread
        vm.prank(b);
        c.submitWork(root, keccak256("B-RESULT"));
        vm.prank(verifier);
        c.resolve(root, true, "satisfies obligation");
        assertEq(usdt.bal(b), 10 ether - 0.4 ether + 1 ether);
    }

    function test_delegation_cannot_weaken_amount() public {
        uint256 root = _root();
        vm.prank(b);
        // amount > parent must revert — C cannot be promised more than A staked
        vm.expectRevert(
            abi.encodeWithSelector(ClearObligations.WeakenedDelegation.selector, "amount")
        );
        c.delegate(root, cc, 1.01 ether, 3);
    }

    function test_child_inherits_bounds_verbatim() public {
        uint256 root = _root();
        vm.prank(b);
        uint256 child = c.delegate(root, cc, 0.4 ether, 3);
        (
            ,
            ,
            ,
            ,
            ,
            ,
            uint256 count,
            uint256 maxAge,
            ,
            bytes32 schema,
            bytes32 evidence,
            bytes32 methods,
            ,
            ,
            ,
            ,
        ) = c.obligations(child);
        assertEq(count, 100);
        assertEq(maxAge, 120);
        assertTrue(schema == SCHEMA);
        assertTrue(evidence == EVIDENCE);
        assertTrue(methods == METHODS);
    }

    function test_stranger_cannot_delegate_parents_job() public {
        uint256 root = _root();
        vm.prank(cc); // C never held the root obligation
        vm.expectRevert(abi.encodeWithSelector(ClearObligations.NotParentProvider.selector));
        c.delegate(root, address(0xD004), 0.1 ether, 4);
    }

    function test_rejection_records_reputation_and_refunds() public {
        uint256 root = _root();
        vm.prank(b);
        c.submitWork(root, keccak256("FABRICATED"));
        vm.prank(verifier);
        c.resolve(root, false, "PROOF != OBLIGATION: provenance missing");
        (, uint64 rej, , , uint256 disputed) = c.reputation(2);
        assertEq(rej, 1);
        assertEq(disputed, 1 ether);
        assertEq(usdt.bal(buyer), 10 ether); // refunded
    }

    function test_chain_query_returns_root_to_leaf() public {
        uint256 root = _root();
        vm.prank(b);
        uint256 child = c.delegate(root, cc, 0.4 ether, 3);
        uint256[] memory chain = c.obligationChain(child);
        assertEq(chain.length, 2);
        assertEq(chain[0], root);
        assertEq(chain[1], child);
    }
}
