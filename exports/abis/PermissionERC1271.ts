export const PermissionERC1271_ABI = [
	{
		inputs: [],
		name: 'InvalidMultiSigAddress',
		type: 'error',
	},
	{
		anonymous: false,
		inputs: [
			{
				indexed: true,
				internalType: 'address',
				name: 'dao',
				type: 'address',
			},
			{
				indexed: true,
				internalType: 'address',
				name: 'multiSigPlugin',
				type: 'address',
			},
		],
		name: 'MultiSigConfigured',
		type: 'event',
	},
	{
		inputs: [],
		name: 'EXECUTE_PERMISSION_ID',
		outputs: [
			{
				internalType: 'bytes32',
				name: '',
				type: 'bytes32',
			},
		],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'VALIDATE_SIGNATURE_PERMISSION_ID',
		outputs: [
			{
				internalType: 'bytes32',
				name: '',
				type: 'bytes32',
			},
		],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [
			{
				internalType: 'address',
				name: '_multiSigPlugin',
				type: 'address',
			},
		],
		name: 'configMultisig',
		outputs: [],
		stateMutability: 'nonpayable',
		type: 'function',
	},
	{
		inputs: [
			{
				internalType: 'address',
				name: '',
				type: 'address',
			},
		],
		name: 'daoMultiSigPlugin',
		outputs: [
			{
				internalType: 'address',
				name: '',
				type: 'address',
			},
		],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [
			{
				internalType: 'address',
				name: '_where',
				type: 'address',
			},
			{
				internalType: 'address',
				name: '',
				type: 'address',
			},
			{
				internalType: 'bytes32',
				name: '_permissionId',
				type: 'bytes32',
			},
			{
				internalType: 'bytes',
				name: '_data',
				type: 'bytes',
			},
		],
		name: 'isGranted',
		outputs: [
			{
				internalType: 'bool',
				name: 'isPermitted',
				type: 'bool',
			},
		],
		stateMutability: 'view',
		type: 'function',
	},
] as const;
