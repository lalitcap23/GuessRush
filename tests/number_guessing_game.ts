import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NumberGuessingGame } from "../target/types/number_guessing_game";
import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";

describe("number_guessing_game", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.NumberGuessingGame as Program<NumberGuessingGame>;
  
  // Game parameters
  const gameId = new anchor.BN(1);
  const depositAmount = new anchor.BN(100000000); // 0.1 SOL
  const platformFeePercent = 10; // 10%
  
  // Accounts
  const creator = anchor.web3.Keypair.generate();
  const playerOne = anchor.web3.Keypair.generate();
  const playerTwo = anchor.web3.Keypair.generate();
  const platformWallet = anchor.web3.Keypair.generate();
  
  // PDA for the game account
  const [gamePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("game"),
      creator.publicKey.toBuffer(),
      gameId.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );

  // Fund accounts with SOL
  before(async () => {
    // Airdrop SOL to creator
    const creatorAirdrop = await provider.connection.requestAirdrop(
      creator.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(creatorAirdrop);
    
    // Airdrop SOL to player one
    const playerOneAirdrop = await provider.connection.requestAirdrop(
      playerOne.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(playerOneAirdrop);
    
    // Airdrop SOL to player two
    const playerTwoAirdrop = await provider.connection.requestAirdrop(
      playerTwo.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(playerTwoAirdrop);
    
    // Airdrop SOL to platform wallet
    const platformAirdrop = await provider.connection.requestAirdrop(
      platformWallet.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(platformAirdrop);
  });

  it("Initializes a new game", async () => {
    await program.methods
      .initializeGame(
        gameId,
        depositAmount,
        platformFeePercent
      )
      .accounts({
        creator: creator.publicKey,
        game: gamePda,
        platformWallet: platformWallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Fetch the game account and verify its state
    const gameAccount = await program.account.gameState.fetch(gamePda);
    
    expect(gameAccount.isInitialized).to.be.true;
    expect(gameAccount.playerOne.toString()).to.equal(creator.publicKey.toString());
    expect(gameAccount.playerTwo).to.be.null;
    expect(gameAccount.playerOneDeposited).to.be.false;
    expect(gameAccount.playerTwoDeposited).to.be.false;
    expect(gameAccount.playerOneGuess).to.be.null;
    expect(gameAccount.playerTwoGuess).to.be.null;
    expect(gameAccount.randomNumber).to.be.null;
    expect(gameAccount.winner).to.be.null;
    expect(gameAccount.depositAmount.toString()).to.equal(depositAmount.toString());
    expect(gameAccount.totalPot.toString()).to.equal("0");
    expect(gameAccount.platformFeePercent).to.equal(platformFeePercent);
    expect(gameAccount.platformWallet.toString()).to.equal(platformWallet.publicKey.toString());
    expect(gameAccount.gameSettled).to.be.false;
    expect(gameAccount.gameCancelled).to.be.false;
  });

  it("Player one (creator) joins the game and deposits SOL", async () => {
    const playerOneBalanceBefore = await provider.connection.getBalance(creator.publicKey);
    
    await program.methods
      .joinGame(gameId) // Added missing gameId parameter
      .accounts({
        player: creator.publicKey, // Creator is player one
        game: gamePda,
        creator: creator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Fetch the game account and verify its state
    const gameAccount = await program.account.gameState.fetch(gamePda);
    
    expect(gameAccount.playerOneDeposited).to.be.true;
    expect(gameAccount.totalPot.toString()).to.equal(depositAmount.toString());
    
    // Check player one's balance decreased by deposit amount (plus some for transaction fee)
    const playerOneBalanceAfter = await provider.connection.getBalance(creator.publicKey);
    expect(playerOneBalanceBefore - playerOneBalanceAfter).to.be.greaterThan(depositAmount.toNumber());
  });

  it("Player two joins the game and deposits SOL", async () => {
    const playerTwoBalanceBefore = await provider.connection.getBalance(playerTwo.publicKey);
    
    await program.methods
      .joinGame(gameId) // Added missing gameId parameter
      .accounts({
        player: playerTwo.publicKey,
        game: gamePda,
        creator: creator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([playerTwo])
      .rpc();

    // Fetch the game account and verify its state
    const gameAccount = await program.account.gameState.fetch(gamePda);
    
    expect(gameAccount.playerTwo.toString()).to.equal(playerTwo.publicKey.toString());
    expect(gameAccount.playerTwoDeposited).to.be.true;
    expect(gameAccount.totalPot.toString()).to.equal((depositAmount.toNumber() * 2).toString());
    
    // Check player two's balance decreased by deposit amount (plus some for transaction fee)
    const playerTwoBalanceAfter = await provider.connection.getBalance(playerTwo.publicKey);
    expect(playerTwoBalanceBefore - playerTwoBalanceAfter).to.be.greaterThan(depositAmount.toNumber());
  });

  it("Player one makes a guess", async () => {
    const playerOneGuess = 3;
    
    await program.methods
      .makeGuess(gameId, playerOneGuess) // Added missing gameId parameter
      .accounts({
        player: creator.publicKey, // Creator is player one
        game: gamePda,
        creator: creator.publicKey,
      })
      .signers([creator])
      .rpc();

    // Fetch the game account and verify its state
    const gameAccount = await program.account.gameState.fetch(gamePda);
    
    expect(gameAccount.playerOneGuess).to.equal(playerOneGuess);
  });

  it("Player two makes a guess", async () => {
    const playerTwoGuess = 7;
    
    await program.methods
      .makeGuess(gameId, playerTwoGuess) // Added missing gameId parameter
      .accounts({
        player: playerTwo.publicKey,
        game: gamePda,
        creator: creator.publicKey,
      })
      .signers([playerTwo])
      .rpc();

    // Fetch the game account and verify its state
    const gameAccount = await program.account.gameState.fetch(gamePda);
    
    expect(gameAccount.playerTwoGuess).to.equal(playerTwoGuess);
  });

  it("Settles the game and distributes funds", async () => {
    const platformWalletBalanceBefore = await provider.connection.getBalance(platformWallet.publicKey);
    const playerOneBalanceBefore = await provider.connection.getBalance(creator.publicKey);
    const playerTwoBalanceBefore = await provider.connection.getBalance(playerTwo.publicKey);
    
    // Random number is 5, so player one (guess 3) is closer than player two (guess 7)
    const randomNumber = 5;
    
    await program.methods
      .settleGame(gameId, randomNumber) // Added missing gameId parameter
      .accounts({
        settler: creator.publicKey,
        game: gamePda,
        creator: creator.publicKey,
        playerOne: creator.publicKey, // Creator is player one
        playerTwo: playerTwo.publicKey,
        platformWallet: platformWallet.publicKey,
      })
      .signers([creator])
      .rpc();

    // Fetch the game account and verify its state
    const gameAccount = await program.account.gameState.fetch(gamePda);
    
    expect(gameAccount.randomNumber).to.equal(randomNumber);
    expect(gameAccount.gameSettled).to.be.true;
    expect(gameAccount.winner.toString()).to.equal(creator.publicKey.toString()); // Player one won
    
    // Check platform wallet received 10% fee
    const platformWalletBalanceAfter = await provider.connection.getBalance(platformWallet.publicKey);
    const expectedPlatformFee = depositAmount.toNumber() * 2 * 0.1; // 10% of total pot
    expect(platformWalletBalanceAfter - platformWalletBalanceBefore).to.equal(expectedPlatformFee);
    
    // Check player one received 90% of the pot (as the winner)
    const playerOneBalanceAfter = await provider.connection.getBalance(creator.publicKey);
    const expectedWinnings = depositAmount.toNumber() * 2 * 0.9; // 90% of total pot
    expect(playerOneBalanceAfter - playerOneBalanceBefore).to.equal(expectedWinnings);
    
    // Check player two didn't receive anything
    const playerTwoBalanceAfter = await provider.connection.getBalance(playerTwo.publicKey);
    expect(playerTwoBalanceAfter).to.equal(playerTwoBalanceBefore);
  });

  it("Initializes and cancels a game", async () => {
    // Create a new game with a different ID
    const newGameId = new anchor.BN(2);
    
    const [newGamePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("game"),
        creator.publicKey.toBuffer(),
        newGameId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    
    // Initialize the new game
    await program.methods
      .initializeGame(
        newGameId,
        depositAmount,
        platformFeePercent
      )
      .accounts({
        creator: creator.publicKey,
        game: newGamePda,
        platformWallet: platformWallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();
    
    // Player one (creator) joins the new game
    await program.methods
      .joinGame(newGameId) // Added missing gameId parameter
      .accounts({
        player: creator.publicKey, // Creator is player one
        game: newGamePda,
        creator: creator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();
    
    // Get player one's balance before cancellation
    const playerOneBalanceBefore = await provider.connection.getBalance(creator.publicKey);
    
    // Cancel the game
    await program.methods
      .cancelGame(newGameId) // Added missing gameId parameter
      .accounts({
        authority: creator.publicKey,
        game: newGamePda,
        creator: creator.publicKey,
        playerOne: creator.publicKey, // Creator is player one
        playerTwo: null, // No player two joined yet
      })
      .signers([creator])
      .rpc();
    
    // Fetch the game account and verify its state
    const gameAccount = await program.account.gameState.fetch(newGamePda);
    
    expect(gameAccount.gameCancelled).to.be.true;
    
    // Check player one received their deposit back
    const playerOneBalanceAfter = await provider.connection.getBalance(creator.publicKey);
    expect(playerOneBalanceAfter - playerOneBalanceBefore).to.equal(depositAmount.toNumber());
  });

  // Additional test for edge cases
  it("Should fail when trying to guess outside valid range", async () => {
    // Create a new game for this test
    const newGameId = new anchor.BN(3);
    
    const [newGamePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("game"),
        creator.publicKey.toBuffer(),
        newGameId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    
    // Initialize the new game
    await program.methods
      .initializeGame(
        newGameId,
        depositAmount,
        platformFeePercent
      )
      .accounts({
        creator: creator.publicKey,
        game: newGamePda,
        platformWallet: platformWallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();
    
    // Creator joins and deposits
    await program.methods
      .joinGame(newGameId)
      .accounts({
        player: creator.publicKey,
        game: newGamePda,
        creator: creator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();
    
    // Try to make an invalid guess (0 is outside valid range 1-10)
    try {
      await program.methods
        .makeGuess(newGameId, 0) // Invalid guess
        .accounts({
          player: creator.publicKey,
          game: newGamePda,
          creator: creator.publicKey,
        })
        .signers([creator])
        .rpc();
      
      // If we reach here, the test should fail
      expect.fail("Expected transaction to fail with invalid guess");
    } catch (error) {
      // Expected error for invalid guess
      expect(error.message).to.include("InvalidGuess");
    }
    
    // Try to make an invalid guess (11 is outside valid range 1-10)
    try {
      await program.methods
        .makeGuess(newGameId, 11) // Invalid guess
        .accounts({
          player: creator.publicKey,
          game: newGamePda,
          creator: creator.publicKey,
        })
        .signers([creator])
        .rpc();
      
      // If we reach here, the test should fail
      expect.fail("Expected transaction to fail with invalid guess");
    } catch (error) {
      // Expected error for invalid guess
      expect(error.message).to.include("InvalidGuess");
    }
  });
});