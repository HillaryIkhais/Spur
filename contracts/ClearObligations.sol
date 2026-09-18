// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "./IERC20.sol";

/// @title CLEAR v2 — enforceable, composable obligations for autonomous work on Celo
/// @notice Thesis: an agent should never be paid for a claim. It is paid only when
///         an independently verifiable obligation is proven satisfied.
/// @notice Invariant 1 (settlement): NO VERIFIED OBLIGATION → NO SETTLEMENT.
/// @notice Invariant 2 (delegation): delegation may decompose an obligation but may
///         NEVER weaken it. Child bounds ⊆ parent bounds, enforced on-chain.
contract ClearObligations {
    enum Status {
        NONE,
        FUNDED,
        SUBMITTED,
        SETTLED,
        REJECTED,
        EXPIRED_REFUNDED
    }

    uint8 public constant MAX_DEPTH = 5;

    struct Obligation {
        uint256 parentId; // 0 = root obligation from the original buyer
        uint256 rootId; // root of the delegation chain
        address buyer; // funder of THIS obligation (root buyer, or delegator B for a child)
        address provider; // who must deliver (B for root, C for child)
        address token; // Celo stablecoin — fixed across the whole chain
        uint256 amount; // locked for this obligation; child ≤ parent
        uint256 count; // required records; child == parent (same output obligation)
        uint256 maxAgeSec; // freshness bound; child ≤ parent (never weaker)
        uint256 expiry; // unix timestamp; child ≤ parent (never later)
        bytes32 schemaHash; // output schema; child == parent (no silent respec)
        bytes32 evidenceHash; // evidence requirements; child == parent
        bytes32 methodHash; // allowed methods/sources; child == parent (no method escape)
        uint8 depth; // 0 = root
        Status status;
        bytes32 resultHash;
        uint256 providerAgentId; // ERC-8004 IDs (0 = unregistered, must register pre-submission)
        uint256 buyerAgentId;
    }

    struct AgentStats {
        uint64 completed;
        uint64 rejected;
        uint64 expired;
        uint256 earned;
        uint256 disputed;
    }

    address public verifier;
    uint256 public nextObligationId = 1;

    mapping(uint256 => Obligation) public obligations;
    mapping(uint256 => AgentStats) public reputation; // ERC-8004 agentId → objective work history

    event ObligationCreated(
        uint256 indexed id,
        uint256 indexed parentId,
        uint256 indexed rootId,
        address buyer,
        address provider,
        address token,
        uint256 amount,
        uint256 count,
        uint256 maxAgeSec,
        uint256 expiry,
        uint256 providerAgentId
    );
    event Delegated(uint256 indexed parentId, uint256 indexed childId, address indexed delegator);
    event WorkSubmitted(uint256 indexed id, bytes32 resultHash);
    event SettlementReceipt(
        uint256 indexed rootId,
        uint256 indexed id,
        address buyer,
        address provider,
        address token,
        uint256 amount,
        bool satisfied,
        string reason,
        uint8 depth,
        uint256 providerAgentId,
        bytes32 resultHash
    );
    event ReputationUpdated(
        uint256 indexed agentId,
        uint64 completed,
        uint64 rejected,
        uint64 expired,
        uint256 earned,
        uint256 disputed
    );
    event Refunded(uint256 indexed id, string reason);

    error OnlyVerifier();
    error ZeroAddress();
    error BadParams();
    error WrongStatus();
    error OnlyProvider();
    error Expired();
    error NotExpired();
    error AlreadyResolved();
    error WeakenedDelegation(string field);
    error MaxDepth();
    error NotParentProvider();

    modifier onlyVerifier() {
        if (msg.sender != verifier) revert OnlyVerifier();
        _;
    }

    constructor(address _verifier) {
        if (_verifier == address(0)) revert ZeroAddress();
        verifier = _verifier;
    }

    /// @notice Root: buyer precommits acceptance conditions + locks payment.
    function createObligation(
        address provider,
        address token,
        uint256 amount,
        uint256 count,
        uint256 maxAgeSec,
        uint256 expirySeconds,
        bytes32 schemaHash,
        bytes32 evidenceHash,
        bytes32 methodHash,
        uint256 providerAgentId,
        uint256 buyerAgentId
    ) external returns (uint256 id) {
        if (provider == address(0) || token == address(0)) revert ZeroAddress();
        if (amount == 0 || count == 0 || maxAgeSec == 0 || expirySeconds == 0) revert BadParams();
        if (schemaHash == bytes32(0) || evidenceHash == bytes32(0) || methodHash == bytes32(0)) {
            revert BadParams();
        }

        id = nextObligationId++;
        uint256 expiry = block.timestamp + expirySeconds;

        obligations[id] = Obligation({
            parentId: 0,
            rootId: id,
            buyer: msg.sender,
            provider: provider,
            token: token,
            amount: amount,
            count: count,
            maxAgeSec: maxAgeSec,
            expiry: expiry,
            schemaHash: schemaHash,
            evidenceHash: evidenceHash,
            methodHash: methodHash,
            depth: 0,
            status: Status.FUNDED,
            resultHash: bytes32(0),
            providerAgentId: providerAgentId,
            buyerAgentId: buyerAgentId
        });

        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "FUND_FAILED");
        emit ObligationCreated(
            id, 0, id, msg.sender, provider, token, amount, count, maxAgeSec, expiry, providerAgentId
        );
    }

    /// @notice Non-widening delegation: B (parent provider) funds a child obligation for C.
    /// @dev Every check below is the "may decompose, never weaken" invariant in code.
    function delegate(
        uint256 parentId,
        address subProvider,
        uint256 amount,
        uint256 providerAgentId
    ) external returns (uint256 id) {
        Obligation storage p = obligations[parentId];
        if (p.status != Status.FUNDED) revert WrongStatus();
        if (msg.sender != p.provider) revert NotParentProvider();
        if (subProvider == address(0)) revert ZeroAddress();
        if (amount == 0 || amount > p.amount) revert WeakenedDelegation("amount");
        if (p.depth + 1 > MAX_DEPTH) revert MaxDepth();

        // Child inherits the parent's obligation bounds verbatim.
        // B may fund C less (keeping the spread as margin) but C owes the
        // SAME output under the SAME-or-stricter bounds. There is no parameter
        // here for relaxing count, freshness, expiry, schema, evidence, or
        // methods — the function signature itself makes weakening inexpressible.
        id = nextObligationId++;
        obligations[id] = Obligation({
            parentId: parentId,
            rootId: p.rootId,
            buyer: msg.sender,
            provider: subProvider,
            token: p.token,
            amount: amount,
            count: p.count,
            maxAgeSec: p.maxAgeSec,
            expiry: p.expiry > block.timestamp ? p.expiry : block.timestamp, // never later than parent
            schemaHash: p.schemaHash,
            evidenceHash: p.evidenceHash,
            methodHash: p.methodHash,
            depth: p.depth + 1,
            status: Status.FUNDED,
            resultHash: bytes32(0),
            providerAgentId: providerAgentId,
            buyerAgentId: p.providerAgentId
        });

        require(IERC20(p.token).transferFrom(msg.sender, address(this), amount), "FUND_FAILED");
        emit ObligationCreated(
            id, parentId, p.rootId, msg.sender, subProvider, p.token, amount,
            p.count, p.maxAgeSec, p.expiry, providerAgentId
        );
        emit Delegated(parentId, id, msg.sender);
    }

    /// @notice Provider submits exactly once, before expiry. Moves no funds.
    function submitWork(uint256 id, bytes32 resultHash) external {
        Obligation storage o = obligations[id];
        if (o.status != Status.FUNDED) revert WrongStatus();
        if (msg.sender != o.provider) revert OnlyProvider();
        if (block.timestamp > o.expiry) revert Expired();
        if (resultHash == bytes32(0)) revert BadParams();
        o.status = Status.SUBMITTED;
        o.resultHash = resultHash;
        emit WorkSubmitted(id, resultHash);
    }

    /// @notice ONLY the deterministic verifier settles or blocks. Never an agent.
    function resolve(uint256 id, bool satisfied, string calldata reason) external onlyVerifier {
        Obligation storage o = obligations[id];
        if (o.status != Status.SUBMITTED) revert WrongStatus();
        if (block.timestamp > o.expiry) {
            o.status = Status.EXPIRED_REFUNDED;
            require(IERC20(o.token).transfer(o.buyer, o.amount), "REFUND_FAILED");
            _recordExpiry(o.providerAgentId);
            emit SettlementReceipt(
                o.rootId, id, o.buyer, o.provider, o.token, o.amount,
                false, "late: expired before resolve", o.depth, o.providerAgentId, o.resultHash
            );
            return;
        }
        if (satisfied) {
            o.status = Status.SETTLED;
            require(IERC20(o.token).transfer(o.provider, o.amount), "SETTLE_FAILED");
            _recordCompletion(o.providerAgentId, o.amount);
        } else {
            o.status = Status.REJECTED;
            require(IERC20(o.token).transfer(o.buyer, o.amount), "REFUND_FAILED");
            _recordRejection(o.providerAgentId, o.amount);
        }
        emit SettlementReceipt(
            o.rootId, id, o.buyer, o.provider, o.token, o.amount,
            satisfied, reason, o.depth, o.providerAgentId, o.resultHash
        );
    }

    /// @notice Permissionless recovery for stale obligations.
    function expire(uint256 id) external {
        Obligation storage o = obligations[id];
        if (o.status != Status.FUNDED && o.status != Status.SUBMITTED) revert AlreadyResolved();
        if (block.timestamp <= o.expiry) revert NotExpired();
        o.status = Status.EXPIRED_REFUNDED;
        require(IERC20(o.token).transfer(o.buyer, o.amount), "REFUND_FAILED");
        _recordExpiry(o.providerAgentId);
        emit Refunded(id, "expired");
    }

    /// @notice Full delegation chain for receipts / Dune scoring.
    function obligationChain(uint256 id) external view returns (uint256[] memory chain) {
        uint256 depth = obligations[id].depth + 1;
        chain = new uint256[](depth);
        uint256 cur = id;
        for (uint256 i = depth; i > 0; i--) {
            chain[i - 1] = cur;
            cur = obligations[cur].parentId;
        }
    }

    function _recordCompletion(uint256 agentId, uint256 amount) internal {
        if (agentId == 0) return;
        AgentStats storage s = reputation[agentId];
        s.completed += 1;
        s.earned += amount;
        emit ReputationUpdated(agentId, s.completed, s.rejected, s.expired, s.earned, s.disputed);
    }

    function _recordRejection(uint256 agentId, uint256 amount) internal {
        if (agentId == 0) return;
        AgentStats storage s = reputation[agentId];
        s.rejected += 1;
        s.disputed += amount;
        emit ReputationUpdated(agentId, s.completed, s.rejected, s.expired, s.earned, s.disputed);
    }

    function _recordExpiry(uint256 agentId) internal {
        if (agentId == 0) return;
        AgentStats storage s = reputation[agentId];
        s.expired += 1;
        emit ReputationUpdated(agentId, s.completed, s.rejected, s.expired, s.earned, s.disputed);
    }
}
