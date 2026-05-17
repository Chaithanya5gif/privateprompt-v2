/**
 * PrivatePrompt V2 — Midnight Blockchain Integration
 * Writes SHA-256 commitment hashes to Midnight smart contract.
 * Uses mock implementation for demo if Midnight SDK unavailable.
 */

/**
 * Compute SHA-256 hash of the commitment data
 * @param {string} anonymizedPrompt
 * @param {string} sessionNonce
 * @returns {Promise<string>} Hex hash string
 */
export async function computeCommitmentHash(anonymizedPrompt, sessionNonce) {
  const timestamp = new Date().toISOString();
  const payload = `${anonymizedPrompt}::${timestamp}::${sessionNonce}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return { hash: hashHex, timestamp, payload };
}

/**
 * Write a commitment to the Midnight blockchain.
 * 
 * NOTE: In production, this uses the Midnight.js SDK + Lace wallet.
 * For hackathon demo, we compute and display the hash + simulate the tx.
 * The architecture is real; the on-chain write requires Lace wallet connection.
 * 
 * @param {string} anonymizedPrompt - The anonymized (no PII) prompt
 * @param {string} sessionNonce - UUID for this session
 * @param {Function} onStatusChange - Callback for status updates
 * @returns {Promise<{txHash, explorerUrl, commitment}>}
 */
export async function writeToMidnight(anonymizedPrompt, sessionNonce, onStatusChange) {
  onStatusChange('computing');
  
  const { hash, timestamp } = await computeCommitmentHash(anonymizedPrompt, sessionNonce);
  
  onStatusChange('signing');
  
  // Simulate wallet signing delay (in real impl: Lace wallet prompts here)
  await new Promise(r => setTimeout(r, 1200));
  
  onStatusChange('broadcasting');
  
  // Generate a realistic-looking Midnight transaction hash for simulation
  const txHashBytes = new Uint8Array(32);
  crypto.getRandomValues(txHashBytes);
  const txHash = '0x' + Array.from(txHashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  
  onStatusChange('confirmed');
  
  return {
    txHash,
    simulated: true,
    commitment: hash,
    timestamp,
    sessionNonce,
    payload: `${anonymizedPrompt}::${timestamp}::${sessionNonce}`
  };
}

/**
 * Check if Lace wallet is available
 */
export function isLaceWalletAvailable() {
  return typeof window !== 'undefined' && 
    (window.midnight !== undefined || window.cardano?.lace !== undefined);
}

/**
 * Connect to Lace wallet
 */
export async function connectLaceWallet() {
  if (!isLaceWalletAvailable()) {
    // Return mock connection for demo
    return {
      connected: true,
      address: '0x' + Math.random().toString(16).slice(2, 12) + '...' + Math.random().toString(16).slice(2, 6),
      network: 'Midnight Mainnet',
      mock: true,
    };
  }
  
  try {
    // Real Lace wallet connection would go here
    const api = await window.midnight?.enable?.();
    return {
      connected: true,
      address: await api?.getAddress?.(),
      network: 'Midnight Mainnet',
      mock: false,
    };
  } catch {
    return { connected: false, error: 'Wallet connection rejected' };
  }
}
