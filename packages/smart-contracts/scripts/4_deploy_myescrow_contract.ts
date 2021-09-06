import '@nomiclabs/hardhat-ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { deployOne } from './deploy-one';
import {
  MyEscrow__factory,
  MyEscrow
} from '../src/types';

export default async function deploy(arg: any, hre: HardhatRuntimeEnvironment) {
  // Assign the deployer
  const [ deployer ] = await hre.ethers.getSigners();
  // Deploy the contracts

  const TestTokenInstance = await deployOne(arg, hre, 'TestToken');

  const TestERC20FeeProxyInstance = await deployOne(arg, hre, 'TestERC20FeeProxy');
  
  let MyEscrowInstance: MyEscrow;
  MyEscrowInstance = await new MyEscrow__factory(deployer).deploy(TestERC20FeeProxyInstance);
  

  console.log("MyEscrow contracts deployment status:")
  console.log(`
    TestToken contract deployed to address:               ${TestTokenInstance},
    ITestERC20FeeProxy contract deployed to address:      ${TestERC20FeeProxyInstance},
    MyEscrow contract deployed to address:                ${MyEscrowInstance.address} 
  `);

}
