// Reconciliation demo on MAINNET (read-only reads and simulations: nothing is sent, nothing is paid).
// Shows, on Base and Solana, the two checks a buyer runs after an uncertain settlement (PAYMENTS.md §4):
//   1. Did my payment land?  2. When is it safe to sign a new one?
// Run: npm i viem@2 @solana/kit@5 @solana-program/system && node tests/reconciliation-demo.mjs
// Optional: BASE_RPC=... SOLANA_RPC=... (defaults: public endpoints).
import { createRequire } from "node:module";
const req = createRequire(process.env.X402_SERVER_DIR ? process.env.X402_SERVER_DIR + "/package.json" : import.meta.url);
const v = await import(req.resolve("viem"));
const { base } = await import(req.resolve("viem/chains"));
const { privateKeyToAccount, generatePrivateKey } = await import(req.resolve("viem/accounts"));
const k = await import(req.resolve("@solana/kit"));
const { getTransferSolInstruction } = await import(req.resolve("@solana-program/system"));

const BASE_RPC = process.env.BASE_RPC || "https://mainnet.base.org";
const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO_BASE = "0xb9f06D2734B7E9D7b21B64C4D8b95bd774b71aCf";
const PAY_TO_SOL = "HcjfmZLgWRZzwj4deEiS7pewc4KBYSw39mW5nTyt3pz2";
const USDC_SOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TX_BASE = "0xf4ab31807b2498de8baa0a7106b2ccbcd26dfc9284626f9d4a32e95b1a10b76c";   // §6 operator test
const TX_SOL = "3MFE9Fp9DM7Y5MweKA4RXM3JMukcV3QN7opTqiPvixkbooEgZbNKz2Bo9v9BUYsB1v6KYZ7nvJbrpFgVfjFTH5PV"; // §6 customer payment
const short = (s) => String(s).slice(0, 6) + "…" + String(s).slice(-4);
const iso = (t) => new Date(Number(t) * 1000).toISOString();

// ---------------- Base (EIP-3009) ----------------
const abi = v.parseAbi([
  "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)",
  "function authorizationState(address authorizer,bytes32 nonce) view returns (bool)",
]);
const pc = v.createPublicClient({ chain: base, transport: v.http(BASE_RPC) });
const tx = await pc.getTransaction({ hash: TX_BASE });
const blk = await pc.getBlock({ blockNumber: tx.blockNumber });
const { args: [from, to, value, validAfter, validBefore, nonce] } = v.decodeFunctionData({ abi, data: tx.input });
console.log("== Base ==");
console.log(`signed authorization: from ${short(from)} to ${short(to)} value ${value} (USDC 6 dec), nonce ${short(nonce)}`);
console.log(`  validAfter ${iso(validAfter)}  validBefore ${iso(validBefore)}  (settled in block ${tx.blockNumber} at ${iso(blk.timestamp)}, ${Number(validBefore - blk.timestamp)} s before validBefore)`);
const used = await pc.readContract({ address: USDC_BASE, abi, functionName: "authorizationState", args: [from, nonce] });
console.log(`1a. authorizationState(payer, signed nonce) = ${used}  -> payment landed: do NOT pay again`);
const freshNonce = v.toHex(crypto.getRandomValues(new Uint8Array(32)));
const unused = await pc.readContract({ address: USDC_BASE, abi, functionName: "authorizationState", args: [from, freshNonce] });
console.log(`1b. authorizationState(payer, never-submitted nonce) = ${unused}  -> not landed (yet): wait for validBefore`);
// 2. An authorization whose validBefore has passed can never settle: simulate submitting one (eth_call, nothing sent).
const acct = privateKeyToAccount(generatePrivateKey());
const now = BigInt(Math.floor(Date.now() / 1000));
const msg = { from: acct.address, to: PAY_TO_BASE, value: 3000n, validAfter: now - 900n, validBefore: now - 300n, nonce: freshNonce };
const signature = await acct.signTypedData({
  domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC_BASE },
  types: { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
  primaryType: "TransferWithAuthorization", message: msg });
try {
  await pc.simulateContract({ address: USDC_BASE, abi, functionName: "transferWithAuthorization",
    args: [msg.from, msg.to, msg.value, msg.validAfter, msg.validBefore, msg.nonce, signature], account: "0x0000000000000000000000000000000000000001" });
  console.log("2.  simulation of an expired authorization: unexpectedly accepted");
} catch (e) {
  console.log(`2.  simulate transferWithAuthorization with validBefore in the past -> REVERT: "${(e.shortMessage + " " + (e.details || "")).match(/authorization is expired|expired/i)?.[0] || e.shortMessage}"`);
  console.log("    -> after validBefore an unsettled authorization can never settle: retrying is safe");
}

// ---------------- Solana ----------------
const rpc = k.createSolanaRpc(SOLANA_RPC);
const stx = await rpc.getTransaction(TX_SOL, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }).send();
const keys = stx.transaction.message.accountKeys.map((a) => a.pubkey);
const payerBal = stx.meta.postTokenBalances.find((b) => b.owner !== PAY_TO_SOL && b.mint === USDC_SOL);
const payerAta = keys[payerBal.accountIndex];
console.log("\n== Solana ==");
console.log(`payment tx ${short(TX_SOL)} slot ${stx.slot} at ${iso(stx.blockTime)}; fee payer ${short(keys[0])}; buyer ${short(payerBal.owner)}; buyer USDC account ${short(payerAta)}`);
const sigs = await rpc.getSignaturesForAddress(payerAta, { limit: 1000 }).send();
const found = sigs.find((s) => s.signature === TX_SOL);
console.log(`1.  getSignaturesForAddress(buyer USDC account): payment ${found ? "FOUND, err=" + JSON.stringify(found.err) + ", " + found.confirmationStatus : "not found"}  -> landed: do NOT pay again`);
const bh = stx.transaction.message.recentBlockhash;
const valid = (await rpc.isBlockhashValid(bh, { commitment: "processed" }).send()).value;
console.log(`2a. isBlockhashValid(recentBlockhash of that payment ${short(bh)}) = ${valid}`);
// 2b. A transaction built on an expired blockhash is rejected by the network: simulate one (nothing sent).
const signer = await k.generateKeyPairSigner();
const msgSol = k.pipe(k.createTransactionMessage({ version: 0 }), (m) => k.setTransactionMessageFeePayerSigner(signer, m),
  (m) => k.setTransactionMessageLifetimeUsingBlockhash({ blockhash: bh, lastValidBlockHeight: 0n }, m),
  (m) => k.appendTransactionMessageInstruction(getTransferSolInstruction({ source: signer, destination: k.address(PAY_TO_SOL), amount: 1n }), m));
const signed = await k.signTransactionMessageWithSigners(msgSol);
const sim = await rpc.simulateTransaction(k.getBase64EncodedWireTransaction(signed), { encoding: "base64", sigVerify: true, replaceRecentBlockhash: false }).send();
console.log(`2b. simulateTransaction with that expired blockhash -> err ${JSON.stringify(sim.value.err)}`);
console.log("    -> once the blockhash has expired an unlanded transaction can never land: retrying is safe");
