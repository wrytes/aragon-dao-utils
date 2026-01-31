// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IPermissionERC1271, IPermissionCondition} from './interfaces/IPermissionERC1271.sol';
import {IDAO} from './helpers/dao/IDAO.sol';
import {IMultiSig} from './helpers/multiSig/IMultiSig.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';

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

	/// @notice ERC-165 interface support (required by DAO's grantWithCondition)
	function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
		return interfaceId == type(IPermissionCondition).interfaceId || interfaceId == 0x01ffc9a7; // ERC-165
	}

	/// @notice Configures the MultiSig plugin address for the calling DAO
	/// @param _multiSigPlugin The address of the MultiSig plugin contract that implements IMultiSig
	/// @dev msg.sender is used as the DAO address (no access control needed)
	/// @dev Emits MultiSigConfigured event
	function configMultisig(address _multiSigPlugin) external {
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

		// Get min. approval signers
		(, uint16 minApprovals) = IMultiSig(multiSigPlugin).multisigSettings();

		// Each ECDSA signature is 65 bytes (r: 32 + s: 32 + v: 1)
		if (signature.length < uint256(minApprovals) * 65) {
			return false;
		}

		// Loop through each signature, recover the signer, and validate
		address[] memory seen = new address[](minApprovals);

		for (uint16 i = 0; i < minApprovals; i++) {
			uint256 offset = uint256(i) * 65;

			// Extract individual 65-byte signature
			bytes memory sig = new bytes(65);
			for (uint256 j = 0; j < 65; j++) {
				sig[j] = signature[offset + j];
			}

			(address signer, ECDSA.RecoverError err, ) = ECDSA.tryRecover(hash, sig);

			// Check if signature is valid
			if (err != ECDSA.RecoverError.NoError) {
				return false;
			}

			// Check if signer is member
			if (IMultiSig(multiSigPlugin).isMember(signer) == false) {
				return false;
			}

			// Reject duplicate signers
			for (uint16 j = 0; j < i; j++) {
				if (seen[j] == signer) {
					return false;
				}
			}
			seen[i] = signer;
		}

		return true;
	}
}
