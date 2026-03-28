// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import "./CitizenRegistry.sol";

/**
 * @title AnonymousGovernor
 * @notice Privacy-preserving DAO governance using Semaphore zero-knowledge proofs
 * @dev Extends OpenZeppelin Governor with anonymous voting via Semaphore
 *
 * Key Features:
 * - Anonymous proposal creation: Prove citizenship without revealing identity
 * - Anonymous voting: Cast votes via ZK proofs
 * - Double-vote prevention: Nullifiers ensure one vote per proposal per citizen
 * - Compatible with OpenZeppelin governance ecosystem
 * - Timelock integration for secure execution
 *
 * Voting Options:
 * 0 = Against, 1 = For, 2 = Abstain
 *
 * Flow:
 * 1. Citizen generates ZK proof of citizenship from CitizenRegistry
 * 2. Citizen calls proposeAnonymous() with proof to create proposal
 * 3. After voting delay, citizens cast anonymous votes with ZK proofs
 * 4. Each proof includes unique nullifier preventing double-voting
 * 5. If quorum + majority reached, proposal can be executed
 */
contract AnonymousGovernor is Governor, GovernorSettings, GovernorTimelockControl, Ownable {
    /// @notice Semaphore contract for proof verification
    ISemaphore public semaphore;

    /// @notice CitizenRegistry contract
    CitizenRegistry public citizenRegistry;

    /// @notice The Semaphore group ID for verified citizens
    uint256 public citizenGroupId;

    /// @notice Quorum required (percentage, e.g., 10 = 10%)
    uint256 public quorumPercentage;

    /// @notice Support threshold (percentage votes For vs total votes, e.g., 51 = 51%)
    uint256 public supportThreshold;

    /// @notice Proposal counter
    uint256 private _proposalCounter;

    /// @notice Mapping of proposal ID to vote counts
    mapping(uint256 => VoteCounts) public proposalVotes;

    /// @notice Mapping of nullifier to prevent double-voting
    mapping(uint256 => mapping(uint256 => bool)) public usedNullifiers; // proposalId => nullifier => used

    /// @notice Mapping of proposal ID to external nullifier (unique per proposal)
    mapping(uint256 => uint256) public proposalNullifiers;

    /// @notice Vote counts struct
    struct VoteCounts {
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
    }

    /// Events
    event AnonymousVoteCast(
        uint256 indexed proposalId,
        uint256 nullifier,
        uint8 support,
        string reason
    );
    event AnonymousProposalCreated(uint256 indexed proposalId, uint256 nullifier);
    event QuorumUpdated(uint256 oldQuorum, uint256 newQuorum);
    event SupportThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    /**
     * @notice Constructor
     * @param _semaphore Address of Semaphore contract
     * @param _citizenRegistry Address of CitizenRegistry contract
     * @param _citizenGroupId Semaphore group ID for citizens
     * @param _timelock Address of TimelockController (or address(0))
     * @param _votingDelay Voting delay in seconds (e.g., 86400 = 1 day)
     * @param _votingPeriod Voting period in seconds (e.g., 604800 = 7 days)
     * @param _proposalThreshold Minimum votes needed to propose (always 1 for anonymous)
     * @param _quorumPercentage Quorum percentage (e.g., 10 = 10%)
     * @param _supportThreshold Support threshold percentage (e.g., 51 = 51%)
     * @param _owner Contract owner
     */
    constructor(
        address _semaphore,
        address _citizenRegistry,
        uint256 _citizenGroupId,
        TimelockController _timelock,
        uint256 _votingDelay,
        uint256 _votingPeriod,
        uint256 _proposalThreshold,
        uint256 _quorumPercentage,
        uint256 _supportThreshold,
        address _owner
    )
        Governor("Anonymous HomeTown DAO")
        GovernorSettings(_votingDelay, _votingPeriod, _proposalThreshold)
        GovernorTimelockControl(_timelock)
    {
        require(_semaphore != address(0), "Invalid Semaphore address");
        require(_citizenRegistry != address(0), "Invalid CitizenRegistry address");
        require(_quorumPercentage > 0 && _quorumPercentage <= 100, "Invalid quorum");
        require(_supportThreshold > 0 && _supportThreshold <= 100, "Invalid support threshold");
        require(_owner != address(0), "Invalid owner address");

        semaphore = ISemaphore(_semaphore);
        citizenRegistry = CitizenRegistry(_citizenRegistry);
        citizenGroupId = _citizenGroupId;
        quorumPercentage = _quorumPercentage;
        supportThreshold = _supportThreshold;
        _transferOwnership(_owner);
    }

    /**
     * @notice Create a proposal anonymously using Semaphore proof
     * @param targets Array of target addresses for proposal actions
     * @param values Array of ETH values for each action
     * @param calldatas Array of calldata for each action
     * @param description Proposal description
     * @param merkleTreeDepth Depth of merkle tree proof
     * @param merkleTreeRoot Merkle tree root
     * @param nullifier Nullifier for this proposal (prevents reuse)
     * @param message Hash binding proof to this proposal
     * @param merkleTreeSiblings Merkle proof siblings
     * @param points Proof points
     * @return uint256 Proposal ID
     */
    function proposeAnonymous(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        uint256 merkleTreeDepth,
        uint256 merkleTreeRoot,
        uint256 nullifier,
        uint256 message,
        uint256[] calldata merkleTreeSiblings,
        uint256[8] calldata points
    ) public returns (uint256) {
        // Verify the Semaphore proof
        ISemaphore.SemaphoreProof memory proof = ISemaphore.SemaphoreProof({
            merkleTreeDepth: merkleTreeDepth,
            merkleTreeRoot: merkleTreeRoot,
            nullifier: nullifier,
            message: message,
            scope: citizenGroupId,
            points: points
        });

        semaphore.validateProof(citizenGroupId, proof);

        // Create the proposal
        uint256 proposalId = propose(targets, values, calldatas, description);

        // Store unique external nullifier for this proposal
        proposalNullifiers[proposalId] = uint256(keccak256(abi.encodePacked(proposalId, block.timestamp)));

        emit AnonymousProposalCreated(proposalId, nullifier);

        return proposalId;
    }

    /**
     * @notice Cast an anonymous vote using Semaphore proof
     * @param proposalId The proposal ID to vote on
     * @param support Vote type: 0=Against, 1=For, 2=Abstain
     * @param reason Optional reason string
     * @param merkleTreeDepth Depth of merkle tree proof
     * @param merkleTreeRoot Merkle tree root
     * @param nullifier Unique nullifier (prevents double-voting)
     * @param message Hash binding proof to this vote
     * @param merkleTreeSiblings Merkle proof siblings
     * @param points Proof points
     * @return uint256 Vote weight (always 1 for anonymous votes)
     */
    function castVoteAnonymous(
        uint256 proposalId,
        uint8 support,
        string calldata reason,
        uint256 merkleTreeDepth,
        uint256 merkleTreeRoot,
        uint256 nullifier,
        uint256 message,
        uint256[] calldata merkleTreeSiblings,
        uint256[8] calldata points
    ) public returns (uint256) {
        require(state(proposalId) == ProposalState.Active, "Voting is not active");
        require(support <= 2, "Invalid vote type");
        require(!usedNullifiers[proposalId][nullifier], "Already voted on this proposal");

        // Verify message binds to this specific proposal and vote
        _verifyVoteMessage(proposalId, support, message);

        // Verify the Semaphore proof
        _verifySemaphoreProof(merkleTreeDepth, merkleTreeRoot, nullifier, message, points);

        // Mark nullifier as used for this proposal
        usedNullifiers[proposalId][nullifier] = true;

        // Record vote
        _recordVote(proposalId, support);

        emit AnonymousVoteCast(proposalId, nullifier, support, reason);

        return 1; // Each vote has weight of 1
    }

    /**
     * @notice Verify the message binds to the specific proposal and vote
     */
    function _verifyVoteMessage(uint256 proposalId, uint8 support, uint256 message) internal view {
        uint256 proposalNullifier = proposalNullifiers[proposalId];
        uint256 expectedMessage = uint256(
            keccak256(abi.encodePacked(proposalId, support, proposalNullifier))
        ) % 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        require(message == expectedMessage, "Invalid message for this vote");
    }

    /**
     * @notice Verify the Semaphore proof
     */
    function _verifySemaphoreProof(
        uint256 merkleTreeDepth,
        uint256 merkleTreeRoot,
        uint256 nullifier,
        uint256 message,
        uint256[8] calldata points
    ) internal {
        ISemaphore.SemaphoreProof memory proof = ISemaphore.SemaphoreProof({
            merkleTreeDepth: merkleTreeDepth,
            merkleTreeRoot: merkleTreeRoot,
            nullifier: nullifier,
            message: message,
            scope: citizenGroupId,
            points: points
        });

        semaphore.validateProof(citizenGroupId, proof);
    }

    /**
     * @notice Record the vote
     */
    function _recordVote(uint256 proposalId, uint8 support) internal {
        VoteCounts storage votes = proposalVotes[proposalId];
        if (support == 0) {
            votes.againstVotes += 1;
        } else if (support == 1) {
            votes.forVotes += 1;
        } else {
            votes.abstainVotes += 1;
        }
    }

    /**
     * @notice Check if proposal has reached quorum (internal)
     * @param proposalId The proposal ID
     * @return bool True if quorum reached
     */
    function _quorumReached(uint256 proposalId) internal view override returns (bool) {
        VoteCounts memory votes = proposalVotes[proposalId];
        uint256 totalVotes = votes.forVotes + votes.againstVotes + votes.abstainVotes;
        uint256 totalCitizens = citizenRegistry.citizenCount();

        if (totalCitizens == 0) return false;

        uint256 quorumVotes = (totalCitizens * quorumPercentage) / 100;
        return totalVotes >= quorumVotes;
    }

    /**
     * @notice Get the quorum required at a specific timepoint
     * @param timepoint The block number to check quorum at
     * @return uint256 The number of votes required for quorum
     */
    function quorum(uint256 timepoint) public view override returns (uint256) {
        uint256 totalCitizens = citizenRegistry.citizenCount();
        return (totalCitizens * quorumPercentage) / 100;
    }

    /**
     * @notice Check if proposal has succeeded (majority support)
     * @param proposalId The proposal ID
     * @return bool True if proposal succeeded
     */
    function _voteSucceeded(uint256 proposalId) internal view override returns (bool) {
        VoteCounts memory votes = proposalVotes[proposalId];

        // Abstain doesn't count toward success calculation
        uint256 totalVotes = votes.forVotes + votes.againstVotes;

        if (totalVotes == 0) return false;

        uint256 supportPercentage = (votes.forVotes * 100) / totalVotes;
        return supportPercentage >= supportThreshold;
    }

    /**
     * @notice Get vote counts for a proposal
     * @param proposalId The proposal ID
     * @return forVotes Number of For votes
     * @return againstVotes Number of Against votes
     * @return abstainVotes Number of Abstain votes
     */
    function proposalVoteCounts(uint256 proposalId)
        public
        view
        returns (
            uint256 forVotes,
            uint256 againstVotes,
            uint256 abstainVotes
        )
    {
        VoteCounts memory votes = proposalVotes[proposalId];
        return (votes.forVotes, votes.againstVotes, votes.abstainVotes);
    }

    /**
     * @notice Update quorum percentage
     * @param newQuorum New quorum percentage (1-100)
     */
    function updateQuorum(uint256 newQuorum) external onlyOwner {
        require(newQuorum > 0 && newQuorum <= 100, "Invalid quorum");
        uint256 oldQuorum = quorumPercentage;
        quorumPercentage = newQuorum;
        emit QuorumUpdated(oldQuorum, newQuorum);
    }

    /**
     * @notice Update support threshold
     * @param newThreshold New support threshold (1-100)
     */
    function updateSupportThreshold(uint256 newThreshold) external onlyOwner {
        require(newThreshold > 0 && newThreshold <= 100, "Invalid threshold");
        uint256 oldThreshold = supportThreshold;
        supportThreshold = newThreshold;
        emit SupportThresholdUpdated(oldThreshold, newThreshold);
    }

    // Required overrides for OpenZeppelin Governor

    function votingDelay() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(IGovernor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }

    function COUNTING_MODE() public pure override returns (string memory) {
        return "support=bravo&quorum=for,abstain";
    }

    function hasVoted(uint256 proposalId, address account) public view override returns (bool) {
        // In anonymous voting, we can't track by address
        // This function is not meaningful in the anonymous context
        return false;
    }

    function _countVote(
        uint256 proposalId,
        address account,
        uint8 support,
        uint256 weight,
        bytes memory params
    ) internal override {
        // Vote counting is handled in castVoteAnonymous
        // This function is not used in anonymous voting
        revert("Use castVoteAnonymous instead");
    }

    function _getVotes(
        address account,
        uint256 timepoint,
        bytes memory params
    ) internal view override returns (uint256) {
        // In anonymous voting, votes are not tied to addresses
        // Each valid proof counts as 1 vote
        return 1;
    }

    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function _execute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor() internal view override(Governor, GovernorTimelockControl) returns (address) {
        return super._executor();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
