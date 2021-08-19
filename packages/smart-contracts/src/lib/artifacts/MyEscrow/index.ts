import { ContractArtifact } from '../../ContractArtifact';

import { abi as ABI_0_1_0 } from './0.1.0.json';
import type { MyEscrow } from '../../../types/MyEscrow';

export const myescrowArtifact = new ContractArtifact<MyEscrow>(
  {
    '0.1.0': {
      abi: ABI_0_1_0,
      deployment: {
        private: {
          address: '0xB529f14AA8096f943177c09Ca294Ad66d2E08b1f',
          creationBlockNumber: 0,
        },
        mainnet: {
          address: 'TODO',
          creationBlockNumber: 10774767,
        },
        
        rinkeby: {
          address: 'TODO',
          creationBlockNumber: 7118080,
        },
      },
    },
  },
  '0.1.0',
);
