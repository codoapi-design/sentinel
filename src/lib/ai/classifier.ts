/**
 *     — CryptoBooks Enterprise
 *
 *     (LLM)  z-ai-web-dev-sdk 
 *     .    :
 * NFT mint/sale, Bridge, Airdrop, Governance, Liquidation,
 * Flash Loan, Rebase, Multi-sig, .
 *    (fallback)    .
 */

import ZAI from 'z-ai-web-dev-sdk';

// ============================================================
//  
// ============================================================

/**
 *    —    
 */
export interface UnclassifiedTransaction {
  /**   */
  txHash: string;
  /**   */
  from: string;
  /**   */
  to: string;
  /**  ( wei   ) */
  value: string;
  /**   (calldata) */
  data: string;
  /**  */
  network: string;
  /**   (logs) */
  logs?: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
}

/**
 *    
 */
export interface AIClassificationResult {
  /**    */
  type: string;
  /**    */
  typeAr: string;
  /**    */
  subType: string | null;
  /**    */
  subTypeAr: string | null;
  /**   */
  protocol: string | null;
  /**   */
  protocolAr: string | null;
  /**   (0-1) */
  confidence: number;
  /**   */
  explanation: string;
  /**   */
  explanationAr: string;
}

// ============================================================
//  —   
// ============================================================

/**    */
const STANDARD_TYPES: Record<string, { en: string; ar: string }> = {
  income: { en: 'income', ar: 'Income' },
  expense: { en: 'expense', ar: 'Expense' },
  trade: { en: 'trade', ar: 'Trade' },
  defi: { en: 'defi', ar: 'DeFi' },
  staking: { en: 'staking', ar: 'Staking Reward' },
  gas: { en: 'gas', ar: 'Gas Fees' },
};

/**    (Enterprise) */
const ADVANCED_TYPES: Record<string, { en: string; ar: string }> = {
  nft_mint: { en: 'nft_mint', ar: 'nft_mint' },
  nft_sale: { en: 'nft_sale', ar: 'nft_sale' },
  bridge: { en: 'bridge', ar: 'Bridge' },
  airdrop: { en: 'airdrop', ar: 'airdrop' },
  governance: { en: 'governance', ar: 'governance' },
  liquidation: { en: 'liquidation', ar: 'liquidation' },
  flash_loan: { en: 'flash_loan', ar: 'flash_loan' },
  rebase: { en: 'rebase', ar: 'rebase' },
  multi_sig: { en: 'multi_sig', ar: 'multi_sig' },
  contract_interaction: { en: 'contract_interaction', ar: 'contract_interaction' },
};

/**    */
const ALL_TYPES = { ...STANDARD_TYPES, ...ADVANCED_TYPES };

// ============================================================
//      
// ============================================================

/**
 *        
 * @returns true    API 
 */
export function isAIClassificationAvailable(): boolean {
  //        z-ai-web-dev-sdk
  //     API 
  return true;
}

// ============================================================
//   
// ============================================================

/**
 *      
 * @param transaction   
 * @returns  
 */
