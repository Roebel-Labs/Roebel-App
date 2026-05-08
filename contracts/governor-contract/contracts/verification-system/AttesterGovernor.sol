// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";

interface IAttesterNFT {
    function hasAttesterNFT(address account) external view returns (bool);
}

/**
 * @title AttesterGovernor
 * @dev Custom DAO governance for Röbel/Müritz with role-based proposal creation
 *
 * GOVERNANCE MODEL:
 * - Only Attester NFT holders can CREATE proposals (culture committee curation)
 * - All Citizen NFT holders can VOTE on proposals (democratic decision-making)
 * - Voting power = 1 vote per Citizen NFT (must delegate to activate)
 *
 * PARAMETERS:
 * - Voting Delay: 1 day (86400 seconds)
 * - Voting Period: 7 days (604800 seconds)
 * - Proposal Threshold: 0 (Attester role check replaces this)
 * - Quorum: 10% of Citizen NFT holders must participate
 *
 * DEPLOYMENT:
 * 1. Deploy this contract with:
 *    - _attesterNFT: Address of AttesterNFT contract
 *    - _citizenNFT: Address of CitizenNFT contract (must implement IVotes)
 *    - _timelock: Address of TimelockController (or 0x0 for no timelock)
 *    - _initialVotingDelay: 7200 (blocks, ~4 hours on Base, type: uint48)
 *    - _initialVotingPeriod: 302400 (blocks, ~7 days on Base, type: uint32)
 *    - _quorumNumeratorValue: 10 (10% quorum, type: uint256)
 *
 * SECURITY:
 * - Proposal spam prevention: Only verified Attesters can propose
 * - Democratic voting: All verified Citizens participate
 * - Soulbound NFTs: Non-transferable, verified identities
 * - Timelock: Optional delay for proposal execution
 */
contract AttesterGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    IAttesterNFT public immutable attesterNFT;

    error OnlyAttestersCanPropose(address proposer);

    event ProposalCreatedByAttester(
        uint256 indexed proposalId,
        address indexed attester,
        string description
    );

    constructor(
        IAttesterNFT _attesterNFT,
        IVotes _citizenNFT,
        TimelockController _timelock,
        uint48 _initialVotingDelay,
        uint32 _initialVotingPeriod,
        uint256 _quorumNumeratorValue
    )
        Governor("Roebel/Mueritz DAO")
        GovernorSettings(
            _initialVotingDelay,
            _initialVotingPeriod,
            0 // proposalThreshold = 0 (role-based check in propose())
        )
        GovernorVotes(_citizenNFT)
        GovernorVotesQuorumFraction(_quorumNumeratorValue)
        GovernorTimelockControl(_timelock)
    {
        attesterNFT = _attesterNFT;
    }

    /**
     * @dev Override propose() to restrict proposal creation to Attester NFT holders only
     * This is the key modification that enforces role-based proposal creation
     */
    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public override(Governor) returns (uint256) {
        // CUSTOM CHECK: Only Attester NFT holders can create proposals
        if (!attesterNFT.hasAttesterNFT(msg.sender)) {
            revert OnlyAttestersCanPropose(msg.sender);
        }

        // Call parent propose() which handles standard governance logic
        uint256 proposalId = super.propose(targets, values, calldatas, description);

        emit ProposalCreatedByAttester(proposalId, msg.sender, description);

        return proposalId;
    }

    /**
     * @dev Check if an address can create proposals (must hold Attester NFT)
     * This overrides the standard proposalThreshold check
     */
    function canPropose(address account) public view returns (bool) {
        return attesterNFT.hasAttesterNFT(account);
    }

    // Required overrides for multiple inheritance

    function votingDelay()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(Governor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
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

    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(Governor)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Clock used for voting snapshots (matches CitizenNFT)
     * Using block number for governance timing
     */
    function clock() public view virtual override(Governor, GovernorVotes) returns (uint48) {
        return uint48(block.number);
    }

    /**
     * @dev Machine-readable description of the clock
     */
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public view virtual override(Governor, GovernorVotes) returns (string memory) {
        return "mode=blocknumber&from=default";
    }
}
