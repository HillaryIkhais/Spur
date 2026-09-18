// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "./IERC20.sol";

/// @title SPUR — Machine-Native Economic Obligations for Autonomous Agents on Celo
/// @notice Authorization → Obligation → Execution → Verification → Settlement
/// @notice The obligation itself is the cryptographic root: an on-chain, immutable
///         commitment that every subsequent transition references.
/// @notice Core invariants:
///   I1: No settlement beyond the buyer's bounded authorization.
///   I2: No settlement without the specified delivery being verified.
///   I3: One settlement per authorization.
///   I4: Wrong supplier → blocked.
///   I5: Expired obligation → blocked.
///   I6: Verification failure → $0 settlement.
contract SpurObligation {
    enum Status {
        NONE,        // 0 — uninitialized
        AUTHORIZED,  // 1 — buyer signed, funds locked
        EXECUTING,   // 2 — supplier acknowledged
        SUBMITTED,   // 3 — work delivered
        SETTLED,     // 4 — verified + paid
        REJECTED,    // 5 — verified + $0
        EXPIRED      // 6 — window closed
    }

    struct Obligation {
        address buyer;          // who authorized
        address supplier;       // who must deliver
        address token;          // Celo stablecoin (cUSD, USDC, etc.)
        uint256 maxAmount;      // I1: ceiling — settlement ≤ this
        uint256 expiry;         // unix timestamp; I5: expired → blocked
        bytes32 taskHash;       // commitment to the specific task
        bytes32 conditionHash;  // what the verifier checks against
        Status status;          // lifecycle state
        bytes32 resultHash;     // supplier's delivery hash
        uint256 buyerAgentId;   // ERC-8004 agent identity
        uint256 supplierAgentId;// ERC-8004 agent identity
    }

    address public verifier;            // independent verifier EOA
    uint256 public nextObligationId = 1;

    mapping(uint256 => Obligation) public obligations;

    event ObligationCreated(
        uint256 indexed id,
        address indexed buyer,
        address indexed supplier,
        address token,
        uint256 maxAmount,
        uint256 expiry,
        bytes32 taskHash,
        uint256 buyerAgentId,
        uint256 supplierAgentId
    );
    event WorkSubmitted(uint256 indexed id, bytes32 resultHash);
    event Settled(uint256 indexed id, address indexed supplier, uint256 amount);
    event Rejected(uint256 indexed id, string reason);
    event Expired(uint256 indexed id);

    error OnlyVerifier();
    error OnlySupplier();
    error OnlyBuyer();
    error ZeroAddress();
    error BadParams();
    error WrongStatus();
    error ExpiredError();
    error NotExpired();
    error AlreadyResolved();
    error AmountExceedsCeiling();

    modifier onlyVerifier() {
        if (msg.sender != verifier) revert OnlyVerifier();
        _;
    }

    modifier onlySupplier(uint256 id) {
        if (msg.sender != obligations[id].supplier) revert OnlySupplier();
        _;
    }

    constructor(address _verifier) {
        if (_verifier == address(0)) revert ZeroAddress();
        verifier = _verifier;
    }

    /// @notice Step 1: Buyer creates obligation — locks funds against immutable conditions.
    /// @dev This is the x402 authorization becoming a SPUR obligation.
    ///      The buyer's bounded payment authorization becomes the economic root.
    function createObligation(
        address supplier,
        address token,
        uint256 maxAmount,
        uint256 expirySeconds,
        bytes32 taskHash,
        bytes32 conditionHash,
        uint256 buyerAgentId,
        uint256 supplierAgentId
    ) external returns (uint256 id) {
        if (supplier == address(0) || token == address(0)) revert ZeroAddress();
        if (maxAmount == 0 || expirySeconds == 0) revert BadParams();
        if (taskHash == bytes32(0) || conditionHash == bytes32(0)) revert BadParams();

        id = nextObligationId++;
        uint256 expiry = block.timestamp + expirySeconds;

        obligations[id] = Obligation({
            buyer: msg.sender,
            supplier: supplier,
            token: token,
            maxAmount: maxAmount,
            expiry: expiry,
            taskHash: taskHash,
            conditionHash: conditionHash,
            status: Status.AUTHORIZED,
            resultHash: bytes32(0),
            buyerAgentId: buyerAgentId,
            supplierAgentId: supplierAgentId
        });

        // I1: Lock the buyer's bounded authorization.
        require(IERC20(token).transferFrom(msg.sender, address(this), maxAmount), "FUND_FAILED");

        emit ObligationCreated(
            id, msg.sender, supplier, token, maxAmount, expiry, taskHash, buyerAgentId, supplierAgentId
        );
    }

    /// @notice Step 2: Supplier acknowledges the obligation — no funds move.
    function acknowledge(uint256 id) external {
        Obligation storage o = obligations[id];
        if (o.status != Status.AUTHORIZED) revert WrongStatus();
        if (msg.sender != o.supplier) revert OnlySupplier();
        if (block.timestamp > o.expiry) revert ExpiredError();
        o.status = Status.EXECUTING;
    }

    /// @notice Step 3: Supplier submits work — hash of the deliverable.
    function submitWork(uint256 id, bytes32 resultHash) external {
        Obligation storage o = obligations[id];
        if (o.status != Status.EXECUTING) revert WrongStatus();
        if (msg.sender != o.supplier) revert OnlySupplier();
        if (block.timestamp > o.expiry) revert ExpiredError();
        if (resultHash == bytes32(0)) revert BadParams();
        o.status = Status.SUBMITTED;
        o.resultHash = resultHash;
        emit WorkSubmitted(id, resultHash);
    }

    /// @notice Step 4: Verifier evaluates and settles or blocks.
    /// @dev ONLY the deterministic verifier can settle. This is the enforcement point.
    ///      I2: No settlement without verification. I3: One settlement per authorization.
    ///      I6: Bad work → $0 settlement (rejected, funds return to buyer).
    function resolve(uint256 id, bool satisfied, string calldata reason) external onlyVerifier {
        Obligation storage o = obligations[id];
        if (o.status != Status.SUBMITTED) revert WrongStatus();
        if (block.timestamp > o.expiry) {
            o.status = Status.EXPIRED;
            require(IERC20(o.token).transfer(o.buyer, o.maxAmount), "REFUND_FAILED");
            emit Expired(id);
            return;
        }
        if (satisfied) {
            o.status = Status.SETTLED;
            require(IERC20(o.token).transfer(o.supplier, o.maxAmount), "SETTLE_FAILED");
            emit Settled(id, o.supplier, o.maxAmount);
        } else {
            o.status = Status.REJECTED;
            require(IERC20(o.token).transfer(o.buyer, o.maxAmount), "REFUND_FAILED");
            emit Rejected(id, reason);
        }
    }

    /// @notice Permissionless: anyone can expire a stale obligation after its window.
    function expireObligation(uint256 id) external {
        Obligation storage o = obligations[id];
        if (o.status != Status.AUTHORIZED && o.status != Status.EXECUTING) revert AlreadyResolved();
        if (block.timestamp <= o.expiry) revert NotExpired();
        o.status = Status.EXPIRED;
        require(IERC20(o.token).transfer(o.buyer, o.maxAmount), "REFUND_FAILED");
        emit Expired(id);
    }

    /// @notice Read the full obligation state.
    function getObligation(uint256 id) external view returns (Obligation memory) {
        return obligations[id];
    }
}
