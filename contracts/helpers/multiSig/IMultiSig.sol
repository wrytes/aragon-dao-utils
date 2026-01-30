// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

import {IDAO} from '../dao/IDAO.sol';

/// @title IMultiSig
/// @notice The interface for the Aragon Multisig plugin.
interface IMultiSig {
	// -----------------------------------------------------------------------
	//  Enums
	// -----------------------------------------------------------------------

	enum Operation {
		Call,
		DelegateCall
	}

	enum PluginType {
		UUPS,
		Cloneable,
		Constructable
	}

	// -----------------------------------------------------------------------
	//  Structs
	// -----------------------------------------------------------------------

	struct Action {
		address to;
		uint256 value;
		bytes data;
	}

	struct TargetConfig {
		address target;
		Operation operation;
	}

	struct MultisigSettings {
		bool onlyListed;
		uint16 minApprovals;
	}

	struct ProposalParameters {
		uint16 minApprovals;
		uint64 snapshotBlock;
		uint64 startDate;
		uint64 endDate;
	}

	// -----------------------------------------------------------------------
	//  Errors
	// -----------------------------------------------------------------------

	error AddresslistLengthOutOfBounds(uint16 limit, uint256 actual);
	error AlreadyInitialized();
	error ApprovalCastForbidden(uint256 proposalId, address sender);
	error DaoUnauthorized(address dao, address where, address who, bytes32 permissionId);
	error DateOutOfBounds(uint64 limit, uint64 actual);
	error DelegateCallFailed();
	error FunctionDeprecated();
	error InvalidAddresslistUpdate(address member);
	error InvalidTargetConfig(TargetConfig targetConfig);
	error MinApprovalsOutOfBounds(uint16 limit, uint16 actual);
	error NonexistentProposal(uint256 proposalId);
	error ProposalAlreadyExists(uint256 proposalId);
	error ProposalCreationForbidden(address sender);
	error ProposalExecutionForbidden(uint256 proposalId);

	// -----------------------------------------------------------------------
	//  Events
	// -----------------------------------------------------------------------

	event AdminChanged(address previousAdmin, address newAdmin);
	event Approved(uint256 indexed proposalId, address indexed approver);
	event BeaconUpgraded(address indexed beacon);
	event Initialized(uint8 version);
	event MembersAdded(address[] members);
	event MembersRemoved(address[] members);
	event MembershipContractAnnounced(address indexed definingContract);
	event MetadataSet(bytes metadata);
	event MultisigSettingsUpdated(bool onlyListed, uint16 indexed minApprovals);
	event ProposalCreated(
		uint256 indexed proposalId,
		address indexed creator,
		uint64 startDate,
		uint64 endDate,
		bytes metadata,
		Action[] actions,
		uint256 allowFailureMap
	);
	event ProposalExecuted(uint256 indexed proposalId);
	event TargetSet(TargetConfig newTargetConfig);
	event Upgraded(address indexed implementation);

	// -----------------------------------------------------------------------
	//  Permission IDs
	// -----------------------------------------------------------------------

	function CREATE_PROPOSAL_PERMISSION_ID() external view returns (bytes32);

	function EXECUTE_PROPOSAL_PERMISSION_ID() external view returns (bytes32);

	function SET_METADATA_PERMISSION_ID() external view returns (bytes32);

	function SET_TARGET_CONFIG_PERMISSION_ID() external view returns (bytes32);

	function UPDATE_MULTISIG_SETTINGS_PERMISSION_ID() external view returns (bytes32);

	function UPGRADE_PLUGIN_PERMISSION_ID() external view returns (bytes32);

	// -----------------------------------------------------------------------
	//  Address list
	// -----------------------------------------------------------------------

	function addAddresses(address[] calldata _members) external;

	function removeAddresses(address[] calldata _members) external;

	function addresslistLength() external view returns (uint256);

	function addresslistLengthAtBlock(uint256 _blockNumber) external view returns (uint256);

	function isListed(address _account) external view returns (bool);

	function isListedAtBlock(address _account, uint256 _blockNumber) external view returns (bool);

	function isMember(address _account) external view returns (bool);

	// -----------------------------------------------------------------------
	//  Proposal lifecycle
	// -----------------------------------------------------------------------

	function createProposal(
		bytes calldata _metadata,
		Action[] calldata _actions,
		uint64 _startDate,
		uint64 _endDate,
		bytes calldata _data
	) external returns (uint256 proposalId);

	function createProposal(
		bytes calldata _metadata,
		Action[] calldata _actions,
		uint256 _allowFailureMap,
		bool _approveProposal,
		bool _tryExecution,
		uint64 _startDate,
		uint64 _endDate
	) external returns (uint256 proposalId);

	function approve(uint256 _proposalId, bool _tryExecution) external;

	function canApprove(uint256 _proposalId, address _account) external view returns (bool);

	function hasApproved(uint256 _proposalId, address _account) external view returns (bool);

	function hasSucceeded(uint256 _proposalId) external view returns (bool);

	function execute(uint256 _proposalId) external;

	function canExecute(uint256 _proposalId) external view returns (bool);

	function getProposal(
		uint256 _proposalId
	)
		external
		view
		returns (
			bool executed,
			uint16 approvals,
			ProposalParameters memory parameters,
			Action[] memory actions,
			uint256 allowFailureMap,
			TargetConfig memory targetConfig
		);

	function proposalCount() external view returns (uint256);

	function customProposalParamsABI() external pure returns (string memory);

	// -----------------------------------------------------------------------
	//  Configuration
	// -----------------------------------------------------------------------

	function multisigSettings() external view returns (bool onlyListed, uint16 minApprovals);

	function updateMultisigSettings(MultisigSettings calldata _multisigSettings) external;

	function lastMultisigSettingsChange() external view returns (uint64);

	function setMetadata(bytes calldata _metadata) external;

	function getMetadata() external view returns (bytes memory);

	function setTargetConfig(TargetConfig calldata _targetConfig) external;

	function getTargetConfig() external view returns (TargetConfig memory);

	function getCurrentTargetConfig() external view returns (TargetConfig memory);

	// -----------------------------------------------------------------------
	//  Initialization & upgrades
	// -----------------------------------------------------------------------

	function initialize(
		IDAO _dao,
		address[] calldata _members,
		MultisigSettings calldata _multisigSettings,
		TargetConfig calldata _targetConfig,
		bytes calldata _pluginMetadata
	) external;

	function initializeFrom(uint16 _fromBuild, bytes calldata _initData) external;

	function dao() external view returns (IDAO);

	function pluginType() external pure returns (PluginType);

	function protocolVersion() external pure returns (uint8[3] memory);

	function implementation() external view returns (address);

	function proxiableUUID() external view returns (bytes32);

	function supportsInterface(bytes4 _interfaceId) external view returns (bool);

	function upgradeTo(address newImplementation) external;

	function upgradeToAndCall(address newImplementation, bytes calldata data) external payable;
}
