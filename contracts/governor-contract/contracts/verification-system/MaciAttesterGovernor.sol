// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Governor } from "@openzeppelin/contracts/governance/Governor.sol";
import { GovernorSettings } from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import { GovernorTimelockControl } from "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { Params } from "maci-contracts/contracts/utilities/Params.sol";
import { DomainObjs } from "maci-contracts/contracts/utilities/DomainObjs.sol";
import { IMACI } from "maci-contracts/contracts/interfaces/IMACI.sol";

interface IMACIDeploy {
    function deployPoll(
        uint256 _duration,
        Params.TreeDepths memory _treeDepths,
        DomainObjs.PubKey memory _coordinatorPubKey,
        address _verifier,
        address _vkRegistry,
        DomainObjs.Mode _mode
    ) external;

    function nextPollId() external view returns (uint256);

    function getPoll(uint256 _pollId) external view returns (PollContracts memory);

    struct PollContracts {
        address poll;
        address messageProcessor;
        address tally;
    }
}

interface IAttesterNFT {
    function hasAttesterNFT(address account) external view returns (bool);
}

interface IMACINumSignUps {
    function numSignUps() external view returns (uint256);
}

interface ITallyRead {
    /// @notice Real "results landed on chain" predicate. Non-zero only after
    ///         `addTallyResult` has actually been called for at least one vote option.
    ///         Use this instead of `isTallied()` — that one is `tallyBatchNum *
    ///         5^intStateTreeDepth >= numSignUps`, which is vacuously true (0 >= 0)
    ///         for any poll where `mergeSignups` hasn't been run yet.
    function totalTallyResults() external view returns (uint256);
    function totalSpent() external view returns (uint256);
    function tallyResults(uint256 voteOption) external view returns (uint256 value, bool flag);
}

