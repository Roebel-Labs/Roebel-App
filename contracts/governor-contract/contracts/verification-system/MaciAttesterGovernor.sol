// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governor } from "@openzeppelin/contracts/governance/Governor.sol";
import { GovernorSettings } from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import { GovernorTimelockControl } from "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";

import { IMACI } from "@maci-protocol/contracts/contracts/interfaces/IMACI.sol";
import { Params } from "@maci-protocol/contracts/contracts/utilities/Params.sol";
import { DomainObjs } from "@maci-protocol/contracts/contracts/utilities/DomainObjs.sol";

import { CitizenNFTPolicy } from "./CitizenNFTPolicy.sol";

interface IAttesterNFT {
    function hasAttesterNFT(address account) external view returns (bool);
}

interface ICitizenNFTSupply {
    function totalSupply() external view returns (uint256);
}

interface ITallyRead {
    function isTallied() external view returns (bool);
    function totalSpent() external view returns (uint256);
    function tallyResults(uint256 voteOption) external view returns (uint256 value, bool flag);
}

/// @title MaciAttesterGovernor
/// @notice DAO governor that uses MACI for private, collusion-resistant voting.
///         Replaces AttesterGovernor (which used GovernorCountingSimple + ERC721Votes).
///
/// VOTING MODEL
/// - Proposal creation is restricted to Attester NFT holders (unchanged from AttesterGovernor)
/// - Each proposal deploys its own MACI Poll. Voters cast encrypted ballots on the Poll
///   contract directly; this Governor's castVote* functions are disabled and revert.
/// - Quorum/success is read from the MACI Tally contract once the off-chain coordinator
///   has submitted the ZK-SNARK tally proof on-chain.
///
/// VOTE OPTION ENCODING (per proposal Poll)
///   0 = Against, 1 = For, 2 = Abstain
///
/// STATE OVERRIDE
/// - During the voting period, state() returns Active.
/// - After the voting deadline, state() stays Active for an additional `tallyGracePeriod`
///   to give the coordinator time to submit the tally. If the tally arrives in that window,
///   state resolves to Succeeded or Defeated based on the on-chain tally results.
/// - If the grace period elapses without a tally, the proposal is Defeated.
contract MaciAttesterGovernor is Governor, GovernorSettings, GovernorTimelockControl {
    IAttesterNFT public immutable attesterNFT;
    address public immutable citizenNFT;
    IMACI public immutable maci;
    address public immutable verifier;
    address public immutable vkRegistry;
    address public immutable initialVoiceCreditProxy;

    DomainObjs.PubKey public coordinatorPubKey;
    Params.TreeDepths public treeDepths;
    uint8 public messageBatchSize;
    uint256 public voteOptions;
    DomainObjs.Mode public mode;
    uint256 public quorumPercentage;
    uint256 public tallyGracePeriod;

    uint256 public constant VOTE_OPTION_AGAINST = 0;
    uint256 public constant VOTE_OPTION_FOR = 1;
    uint256 public constant VOTE_OPTION_ABSTAIN = 2;

    struct ProposalPoll {
        uint256 pollId;
        address poll;
        address messageProcessor;
        address tally;
        address policy;
        uint256 deadline;
    }

    mapping(uint256 => ProposalPoll) public proposalPolls;

    error OnlyAttestersCanPropose(address proposer);
    error VotingHappensOnMaciPoll(address poll);
    error MaciPollNotLinked(uint256 proposalId);

    event PollLinked(uint256 indexed proposalId, address poll, address tally, uint256 pollId);
    event ProposalCreatedByAttester(uint256 indexed proposalId, address indexed attester, string description);

    struct InitArgs {
        IAttesterNFT attesterNFT;
        address citizenNFT;
        IMACI maci;
        address verifier;
        address vkRegistry;
        address initialVoiceCreditProxy;
        DomainObjs.PubKey coordinatorPubKey;
        Params.TreeDepths treeDepths;
        uint8 messageBatchSize;
        uint256 voteOptions;
        DomainObjs.Mode mode;
        TimelockController timelock;
        uint48 votingDelay;
        uint32 votingPeriod;
        uint256 quorumPercentage;
        uint256 tallyGracePeriod;
    }

    constructor(InitArgs memory a)
        Governor("Roebel/Mueritz MACI DAO")
        GovernorSettings(a.votingDelay, a.votingPeriod, 0)
        GovernorTimelockControl(a.timelock)
    {
        attesterNFT = a.attesterNFT;
        citizenNFT = a.citizenNFT;
        maci = a.maci;
        verifier = a.verifier;
        vkRegistry = a.vkRegistry;
        initialVoiceCreditProxy = a.initialVoiceCreditProxy;
        coordinatorPubKey = a.coordinatorPubKey;
        treeDepths = a.treeDepths;
        messageBatchSize = a.messageBatchSize;
        voteOptions = a.voteOptions;
        mode = a.mode;
        quorumPercentage = a.quorumPercentage;
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

    function _deployPollFor(uint256 proposalId) internal {
        CitizenNFTPolicy policy = new CitizenNFTPolicy(citizenNFT);

        uint256 voteStart = proposalSnapshot(proposalId);
        uint256 voteEnd = proposalDeadline(proposalId);

        IMACI.DeployPollArgs memory args = IMACI.DeployPollArgs({
            startDate: voteStart,
            endDate: voteEnd,
            treeDepths: treeDepths,
            messageBatchSize: messageBatchSize,
            coordinatorPubKey: coordinatorPubKey,
            verifier: verifier,
            vkRegistry: vkRegistry,
            mode: mode,
            policy: address(policy),
            initialVoiceCreditProxy: initialVoiceCreditProxy,
            relayers: new address[](0),
            voteOptions: voteOptions
        });

        IMACI.PollContracts memory deployed = maci.deployPoll(args);
        policy.setTarget(deployed.poll);

        uint256 pollId = maci.nextPollId() - 1;

        proposalPolls[proposalId] = ProposalPoll({
            pollId: pollId,
            poll: deployed.poll,
            messageProcessor: deployed.messageProcessor,
            tally: deployed.tally,
            policy: address(policy),
            deadline: voteEnd
        });

        emit PollLinked(proposalId, deployed.poll, deployed.tally, pollId);
    }

    /// @notice Quorum is the minimum total spent voice credits (i.e. votes cast in non-QV mode).
    /// @dev Returns the same value regardless of timepoint — citizens snapshot is whatever the
    ///      current count is when this is read; for fairness, frontends should display the
    ///      number cached at proposal-creation time.
    function quorum(uint256) public view override returns (uint256) {
        uint256 totalCitizens = ICitizenNFTSupply(citizenNFT).totalSupply();
        return (totalCitizens * quorumPercentage) / 100;
    }

    /// @inheritdoc Governor
    function _quorumReached(uint256 proposalId) internal view override returns (bool) {
        address tally = proposalPolls[proposalId].tally;
        if (tally == address(0)) return false;
        if (!ITallyRead(tally).isTallied()) return false;
        return ITallyRead(tally).totalSpent() >= quorum(0);
    }

    /// @inheritdoc Governor
    function _voteSucceeded(uint256 proposalId) internal view override returns (bool) {
        address tally = proposalPolls[proposalId].tally;
        if (tally == address(0)) return false;
        if (!ITallyRead(tally).isTallied()) return false;
        (uint256 forVotes, ) = ITallyRead(tally).tallyResults(VOTE_OPTION_FOR);
        (uint256 againstVotes, ) = ITallyRead(tally).tallyResults(VOTE_OPTION_AGAINST);
        return forVotes > againstVotes;
    }

    /// @dev We don't snapshot voter weight on chain — voting happens on the MACI Poll.
    function _getVotes(address, uint256, bytes memory) internal pure override returns (uint256) {
        return 0;
    }

    /// @dev OZ's castVote pipeline must not be reachable. _countVote is unreachable because
    ///      the public castVote* overrides revert before getting here.
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
    ///      lands, the standard OZ logic resolves Succeeded/Defeated based on our
    ///      _quorumReached / _voteSucceeded overrides.
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
        if (ITallyRead(tally).isTallied()) return s;

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

    // ---- Required multi-inheritance overrides ----

    function votingDelay() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
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
