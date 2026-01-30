// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.8;

/// @title IDAO
/// @author Aragon X - 2022-2024
/// @notice The interface required for DAOs within the Aragon App DAO framework.
/// @custom:security-contact sirt@aragon.org
interface IDAO {
	// -----------------------------------------------------------------------
	//  Errors
	// -----------------------------------------------------------------------

	error ActionFailed(uint256 index);
	error AlreadyInitialized();
	error AnyAddressDisallowedForWhoAndWhere();
	error ConditionInterfaceNotSupported(address condition);
	error ConditionNotAContract(address condition);
	error FunctionRemoved();
	error GrantWithConditionNotSupported();
	error InsufficientGas();
	error NativeTokenDepositAmountMismatch(uint256 expected, uint256 actual);
	error PermissionAlreadyGrantedForDifferentCondition(
		address where,
		address who,
		bytes32 permissionId,
		address currentCondition,
		address newCondition
	);
	error PermissionsForAnyAddressDisallowed();
	error ProtocolVersionUpgradeNotSupported(uint8[3] protocolVersion);
	error ReentrantCall();
	error TooManyActions();
	error Unauthorized(address where, address who, bytes32 permissionId);
	error UnknownCallback(bytes4 callbackSelector, bytes4 magicNumber);
	error ZeroAmount();

	// -----------------------------------------------------------------------
	//  Events
	// -----------------------------------------------------------------------

	event CallbackReceived(address sender, bytes4 indexed sig, bytes data);

	event Deposited(address indexed sender, address indexed token, uint256 amount, string _reference);

	event Executed(
		address indexed actor,
		bytes32 callId,
		Action[] actions,
		uint256 allowFailureMap,
		uint256 failureMap,
		bytes[] execResults
	);

	event Granted(
		bytes32 indexed permissionId,
		address indexed here,
		address where,
		address indexed who,
		address condition
	);

	event Initialized(uint8 version);

	event MetadataSet(bytes metadata);

	event NativeTokenDeposited(address sender, uint256 amount);

	event NewURI(string daoURI);

	event Revoked(bytes32 indexed permissionId, address indexed here, address where, address indexed who);

	event StandardCallbackRegistered(bytes4 interfaceId, bytes4 callbackSelector, bytes4 magicNumber);

	event TrustedForwarderSet(address forwarder);

	// -----------------------------------------------------------------------
	//  Structs
	// -----------------------------------------------------------------------

	struct Action {
		address to;
		uint256 value;
		bytes data;
	}

	// -----------------------------------------------------------------------
	//  Permission IDs
	// -----------------------------------------------------------------------

	function EXECUTE_PERMISSION_ID() external view returns (bytes32);

	function REGISTER_STANDARD_CALLBACK_PERMISSION_ID() external view returns (bytes32);

	function ROOT_PERMISSION_ID() external view returns (bytes32);

	function SET_METADATA_PERMISSION_ID() external view returns (bytes32);

	function SET_TRUSTED_FORWARDER_PERMISSION_ID() external view returns (bytes32);

	function UPGRADE_DAO_PERMISSION_ID() external view returns (bytes32);

	function VALIDATE_SIGNATURE_PERMISSION_ID() external view returns (bytes32);

	// -----------------------------------------------------------------------
	//  Permission management
	// -----------------------------------------------------------------------

	function grant(address _where, address _who, bytes32 _permissionId) external;

	function grantWithCondition(
		address _where,
		address _who,
		bytes32 _permissionId,
		address _condition
	) external;

	function revoke(address _where, address _who, bytes32 _permissionId) external;

	function hasPermission(
		address _where,
		address _who,
		bytes32 _permissionId,
		bytes memory _data
	) external view returns (bool);

	function isGranted(
		address _where,
		address _who,
		bytes32 _permissionId,
		bytes memory _data
	) external view returns (bool);

	function applyMultiTargetPermissions(bytes calldata _items) external;

	function applySingleTargetPermissions(address _where, bytes calldata items) external;

	// -----------------------------------------------------------------------
	//  Execution
	// -----------------------------------------------------------------------

	function execute(
		bytes32 _callId,
		Action[] calldata _actions,
		uint256 _allowFailureMap
	) external returns (bytes[] memory execResults, uint256 failureMap);

	// -----------------------------------------------------------------------
	//  Metadata & configuration
	// -----------------------------------------------------------------------

	function setMetadata(bytes calldata _metadata) external;

	function daoURI() external view returns (string memory);

	function setDaoURI(string calldata newDaoURI) external;

	function setTrustedForwarder(address _newTrustedForwarder) external;

	function getTrustedForwarder() external view returns (address);

	// -----------------------------------------------------------------------
	//  ERC-1271
	// -----------------------------------------------------------------------

	function isValidSignature(bytes32 _hash, bytes memory _signature) external view returns (bytes4);

	function setSignatureValidator(address) external;

	// -----------------------------------------------------------------------
	//  Standard callbacks & misc
	// -----------------------------------------------------------------------

	function registerStandardCallback(bytes4 _interfaceId, bytes4 _callbackSelector, bytes4 _magicNumber) external;

	function deposit(address _token, uint256 _amount, string calldata _reference) external payable;

	function supportsInterface(bytes4 interfaceId) external view returns (bool);

	function protocolVersion() external pure returns (uint8[3] memory);

	function proxiableUUID() external view returns (bytes32);

	function initialize(
		bytes calldata _metadata,
		address _initialOwner,
		address _trustedForwarder,
		string calldata daoURI_
	) external;

	function initializeFrom(uint8[3] calldata _previousProtocolVersion, bytes calldata _initData) external;

	function upgradeTo(address newImplementation) external;

	function upgradeToAndCall(address newImplementation, bytes calldata data) external payable;
}
