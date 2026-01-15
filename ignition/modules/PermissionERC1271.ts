import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { storeConstructorArgs } from '../../helper/store.args';
import { ADDRESS } from '../../exports/address.config';
import { Address, zeroAddress } from 'viem';
import { mainnet } from 'viem/chains';

// config and select
export const NAME: string = 'PermissionERC1271'; // <-- select smart contract
export const FILE: string = 'PermissionERC1271'; // <-- name exported file
export const MOD: string = NAME + 'Module';
console.log(NAME);

// params
export type DeploymentParams = {};

export const params: DeploymentParams = {};

export type ConstructorArgs = [];

export const args: ConstructorArgs = [];

console.log('Imported Params:');
console.log(params);

// export args
storeConstructorArgs(FILE, args);
console.log('Constructor Args');
console.log(args);

// fail safe
process.exit();

export default buildModule(MOD, (m) => {
	return {
		[NAME]: m.contract(NAME, args),
	};
});
