// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import '../helpers/dao/IPermissionCondition.sol';

/// @title IPermissionERC1271
/// @notice Interface for the PermissionERC1271 contract
/// @dev Extends IPermissionCondition to add MultiSig configuration functionality
interface IPermissionERC1271 is IPermissionCondition {
	/// @notice Thrown when trying to configure a zero address as MultiSig plugin
	error InvalidMultiSigAddress();

	/// @notice Emitted when a DAO configures its MultiSig plugin
	/// @param dao The DAO address
	/// @param multiSigPlugin The MultiSig plugin address
	event MultiSigConfigured(address indexed dao, address indexed multiSigPlugin);

	/// @notice The ID of the permission being validated
	/// @dev This should match DAO.VALIDATE_SIGNATURE_PERMISSION_ID
	function VALIDATE_SIGNATURE_PERMISSION_ID() external view returns (bytes32);

	/// @notice The ID of the permission required to call the `execute` function on the DAO
	/// @dev This should match DAO.EXECUTE_PERMISSION_ID
	function EXECUTE_PERMISSION_ID() external view returns (bytes32);

	/// @notice Returns the configured MultiSig plugin for a given DAO
	/// @param dao The DAO address
	/// @return The MultiSig plugin address
	function daoMultiSigPlugin(address dao) external view returns (address);

	/// @notice Configures the MultiSig plugin address for the calling DAO
	/// @param _multiSigPlugin The address of the MultiSig plugin contract that implements IMembership
	/// @dev msg.sender is used as the DAO address (no access control needed)
	/// @dev Emits MultiSigConfigured event
	function configMultisig(address _multiSigPlugin) external;
}
