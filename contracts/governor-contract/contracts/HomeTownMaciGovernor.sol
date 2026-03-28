// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/governance/TimelockController.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./maci/interfaces/IMACI.sol";
import "./maci/interfaces/IPoll.sol";
import "./maci/interfaces/ITally.sol";
import "./maci/NFTVotesChecker.sol";
import "./maci/NFTVoiceCreditsProxy.sol";

/**
 * @title HomeTownMaciGovernor
 * @notice Private voting governance system using MACI for HomeTown DAO
 * @dev Integrates MACI (Minimal Anti-Collusion Infrastructure) for encrypted,
 *      collusion-resistant voting with HomeTownVotingNFT-based access control
 *
 * Architecture:
 * 1. Each proposal deploys a dedicated MACI Poll
 * 2. NFT holders signup to poll with MACI keypair
 * 3. Voting happens via encrypted messages on Poll contract
 * 4. Coordinator tallies votes off-chain with ZK proofs
 * 5. Governor executes proposal if tally meets thresholds
 *
 * Security:
 * - Vote privacy via encryption
 * - Anti-collusion via vote changing
 * - Soulbound NFT gating
 * - ZK-proven vote counting
 * - Optional timelock for execution
 */
contract HomeTownMaciGovernor is Ownable {
    /// @notice The MACI core contract
    IMACI public immutable maci;

    /// @notice The HomeTownVotingNFT contract
    IERC721 public immutable votingNFT;

    /// @notice Optional timelock controller for delayed execution
    TimelockController public timelock;

    /// @notice Coordinator's public key for vote encryption
    IMACI.PubKey public coordinatorPubKey;

    /// @notice Governance settings
    struct GovernanceSettings {
        uint256 votingDelay;           // Delay before voting starts (in seconds)
        uint256 votingPeriod;          // Duration of voting (in seconds)
        uint256 proposalThreshold;     // Min NFTs required to propose
        uint256 quorumNumerator;       // Quorum as percentage (e.g., 10 = 10%)
        uint256 supportThreshold;      // Min % of votes needed to pass (e.g., 51 = 51%)
    }

    GovernanceSettings public settings;

    /// @notice Proposal struct
    struct Proposal {
        uint256 id;
        address proposer;
        uint256 startTime;
        uint256 endTime;
        address pollAddress;
        address tallyAddress;
        address gatekeeper;
        address voiceCreditsProxy;
        string description;
        Action[] actions;
        bool executed;
        bool canceled;
        uint256 snapshotBlock;
    }

    /// @notice Action to execute if proposal passes
    struct Action {
        address target;
        uint256 value;
        bytes data;
    }

    /// @notice Proposal storage
    mapping(uint256 => Proposal) public proposals;
    uint256 public proposalCount;

    /// @notice Vote options (indexes for MACI tally)
    uint8 public constant VOTE_OPTION_FOR = 0;
    uint8 public constant VOTE_OPTION_AGAINST = 1;
    uint8 public constant VOTE_OPTION_ABSTAIN = 2;
    uint8 public constant NUM_VOTE_OPTIONS = 3;

    /// @notice Events
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        address pollAddress,
        string description
    );
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCanceled(uint256 indexed proposalId);
    event CoordinatorPubKeyUpdated(uint256 x, uint256 y);

    /// @notice Errors
    error InsufficientProposalThreshold();
    error ProposalAlreadyExecuted();
    error ProposalIsCanceled();
    error VotingNotEnded();
    error TallyNotComplete();
    error QuorumNotMet();
    error InsufficientSupport();
    error ProposalNotPassed();
    error InvalidProposal();
    error TimelockDelayNotMet();

    /**
     * @notice Constructor
     * @param _maci Address of deployed MACI contract
     * @param _votingNFT Address of HomeTownVotingNFT
     * @param _timelock Address of TimelockController (or address(0) for no timelock)
     * @param _coordinatorPubKey Coordinator's public key (x, y)
     * @param _settings Initial governance settings
     */
    constructor(
        address _maci,
        address _votingNFT,
        address _timelock,
        IMACI.PubKey memory _coordinatorPubKey,
        GovernanceSettings memory _settings
    ) {
        maci = IMACI(_maci);
        votingNFT = IERC721(_votingNFT);
        if (_timelock != address(0)) {
            timelock = TimelockController(payable(_timelock));
        }
        coordinatorPubKey = _coordinatorPubKey;
        settings = _settings;

        emit CoordinatorPubKeyUpdated(_coordinatorPubKey.x, _coordinatorPubKey.y);
    }

    /**
     * @notice Create a new proposal with MACI poll
     * @param _description Proposal description
     * @param _actions Actions to execute if passed
     * @return proposalId The ID of the created proposal
     */
    function propose(
        string memory _description,
        Action[] memory _actions
    ) external returns (uint256 proposalId) {
        // Check proposer has required NFTs
        uint256 proposerBalance = votingNFT.balanceOf(msg.sender);
        if (proposerBalance < settings.proposalThreshold) {
            revert InsufficientProposalThreshold();
        }

        // Create proposal ID
        proposalId = proposalCount++;

        // Calculate voting times
        uint256 startTime = block.timestamp + settings.votingDelay;
        uint256 endTime = startTime + settings.votingPeriod;
        uint256 snapshotBlock = block.number - 1;

        // Deploy gatekeeper (NFT checker)
        NFTVotesChecker gatekeeper = new NFTVotesChecker(
            address(votingNFT),
            snapshotBlock
        );

        // Deploy voice credits proxy
        NFTVoiceCreditsProxy voiceCreditsProxy = new NFTVoiceCreditsProxy(
            address(votingNFT),
            1  // 1 voice credit per NFT
        );

        // Deploy MACI poll
        address pollAddress = _deployPoll(
            settings.votingPeriod,
            address(gatekeeper),
            address(voiceCreditsProxy)
        );

        // Set MACI instance on gatekeeper
        gatekeeper.setMaciInstance(pollAddress);

        // Get tally address from poll
        // Note: In production, you'll need to get this from the Poll contract
        // For now, we'll set it after poll deployment via a separate call
        address tallyAddress = address(0); // Will be set after poll is fully deployed

        // Store proposal
        Proposal storage proposal = proposals[proposalId];
        proposal.id = proposalId;
        proposal.proposer = msg.sender;
        proposal.startTime = startTime;
        proposal.endTime = endTime;
        proposal.pollAddress = pollAddress;
        proposal.tallyAddress = tallyAddress;
        proposal.gatekeeper = address(gatekeeper);
        proposal.voiceCreditsProxy = address(voiceCreditsProxy);
        proposal.description = _description;
        proposal.snapshotBlock = snapshotBlock;

        // Store actions
        for (uint256 i = 0; i < _actions.length; i++) {
            proposal.actions.push(_actions[i]);
        }

        emit ProposalCreated(proposalId, msg.sender, pollAddress, _description);
    }

    /**
     * @notice Deploy a MACI poll for a proposal
     * @param _duration Poll duration in seconds
     * @param _gatekeeper Address of gatekeeper contract
     * @param _voiceCreditsProxy Address of voice credits proxy
     * @return pollAddress Address of deployed poll
     */
    function _deployPoll(
        uint256 _duration,
        address _gatekeeper,
        address _voiceCreditsProxy
    ) internal returns (address pollAddress) {
        // Configure poll parameters
        IMACI.MaxValues memory maxValues = IMACI.MaxValues({
            maxMessages: 100,      // Max 100 votes (adjust based on expected participation)
            maxVoteOptions: NUM_VOTE_OPTIONS
        });

        IMACI.TreeDepths memory treeDepths = IMACI.TreeDepths({
            intStateTreeDepth: 2,       // For 100 voters: 2^7 = 128
            messageTreeSubDepth: 2,
            messageTreeDepth: 7,
            voteOptionTreeDepth: 2      // 2^2 = 4 options (we use 3)
        });

        // Note: In production deployment, you'll need to provide:
        // - verifier contract address (for ZK proof verification)
        // - vkRegistry contract address (verification keys)
        // These are deployed as part of MACI infrastructure setup

        // For now, this is a simplified version
        // In practice, you'd call:
        // pollAddress = maci.deployPoll(
        //     _duration,
        //     maxValues,
        //     treeDepths,
        //     coordinatorPubKey,
        //     verifier,
        //     vkRegistry,
        //     IMACI.Mode.NON_QV  // Non-quadratic voting (1 NFT = 1 vote)
        // );

        // This function signature will need to be adjusted based on
        // your actual MACI deployment

        return address(0); // Placeholder
    }

    /**
     * @notice Execute a proposal after voting and tallying is complete
     * @param _proposalId The proposal ID to execute
     */
    function execute(uint256 _proposalId) external {
        Proposal storage proposal = proposals[_proposalId];

        // Validation checks
        if (proposal.executed) revert ProposalAlreadyExecuted();
        if (proposal.canceled) revert ProposalIsCanceled();
        if (block.timestamp < proposal.endTime) revert VotingNotEnded();

        // Check tally is complete
        ITally tally = ITally(proposal.tallyAddress);
        if (!tally.isTallied()) revert TallyNotComplete();

        // Get vote results
        uint256 votesFor = tally.results(VOTE_OPTION_FOR);
        uint256 votesAgainst = tally.results(VOTE_OPTION_AGAINST);
        uint256 votesAbstain = tally.results(VOTE_OPTION_ABSTAIN);
        uint256 totalVotes = votesFor + votesAgainst + votesAbstain;

        // Check quorum
        uint256 totalSupply = _getTotalVotingPower();
        uint256 quorumRequired = (totalSupply * settings.quorumNumerator) / 100;
        if (totalVotes < quorumRequired) revert QuorumNotMet();

        // Check support threshold (excluding abstain)
        uint256 totalActiveVotes = votesFor + votesAgainst;
        if (totalActiveVotes > 0) {
            uint256 supportPercent = (votesFor * 100) / totalActiveVotes;
            if (supportPercent < settings.supportThreshold) {
                revert InsufficientSupport();
            }
        } else {
            revert InsufficientSupport();
        }

        // Mark as executed
        proposal.executed = true;

        // Execute actions
        _executeActions(proposal.actions);

        emit ProposalExecuted(_proposalId);
    }

    /**
     * @notice Execute proposal actions
     * @param _actions Array of actions to execute
     */
    function _executeActions(Action[] storage _actions) internal {
        for (uint256 i = 0; i < _actions.length; i++) {
            Action storage action = _actions[i];

            (bool success, ) = action.target.call{value: action.value}(action.data);
            require(success, "Action execution failed");
        }
    }

    /**
     * @notice Cancel a proposal (only proposer or owner)
     * @param _proposalId The proposal ID to cancel
     */
    function cancel(uint256 _proposalId) external {
        Proposal storage proposal = proposals[_proposalId];

        require(
            msg.sender == proposal.proposer || msg.sender == owner(),
            "Not authorized"
        );
        require(!proposal.executed, "Already executed");
        require(!proposal.canceled, "Already canceled");

        proposal.canceled = true;
        emit ProposalCanceled(_proposalId);
    }

    /**
     * @notice Get total voting power (total NFT supply)
     * @return Total number of NFTs (eligible voters)
     */
    function _getTotalVotingPower() internal view returns (uint256) {
        // For ERC721, we'd need to track total supply
        // HomeTownVotingNFT should expose totalSupply()
        // For now, return a reasonable estimate
        return 100; // Adjust based on your DAO size
    }

    /**
     * @notice Update coordinator public key (only owner)
     * @param _newPubKey New coordinator public key
     */
    function updateCoordinatorPubKey(IMACI.PubKey memory _newPubKey) external onlyOwner {
        coordinatorPubKey = _newPubKey;
        emit CoordinatorPubKeyUpdated(_newPubKey.x, _newPubKey.y);
    }

    /**
     * @notice Update governance settings (only owner)
     * @param _newSettings New governance settings
     */
    function updateSettings(GovernanceSettings memory _newSettings) external onlyOwner {
        settings = _newSettings;
    }

    /**
     * @notice Get proposal details
     * @param _proposalId The proposal ID
     * @return Proposal struct
     */
    function getProposal(uint256 _proposalId) external view returns (Proposal memory) {
        return proposals[_proposalId];
    }

    /**
     * @notice Check if proposal can be executed
     * @param _proposalId The proposal ID
     * @return Whether proposal can be executed
     */
    function canExecute(uint256 _proposalId) external view returns (bool) {
        Proposal storage proposal = proposals[_proposalId];

        if (proposal.executed || proposal.canceled) return false;
        if (block.timestamp < proposal.endTime) return false;

        ITally tally = ITally(proposal.tallyAddress);
        if (!tally.isTallied()) return false;

        // Check quorum and support
        uint256 votesFor = tally.results(VOTE_OPTION_FOR);
        uint256 votesAgainst = tally.results(VOTE_OPTION_AGAINST);
        uint256 votesAbstain = tally.results(VOTE_OPTION_ABSTAIN);
        uint256 totalVotes = votesFor + votesAgainst + votesAbstain;

        uint256 totalSupply = _getTotalVotingPower();
        uint256 quorumRequired = (totalSupply * settings.quorumNumerator) / 100;
        if (totalVotes < quorumRequired) return false;

        uint256 totalActiveVotes = votesFor + votesAgainst;
        if (totalActiveVotes == 0) return false;

        uint256 supportPercent = (votesFor * 100) / totalActiveVotes;
        return supportPercent >= settings.supportThreshold;
    }

    /// @notice Receive ETH for executing proposals
    receive() external payable {}
}