export async function classifyWithAI(
  transaction: UnclassifiedTransaction,
): Promise<AIClassificationResult> {
  try {
    const zai = await ZAI.create();

    //   
    const systemPrompt = `You are a blockchain transaction classifier for a crypto accounting platform. 
Classify the given transaction into one of these categories:
- income: Incoming transfer (native or ERC-20)
- expense: Outgoing transfer (native or ERC-20)
- trade: Token swap on DEX
- defi: DeFi interaction (lending, borrowing, liquidity)
- staking: Staking reward
- gas: Gas fee only
- nft_mint: NFT minting
- nft_sale: NFT sale/purchase
- bridge: Cross-chain bridge transaction
- airdrop: Token airdrop claim
- governance: DAO governance vote
- liquidation: DeFi liquidation event
- flash_loan: Flash loan transaction
- rebase: Rebase/elastic supply adjustment
- multi_sig: Multi-signature wallet operation
- contract_interaction: General smart contract interaction

Also identify the protocol if possible (e.g., Uniswap, Aave, Compound, OpenSea, etc.).

Respond in JSON format only:
{
  "type": "category",
  "subType": "specific subtype or null",
  "protocol": "protocol name or null",
  "confidence": 0.0-1.0,
  "explanation": "brief explanation in English"
}`;

    //      
    const userPrompt = `Classify this blockchain transaction:

Transaction Hash: ${transaction.txHash}
From: ${transaction.from}
To: ${transaction.to}
Value: ${transaction.value}
Network: ${transaction.network}
Data (first 200 chars): ${transaction.data?.substring(0, 200) || '0x'}
${transaction.logs && transaction.logs.length > 0
      ? `Event Logs (${transaction.logs.length} events):
${transaction.logs.slice(0, 5).map((log, i) =>
  `  Log ${i + 1}: Address=${log.address}, Topics=${JSON.stringify(log.topics?.slice(0, 3))}`
).join('\n')}`
      : 'No event logs available'
    }`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    //  
    const content = completion.choices?.[0]?.message?.content || '';

    //   JSON  
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return fallbackClassification(transaction, '    ');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    //    
    const typeInfo = ALL_TYPES[parsed.type] || ALL_TYPES.contract_interaction;

    return {
      type: typeInfo.en,
      typeAr: typeInfo.ar,
      subType: parsed.subType || null,
      subTypeAr: parsed.subType ? translateSubType(parsed.subType) : null,
      protocol: parsed.protocol || null,
      protocolAr: parsed.protocol ? translateProtocol(parsed.protocol) : null,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      explanation: parsed.explanation || 'No explanation provided',
      explanationAr: translateExplanation(parsed.explanation || ''),
    };
  } catch (error) {
    console.error('    :', error);
    return fallbackClassification(
      transaction,
      error instanceof Error ? error.message : '  ',
    );
  }
}

/**
 *        
 * @param transactions    
 * @returns   
 */
export async function batchClassifyWithAI(
  transactions: UnclassifiedTransaction[],
): Promise<AIClassificationResult[]> {
  const results: AIClassificationResult[] = [];

  //      (    )
  for (const tx of transactions) {
    const result = await classifyWithAI(tx);
    results.push(result);
  }

  return results;
}

// ============================================================
//   (Rule-based Fallback)
// ============================================================

/**
 *         
 * @param transaction   
 * @param errorReason     
 * @returns   
 */
