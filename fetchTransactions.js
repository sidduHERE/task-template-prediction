const {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    LAMPORTS_PER_SOL,
    sendAndConfirmTransaction,
    MemoProgram,
    SystemInstruction,
  } = require('@_koii/web3.js');
  const { time } = require('console');
  const fs = require('fs');
  const { TextDecoder } = require('util');
  
  const fetchTransactions = async (address, timestampAfter, timeStampBefore) => {
    //   const connection = new solanaWeb3.Connection('https://solana-mainnet.g.alchemy.com/v2/1-OEoaDckGGcJ8RdbIoLjE1K5RmjFCYq', 'confirmed');
    const connection = new Connection('http://127.0.0.1:8899/', 'confirmed');
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const publicKey = new PublicKey(address);
    console.log(address);
    console.log(publicKey);
    const confirmedSignatures =
      await connection.getConfirmedSignaturesForAddress2(publicKey);
    console.log('confirmedSignatures', confirmedSignatures);
    let transactions = {};
    let memo = null;
    let openInterestLong = 0;
    let openInterestShort = 0;
    for (let i = 0; i < confirmedSignatures.length; i++) {
      const signatureInfo = confirmedSignatures[i];
      if (signatureInfo.memo) {
        //console.log('memo', signatureInfo.memo);
        memo = signatureInfo.memo;
      }
      const signature = signatureInfo.signature;
      const transactionDetail = await connection.getParsedConfirmedTransaction(
        signature,
      );
      //console.log('transactionDetail', transactionDetail);
      const transactionTime = transactionDetail.blockTime;
        console.log(timeStampBefore, transactionTime, timestampAfter);
      if (timeStampBefore >= transactionTime && transactionTime >= timestampAfter) {
        const transaction = transactionDetail.transaction;
        const transactionMessage = transaction.message;
        // console.log(transactionMessage);
        let transferInstruction = null;
        for (const instruction of transactionMessage.instructions
          ? transactionMessage.instructions
          : []) {
          console.log(instruction, 'Individual instruction');
          // console.log('programId', instruction.programIdIndex);
          // console.log(
          //   'programId I get',
          //   transactionMessage.indexToProgramIds.get(instruction.programIdIndex),
          // );
  
          // if (transactionMessage.indexToProgramIds.get(instruction.programIdIndex).toBase58() === SystemProgram.programId.toBase58()) {
          //   transferInstruction = SystemInstruction.decodeTransfer(instruction);
          // }
          if (
            instruction.parsed != null && instruction.parsed.type === 'transfer' &&
            instruction.parsed.info.destination ===
              'stakepotaccountNQxiCc42jv1zamrpi6o9gSH3A2n8'
          ) {
            transferInstruction = instruction.parsed;
  
            // if (transactionMessage.indexToProgramIds.get(instruction.programIdIndex).toBase58() === MemoProgram.programId.toBase58()) {
            //   const decoder = new TextDecoder();
            //   memo = decoder.decode(instruction.data);
            // }
          }
  
          if (instruction.program != null && instruction.program === 'spl-memo') {
            memo = instruction.parsed;
            console.log('memoDecoded', memo);
          }
        }
        console.log(memo, transferInstruction, "what do we have inside");
        if (memo && transferInstruction) {
          const senderAddress = transferInstruction.info.source;
          const solAmount = transferInstruction.info.lamports / LAMPORTS_PER_SOL;
  
          if (memo === 'up') {
              openInterestLong += solAmount;
            transactions[senderAddress] =
              (transactions[senderAddress] ? transactions[senderAddress] : 0) +
              solAmount;
          } else if (memo === 'down') {
              openInterestShort += solAmount;
            transactions[senderAddress] =
              (transactions[senderAddress] ? transactions[senderAddress] : 0) -
              solAmount;
          }
        }
      }
      memo = null;
      transferInstruction = null;
    }
    console.log('Transactions', transactions);
    return  [transactions, openInterestLong, openInterestShort];
    //   fs.writeFileSync('transactions.json', JSON.stringify(transactions));
  };
  
  // Replace 'your-target-address' with the actual address you're interested in
  // fetchTransactions('DBbcK7swh7VLkFJoBdqjf74bbMNwkcoq33GJyYj7NHH4');
   blah();
  
  async function blah() {
    for (let index = 0; index < 1; index++) {
      await transferSol();
    }
  }
  
  async function transferSol() {
    const connection = new Connection('http://127.0.0.1:8899/', 'confirmed');
    const wallet = fs.readFileSync('/Users/diszsid/.config/koii/id.json');
    const payerWallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(wallet)));
    const memoInstruction = new TransactionInstruction({
      keys: [],
      programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      data: Buffer.from('down', 'utf-8'),
    });
  
    const transaction = new Transaction()
      .add(
        SystemProgram.transfer({
          fromPubkey: payerWallet.publicKey,
          toPubkey: 'stakepotaccountNQxiCc42jv1zamrpi6o9gSH3A2n8',
          lamports: LAMPORTS_PER_SOL * 1,
        }),
      )
      .add(memoInstruction);
  
    let txn = await sendAndConfirmTransaction(connection, transaction, [
      payerWallet,
    ]);
    console.log(txn);
  }
  
  module.exports = fetchTransactions;
  