/// @title MaciAttesterGovernor (MACI v2)
/// @notice DAO governor that uses MACI v2 for private, collusion-resistant voting on Base.
///         Replaces AttesterGovernor (which used GovernorCountingSimple + ERC721Votes).
///
/// VOTING MODEL
/// - Proposal creation is restricted to Attester NFT holders.
/// - Each proposal triggers a fresh MACI v2 Poll. Citizens vote on the Poll directly with
///   encrypted ballots; this Governor's castVote* functions are disabled and revert.
/// - Quorum/success is read from the MACI Tally contract once the off-chain coordinator
///   has submitted the ZK-SNARK tally proof on-chain.
///
/// VOTE OPTION ENCODING
///   0 = Against, 1 = For, 2 = Abstain
///
/// V2 SPECIFICS
/// - The MACI sign-up gatekeeper (one global instance, e.g. stock SignUpTokenGatekeeper bound
///   to CitizenNFT) gates who can sign up. There is no per-poll gatekeeper in v2.
/// - The voice credit proxy (one global instance, e.g. stock ConstantInitialVoiceCreditProxy)
///   issues 1 credit per signup in non-QV mode.
/// - MACI v2 Polls have no voting delay: voting starts at deployPoll() call time and lasts
///   exactly `duration` seconds. We set OZ votingDelay = 0 to align both timers.
/// - The MessageProcessor and Tally are Ownable. Whoever calls MACI.deployPoll() becomes
///   their owner. propose() therefore transfers ownership of MP and Tally to the configured
///   coordinator address (an EOA or Safe operated by the Coordinator Service) so the
///   coordinator can submit proofs without going through this Governor.
///
/// STATE OVERRIDE
/// - Until the OZ deadline elapses: state() = Active.
/// - After the OZ deadline, while the tally is not yet on-chain: state() stays Active for
///   `tallyGracePeriod` seconds to give the coordinator time to post the ZK proof.
/// - Once the Tally is published, _quorumReached / _voteSucceeded resolve the proposal to
///   Succeeded or Defeated based on tally.totalSpent and tally.tallyResults.
contract MaciAttesterGovernor is Governor, GovernorSettings, GovernorTimelockControl {
    IAttesterNFT public immutable attesterNFT;
    address public immutable citizenNFT;
    IMACIDeploy public immutable maci;
    address public immutable verifier;
    address public immutable vkRegistry;

    /// @notice Mutable so governance can rotate a compromised coordinator without redeploying.
    address public coordinator;

    DomainObjs.PubKey public coordinatorPubKey;
    Params.TreeDepths public treeDepths;
    DomainObjs.Mode public mode;
    uint256 public quorumPercentage;
    uint256 public quorumAbsolute;
    uint256 public tallyGracePeriod;

    uint256 public constant VOTE_OPTION_AGAINST = 0;
    uint256 public constant VOTE_OPTION_FOR = 1;
    uint256 public constant VOTE_OPTION_ABSTAIN = 2;

    /// @notice Bounds for the caller-chosen voting period in {proposeWithPeriod}.
    /// Presets (3/5/7 days) sit inside this range; the floor prevents degenerate
    /// near-zero polls. The GovernorSettings default still applies to {propose}.
    uint32 public constant MIN_VOTING_PERIOD = 1 hours;
    uint32 public constant MAX_VOTING_PERIOD = 30 days;

    /// @dev Set only for the duration of a {proposeWithPeriod} call so that
    /// {votingPeriod} returns the caller-chosen value while OZ stores the
    /// proposal deadline, then cleared back to 0. Zero at all other times.
    uint32 private _pendingVotingPeriod;

    struct ProposalPoll {
        uint256 pollId;
        address poll;
        address messageProcessor;
        address tally;
        uint256 deadline;
    }

    mapping(uint256 => ProposalPoll) public proposalPolls;

    error OnlyAttestersCanPropose(address proposer);
    error VotingHappensOnMaciPoll(address poll);
    error VotingPeriodOutOfRange(uint32 votingPeriodSeconds);

    event PollLinked(uint256 indexed proposalId, address poll, address tally, uint256 pollId);
    event ProposalCreatedByAttester(uint256 indexed proposalId, address indexed attester, string description);
    event QuorumPercentageChanged(uint256 oldValue, uint256 newValue);
    event QuorumAbsoluteChanged(uint256 oldValue, uint256 newValue);
    event TallyGracePeriodChanged(uint256 oldValue, uint256 newValue);
    event CoordinatorChanged(address oldValue, address newValue);
    event CoordinatorPubKeyChanged(DomainObjs.PubKey oldValue, DomainObjs.PubKey newValue);

    struct InitArgs {
        IAttesterNFT attesterNFT;
        address citizenNFT;
        IMACIDeploy maci;
        address verifier;
        address vkRegistry;
        address coordinator;
        DomainObjs.PubKey coordinatorPubKey;
        Params.TreeDepths treeDepths;
        DomainObjs.Mode mode;
        TimelockController timelock;
        uint32 votingPeriod;
        uint256 quorumPercentage;
        uint256 quorumAbsolute;
        uint256 tallyGracePeriod;
    }

    constructor(InitArgs memory a)
        Governor("Roebel/Mueritz MACI DAO")
        GovernorSettings(0, a.votingPeriod, 0)
        GovernorTimelockControl(a.timelock)
    {
        attesterNFT = a.attesterNFT;
        citizenNFT = a.citizenNFT;
        maci = a.maci;
        verifier = a.verifier;
        vkRegistry = a.vkRegistry;
        coordinator = a.coordinator;
        coordinatorPubKey = a.coordinatorPubKey;
        treeDepths = a.treeDepths;
        mode = a.mode;
        quorumPercentage = a.quorumPercentage;
        quorumAbsolute = a.quorumAbsolute;
        tallyGracePeriod = a.tallyGracePeriod;
    }

    /// @inheritdoc Governor
    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public override(Governor) returns (uint256) {
        if (!attesterNFT.hasAttesterNFT(msg.sender)) {
            revert OnlyAttestersCanPropose(msg.sender);
        }

        uint256 proposalId = super.propose(targets, values, calldatas, description);
        _deployPollFor(proposalId);

        emit ProposalCreatedByAttester(proposalId, msg.sender, description);
        return proposalId;
    }

    /// @notice Create a proposal with a caller-chosen voting period (within
    /// [MIN_VOTING_PERIOD, MAX_VOTING_PERIOD]). Use this for the 3/5/7-day
    /// presets or any custom duration; plain {propose} keeps the default.
    /// @dev Sets a pending period that {votingPeriod} returns for the duration
    /// of this call, so OZ stores the proposal deadline with it and the MACI
    /// poll inherits the same length (votingDelay = 0 keeps both timers aligned).
    function proposeWithPeriod(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        uint32 votingPeriodSeconds
    ) public returns (uint256) {
        if (votingPeriodSeconds < MIN_VOTING_PERIOD || votingPeriodSeconds > MAX_VOTING_PERIOD) {
            revert VotingPeriodOutOfRange(votingPeriodSeconds);
        }
        _pendingVotingPeriod = votingPeriodSeconds;
        uint256 proposalId = propose(targets, values, calldatas, description);
        _pendingVotingPeriod = 0;
        return proposalId;
    }

    function _deployPollFor(uint256 proposalId) internal {
        uint256 voteEnd = proposalDeadline(proposalId);
        uint256 duration = voteEnd - block.timestamp;

        maci.deployPoll(duration, treeDepths, coordinatorPubKey, verifier, vkRegistry, mode);

        uint256 pollId = maci.nextPollId() - 1;
        IMACIDeploy.PollContracts memory pc = maci.getPoll(pollId);

        Ownable(pc.messageProcessor).transferOwnership(coordinator);
        Ownable(pc.tally).transferOwnership(coordinator);

        proposalPolls[proposalId] = ProposalPoll({
            pollId: pollId,
            poll: pc.poll,
            messageProcessor: pc.messageProcessor,
            tally: pc.tally,
            deadline: voteEnd
        });

        emit PollLinked(proposalId, pc.poll, pc.tally, pollId);
    }

    /// @notice Quorum is the minimum total voice credits spent across all options.
    /// @dev Reads from MACI's signup count rather than CitizenNFT.totalSupply (which the
    ///      Roebel CitizenNFT does not expose — it inherits ERC721 + ERC721Votes, not
    ///      ERC721Enumerable). This means the denominator is "citizens who actually
    ///      registered with MACI" rather than "all citizens"; the absolute floor protects
    ///      against trivially-passable proposals when signup counts are very low.
    function quorum(uint256) public view override returns (uint256) {
        uint256 signups = IMACINumSignUps(address(maci)).numSignUps();
        uint256 fromPercent = (signups * quorumPercentage) / 100;
        return fromPercent < quorumAbsolute ? quorumAbsolute : fromPercent;
    }

    /// @inheritdoc Governor
    function _quorumReached(uint256 proposalId) internal view override returns (bool) {
        address tally = proposalPolls[proposalId].tally;
        if (tally == address(0)) return false;
        if (ITallyRead(tally).totalTallyResults() == 0) return false;
        return ITallyRead(tally).totalSpent() >= quorum(0);
    }

    /// @inheritdoc Governor
    function _voteSucceeded(uint256 proposalId) internal view override returns (bool) {
        address tally = proposalPolls[proposalId].tally;
        if (tally == address(0)) return false;
        if (ITallyRead(tally).totalTallyResults() == 0) return false;
        (uint256 forVotes, ) = ITallyRead(tally).tallyResults(VOTE_OPTION_FOR);
        (uint256 againstVotes, ) = ITallyRead(tally).tallyResults(VOTE_OPTION_AGAINST);
        return forVotes > againstVotes;
    }

    /// @dev We don't snapshot voter weight on chain — voting happens on the MACI Poll.
    function _getVotes(address, uint256, bytes memory) internal pure override returns (uint256) {
        return 0;
    }

    function _countVote(uint256, address, uint8, uint256, bytes memory) internal pure override returns (uint256) {
        revert("MaciAttesterGovernor: counting handled by MACI Tally");
    }

    function castVote(uint256 proposalId, uint8) public override returns (uint256) {
        revert VotingHappensOnMaciPoll(proposalPolls[proposalId].poll);
    }

    function castVoteWithReason(uint256 proposalId, uint8, string calldata) public override returns (uint256) {
        revert VotingHappensOnMaciPoll(proposalPolls[proposalId].poll);
    }

    function castVoteWithReasonAndParams(
        uint256 proposalId,
        uint8,
        string calldata,
        bytes memory
    ) public override returns (uint256) {
        revert VotingHappensOnMaciPoll(proposalPolls[proposalId].poll);
    }

    function castVoteBySig(uint256 proposalId, uint8, address, bytes memory) public override returns (uint256) {
        revert VotingHappensOnMaciPoll(proposalPolls[proposalId].poll);
    }

    function castVoteWithReasonAndParamsBySig(
        uint256 proposalId,
        uint8,
        address,
        string calldata,
        bytes memory,
        bytes memory
    ) public override returns (uint256) {
        revert VotingHappensOnMaciPoll(proposalPolls[proposalId].poll);
    }

    function hasVoted(uint256, address) public pure override returns (bool) {
        return false;
    }

    function COUNTING_MODE() public pure override returns (string memory) {
        return "support=bravo&quorum=for,against,abstain";
    }

    /// @dev Keep proposal Active during the post-deadline tally window. Once the tally
    ///      actually lands on chain (totalTallyResults > 0), the standard OZ logic
    ///      resolves Succeeded/Defeated based on our _quorumReached / _voteSucceeded
    ///      overrides.
    ///
    ///      We deliberately use totalTallyResults() rather than isTallied(): the
    ///      latter is `tallyBatchNum * 5^intStateTreeDepth >= numSignUps`, which is
    ///      vacuously true (0 >= 0) on any poll where mergeSignups hasn't run yet —
    ///      so it would trip the early pass-through here BEFORE the grace check
    ///      and leave un-tallied proposals stuck on Defeated the moment the
    ///      voting deadline passes.
    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        ProposalState s = super.state(proposalId);
        if (s != ProposalState.Defeated) return s;

        address tally = proposalPolls[proposalId].tally;
        if (tally == address(0)) return s;
        if (ITallyRead(tally).totalTallyResults() > 0) return s;

        uint256 deadline = proposalPolls[proposalId].deadline;
        if (block.timestamp <= deadline + tallyGracePeriod) {
            return ProposalState.Active;
        }
        return ProposalState.Defeated;
    }

    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    // ---- Governance-tunable setters (Timelock = _executor()) ----

    /// @notice Adjust the percentage-of-signups component of quorum. Validates `v <= 100`.
    function setQuorumPercentage(uint256 v) external onlyGovernance {
        require(v <= 100, "must be <= 100");
        emit QuorumPercentageChanged(quorumPercentage, v);
        quorumPercentage = v;
    }

    /// @notice Adjust the absolute floor used when `signups * quorumPercentage / 100` is too low.
    function setQuorumAbsolute(uint256 v) external onlyGovernance {
        emit QuorumAbsoluteChanged(quorumAbsolute, v);
        quorumAbsolute = v;
    }

    /// @notice Adjust how long after the OZ deadline a proposal can still be tallied. Capped at 30 days.
    function setTallyGracePeriod(uint256 v) external onlyGovernance {
        require(v <= 30 days, "grace period too long");
        emit TallyGracePeriodChanged(tallyGracePeriod, v);
        tallyGracePeriod = v;
    }

    /// @notice Rotate the on-chain coordinator address (e.g. EOA → Gnosis Safe at 7+ Attesters).
    ///         Affects only *future* polls — MessageProcessor / Tally ownership is set per-poll
    ///         at `propose()` time and is not retroactively reassigned.
    function setCoordinator(address v) external onlyGovernance {
        require(v != address(0), "zero address");
        emit CoordinatorChanged(coordinator, v);
        coordinator = v;
    }

    /// @notice Rotate the MACI public key used to encrypt ballots. Future-proofs for interim
    ///         off-chain coordinator rotation and the eventual threshold-MACI swap.
    function setCoordinatorPubKey(DomainObjs.PubKey calldata v) external onlyGovernance {
        emit CoordinatorPubKeyChanged(coordinatorPubKey, v);
        coordinatorPubKey = v;
    }

    // ---- Required multi-inheritance overrides ----

    function votingDelay() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(Governor, GovernorSettings) returns (uint256) {
        uint32 pending = _pendingVotingPeriod;
        return pending != 0 ? uint256(pending) : super.votingPeriod();
    }

    function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
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

    function supportsInterface(bytes4 interfaceId) public view override(Governor) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