function fallbackClassification(
  transaction: UnclassifiedTransaction,
  errorReason: string,
): AIClassificationResult {
  let type = 'contract_interaction';
  let confidence = 0.3;
  let explanation = `Rule-based classification (AI fallback: ${errorReason})`;

  //   
  const dataLower = (transaction.data || '').toLowerCase();

  //     
  if (!transaction.data || transaction.data === '0x' || dataLower === '0x') {
    //     →   
    if (transaction.value && transaction.value !== '0' && transaction.value !== '0x0') {
      type = 'expense';
      confidence = 0.5;
      explanation = 'Simple native token transfer without contract data';
    } else {
      type = 'gas';
      confidence = 0.4;
      explanation = 'Transaction with no value and no data';
    }
  } else if (dataLower.startsWith('0x3593564c') || dataLower.startsWith('0x04e45aaf')) {
    // Uniswap V3 / Universal Router
    type = 'trade';
    confidence = 0.7;
    explanation = 'DEX swap detected by method ID';
  } else if (dataLower.startsWith('0x38ed1739') || dataLower.startsWith('0x7ff36ab5')) {
    // Uniswap V2 swaps
    type = 'trade';
    confidence = 0.7;
    explanation = 'DEX swap detected by method ID (V2 router)';
  } else if (dataLower.startsWith('0xe8eda9df') || dataLower.startsWith('0xa0712d68')) {
    // Aave deposit / Compound mint
    type = 'defi';
    confidence = 0.65;
    explanation = 'DeFi lending deposit detected by method ID';
  } else if (dataLower.startsWith('0x6e553f65') || dataLower.startsWith('0xa694fc3a')) {
    // Lido submit / stake
    type = 'staking';
    confidence = 0.65;
    explanation = 'Staking operation detected by method ID';
  } else if (dataLower.startsWith('0x428d7197') || dataLower.startsWith('0x9ca36928')) {
    // Bridge deposit/withdraw
    type = 'bridge';
    confidence = 0.6;
    explanation = 'Bridge operation detected by method ID';
  } else if (dataLower.startsWith('0x60806040') || dataLower.length > 5000) {
    // Contract deployment (long data starting with contract init)
    type = 'contract_interaction';
    confidence = 0.5;
    explanation = 'Possible contract deployment or complex interaction';
  } else {
    //   
    if (transaction.logs && transaction.logs.length > 0) {
      const hasTransferLog = transaction.logs.some(
        log => log.topics[0]?.toLowerCase() === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
      );
      const hasSwapLog = transaction.logs.some(
        log => log.topics[0]?.toLowerCase() === '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822'
      );

      if (hasSwapLog) {
        type = 'trade';
        confidence = 0.6;
        explanation = 'DEX swap detected by Swap event log';
      } else if (hasTransferLog) {
        type = 'trade';
        confidence = 0.5;
        explanation = 'Token transfer detected by Transfer event log';
      }
    }

    //        
    if (type === 'contract_interaction' && confidence < 0.4) {
      explanation = 'Unclassified contract interaction (fallback classification)';
    }
  }

  const typeInfo = ALL_TYPES[type] || ALL_TYPES.contract_interaction;

  return {
    type: typeInfo.en,
    typeAr: typeInfo.ar,
    subType: null,
    subTypeAr: null,
    protocol: null,
    protocolAr: null,
    confidence,
    explanation,
    explanationAr: translateExplanation(explanation),
  };
}

// ============================================================
//  
// ============================================================

/**    */
function translateSubType(subType: string): string {
  const translations: Record<string, string> = {
    'swap': '',
    'deposit': '',
    'withdraw': '',
    'borrow': '',
    'repay': '',
    'stake': '',
    'unstake': ' ',
    'claim': '',
    'mint': '',
    'burn': '',
    'approve': '',
    'delegate': '',
    'vote': '',
    'execute': '',
    'propose': '',
  };
  return translations[subType.toLowerCase()] || subType;
}

/**    */
function translateProtocol(protocol: string): string {
  const translations: Record<string, string> = {
    'uniswap': '',
    'uniswap v2': ' V2',
    'uniswap v3': ' V3',
    'sushiswap': ' ',
    '1inch': '1',
    'curve': '',
    'aave': '',
    'compound': '',
    'lido': '',
    'makerdao': ' ',
    'balancer': '',
    'yearn': '',
    'opensea': ' ',
    'looksRare': ' ',
    'blur': '',
    'paraswap': '',
    'rocket pool': ' ',
    'arbitrum bridge': ' ',
    'optimism bridge': ' ',
  };
  return translations[protocol.toLowerCase()] || protocol;
}

/**      () */
function translateExplanation(explanation: string): string {
  if (!explanation) return '   ';

  //    
  const replacements: Array<[string, string]> = [
    ['transaction', ''],
    ['swap', ''],
    ['transfer', ''],
    ['deposit', ''],
    ['withdraw', ''],
    ['staking', ''],
    ['bridge', ''],
    ['airdrop', ''],
    ['NFT', '   '],
    ['detected', '  '],
    ['classified as', '  '],
    ['No explanation', '  '],
    ['fallback', ''],
    ['rule-based', '  '],
  ];

  let translated = explanation;
  for (const [en, ar] of replacements) {
    translated = translated.replace(new RegExp(en, 'gi'), ar);
  }

  return translated;
}
