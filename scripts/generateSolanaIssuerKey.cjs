const { Keypair } = require('@solana/web3.js');

const keypair = Keypair.generate();

console.log("issuerPublicKey:");
console.log(keypair.publicKey.toBase58());

console.log("\nissuerSecretKey:");
console.log(JSON.stringify(Array.from(keypair.secretKey)));
