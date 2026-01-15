// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import './interfaces/IPermissionERC1271.sol';
import './helpers/dao/IDAO.sol';
import './helpers/multiSig/IMembership.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';

/// @title PermissionERC1271
/// @notice A generic, reusable permission condition contract that validates ERC-1271 signatures
///         by checking if the signer is a member of a MultiSig plugin
/// @dev Implements IPermissionERC1271 to enable conditional permission grants for Aragon DAOs
contract PermissionERC1271 is IPermissionERC1271 {
	/// @notice Mapping of DAO address to its configured MultiSig plugin address
	mapping(address => address) public daoMultiSigPlugin;

	/// @notice The ID of the permission being validated
	/// @dev This should match DAO.VALIDATE_SIGNATURE_PERMISSION_ID
	bytes32 public constant VALIDATE_SIGNATURE_PERMISSION_ID = keccak256('VALIDATE_SIGNATURE_PERMISSION');

	/// @notice The ID of the permission required to call the `execute` function on the DAO
	/// @dev This should match DAO.EXECUTE_PERMISSION_ID
	bytes32 public constant EXECUTE_PERMISSION_ID = keccak256('EXECUTE_PERMISSION');

	/// @notice Configures the MultiSig plugin address for the calling DAO
	/// @param _multiSigPlugin The address of the MultiSig plugin contract that implements IMembership
	/// @dev msg.sender is used as the DAO address (no access control needed)
	/// @dev Emits MultiSigConfigured event
	function configMultisig(address _multiSigPlugin) external {
		if (_multiSigPlugin == address(0)) revert InvalidMultiSigAddress();
		daoMultiSigPlugin[msg.sender] = _multiSigPlugin;
		emit MultiSigConfigured(msg.sender, _multiSigPlugin);
	}

	/// @notice Checks if a signature is valid by verifying the signer is a MultiSig member
	/// @param _where The address where the permission is being checked (the DAO contract)
	/// @param _permissionId The permission identifier being checked
	/// @param _data The data containing the hash and signature (abi.encoded)
	/// @return isPermitted True if the signer is a valid MultiSig member
	function isGranted(
		address _where,
		address /* _who */,
		bytes32 _permissionId,
		bytes calldata _data
	) external view override returns (bool isPermitted) {
		// Verify this is for signature validation permission
		if (_permissionId != VALIDATE_SIGNATURE_PERMISSION_ID) {
			return false;
		}

		// Get configured MultiSig plugin for this DAO (_where is the DAO address)
		address multiSigPlugin = daoMultiSigPlugin[_where];
		if (multiSigPlugin == address(0)) {
			return false; // No MultiSig configured for this DAO
		}

		// Verify MultiSig plugin is still authorized on the DAO
		// Check if MultiSig has EXECUTE_PERMISSION on the DAO
		if (IDAO(_where).hasPermission(_where, multiSigPlugin, EXECUTE_PERMISSION_ID, '') == false) {
			return false; // MultiSig plugin is no longer authorized
		}

		// Decode hash and signature from _data
		(bytes32 hash, bytes memory signature) = abi.decode(_data, (bytes32, bytes));

		// Recover signer from signature using tryRecover (doesn't revert on invalid signatures)
		(address signer, ECDSA.RecoverError error, ) = ECDSA.tryRecover(hash, signature);

		// Return false if signature recovery failed
		if (error != ECDSA.RecoverError.NoError) {
			return false;
		}

		// Check if signer is a member of the MultiSig
		return IMembership(multiSigPlugin).isMember(signer);
	}
}
