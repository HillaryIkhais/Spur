// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "./IERC20.sol";

/// @title CLEAR — settlement protocol for autonomous agents on Celo
/// @notice Primitive: INTENT → COMMITMENT → FUND → WORK → PROOF → VERIFY → SETTLE
/// @notice Hard invariant: NO VERIFIED WORK → NO SETTLEMENT.
/// @notice The LLM / agents have ZERO authority over settlement. Only the
///         deterministic verifier key can release or block payment.
contract ClearSettlement {
    enum Status {
        NONE,
        FUNDED,
        SUBMITTED,
        SETTLED,
        REJECTED,
        EXPIRED_REFUNDED
    }

    struct Commitment {
        address buyer;
        address seller;
        address token; // Celo stablecoin: cUSD / cNGN / USDT (USA₮) / wFIAT
        uint256 amount;
        bytes32 requirementsHash; // immutable spec hash (count, schema, freshness, provenance)
        uint256 expiry; // unix timestamp; after this, anyone can trigger refund
        Status status;
        bytes32 resultHash; // set once on submitWork
        uint256 buyerAgentId; // ERC-8004 agent IDs (0 if unregistered, but mainnet submission MUST register)
        uint256 sellerAgentId;
    }

    address public verifier;
    uint256 public nextCommitmentId = 1;

    mapping(uint256 => Commitment) public commitments;

    event CommitmentFunded(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        address token,
        uint256 amount,
        bytes32 requirementsHash,
        uint256 expiry,
        uint256 buyerAgentId,
        uint256 sellerAgentId
    );
    event WorkSubmitted(uint256 indexed id, bytes32 resultHash);
    event Settled(uint256 indexed id, address indexed seller, uint256 amount);
    event Rejected(uint256 indexed id, string reason);
    event Refunded(uint256 indexed id, string reason);

    error OnlyVerifier();
    error BadExpiry();
    error BadAmount();
    error ZeroAddress();
    error WrongStatus(Status expected, Status actual);
    error OnlySeller();
    error Expired();
    error NotExpired();
    error AlreadyResolved();

    modifier onlyVerifier() {
        if (msg.sender != verifier) revert OnlyVerifier();
        _;
    }

    constructor(address _verifier) {
        if (_verifier == address(0)) revert ZeroAddress();
        verifier = _verifier;
    }

    /// @notice Buyer locks stablecoins against an immutable requirements hash.
    function createCommitment(
        address seller,
        address token,
        uint256 amount,
        bytes32 requirementsHash,
        uint256 expirySeconds,
        uint256 buyerAgentId,
        uint256 sellerAgentId
    ) external returns (uint256 id) {
        if (seller == address(0) || token == address(0)) revert ZeroAddress();
        if (amount == 0) revert BadAmount();
        if (expirySeconds == 0) revert BadExpiry();
        if (requirementsHash == bytes32(0)) revert BadExpiry(); // spec must exist

        id = nextCommitmentId++;
        uint256 expiry = block.timestamp + expirySeconds;

        commitments[id] = Commitment({
            buyer: msg.sender,
            seller: seller,
            token: token,
            amount: amount,
            requirementsHash: requirementsHash,
            expiry: expiry,
            status: Status.FUNDED,
            resultHash: bytes32(0),
            buyerAgentId: buyerAgentId,
            sellerAgentId: sellerAgentId
        });

        bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(ok, "FUND_FAILED");

        emit CommitmentFunded(
            id, msg.sender, seller, token, amount, requirementsHash, expiry, buyerAgentId, sellerAgentId
        );
    }

    /// @notice Seller submits exactly once, before expiry. No payment moves here.
    function submitWork(uint256 id, bytes32 resultHash) external {
        Commitment storage c = commitments[id];
        if (c.status != Status.FUNDED) revert WrongStatus(Status.FUNDED, c.status);
        if (msg.sender != c.seller) revert OnlySeller();
        if (block.timestamp > c.expiry) revert Expired();
        if (resultHash == bytes32(0)) revert BadExpiry();

        c.status = Status.SUBMITTED;
        c.resultHash = resultHash;
        emit WorkSubmitted(id, resultHash);
    }

    /// @notice Deterministic verifier — and ONLY the verifier — settles or blocks.
    /// @dev `valid` must come from the off-chain deterministic verifier
    ///      (verifier/verify.ts), never from an LLM. This is the CLASP-grade
    ///      enforcement point: agents cannot mark work verified.
    function resolve(uint256 id, bool valid, string calldata reason) external onlyVerifier {
        Commitment storage c = commitments[id];
        if (c.status != Status.SUBMITTED) revert WrongStatus(Status.SUBMITTED, c.status);
        if (block.timestamp > c.expiry) {
            // Late resolution → refund path, never settle.
            c.status = Status.EXPIRED_REFUNDED;
            bool ok = IERC20(c.token).transfer(c.buyer, c.amount);
            require(ok, "REFUND_FAILED");
            emit Refunded(id, "late: expired before resolve");
            return;
        }
        if (valid) {
            c.status = Status.SETTLED;
            bool ok = IERC20(c.token).transfer(c.seller, c.amount);
            require(ok, "SETTLE_FAILED");
            emit Settled(id, c.seller, c.amount);
        } else {
            c.status = Status.REJECTED;
            // Blocked payment returns to buyer (no burn, no keeper cut).
            bool ok = IERC20(c.token).transfer(c.buyer, c.amount);
            require(ok, "REFUND_FAILED");
            emit Rejected(id, reason);
        }
    }

    /// @notice Permissionless recovery: anyone can expire a stale commitment.
    function expire(uint256 id) external {
        Commitment storage c = commitments[id];
        if (c.status != Status.FUNDED && c.status != Status.SUBMITTED) revert AlreadyResolved();
        if (block.timestamp <= c.expiry) revert NotExpired();
        c.status = Status.EXPIRED_REFUNDED;
        bool ok = IERC20(c.token).transfer(c.buyer, c.amount);
        require(ok, "REFUND_FAILED");
        emit Refunded(id, "expired");
    }

    /// @notice No mutation endpoint exists by design. Requirements are immutable.
    ///         No self-verify, no double-settle, no amount change. Ever.
}
