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
    const creatorBalanceBefore = await provider.connection.getBalance(creator.publicKey);
    
    await program.methods
      .joinGame(gameId)
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
    
    // Check creator's balance decreased by at least deposit amount
    const creatorBalanceAfter = await provider.connection.getBalance(creator.publicKey);
    const balanceDecrease = creatorBalanceBefore - creatorBalanceAfter;
    expect(balanceDecrease).to.be.at.least(depositAmount.toNumber());
  });

  it("Player two joins the game and deposits SOL", async () => {
    const playerTwoBalanceBefore = await provider.connection.getBalance(playerTwo.publicKey);
    
    await program.methods
      .joinGame(gameId)
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
    
    // Check player two's balance decreased by at least deposit amount
    const playerTwoBalanceAfter = await provider.connection.getBalance(playerTwo.publicKey);
    const balanceDecrease = playerTwoBalanceBefore - playerTwoBalanceAfter;
    expect(balanceDecrease).to.be.at.least(depositAmount.toNumber());
  });

  it("Player one makes a guess", async () => {
    const playerOneGuess = 3;
    
    await program.methods
      .makeGuess(gameId, playerOneGuess)
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
      .makeGuess(gameId, playerTwoGuess)
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
    const creatorBalanceBefore = await provider.connection.getBalance(creator.publicKey);
    const playerTwoBalanceBefore = await provider.connection.getBalance(playerTwo.publicKey);
    
    // Random number is 5, so player one (guess 3) is closer than player two (guess 7)
    // Player one diff: |3-5| = 2
    // Player two diff: |7-5| = 2
    // It's actually a tie! Let's change random number to make player one win clearly
    const randomNumber = 4; // Now player one (guess 3) diff = 1, player two (guess 7) diff = 3
    
    await program.methods
      .settleGame(gameId, randomNumber)
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
    
    // Check if winner is set correctly (player one should win)
    if (gameAccount.winner) {
      expect(gameAccount.winner.toString()).to.equal(creator.publicKey.toString());
    } else {
      // If it's a tie, winner might be null
      console.log("Game resulted in a tie");
    }
    
    // Check platform wallet received fee
    const platformWalletBalanceAfter = await provider.connection.getBalance(platformWallet.publicKey);
    const expectedPlatformFee = depositAmount.toNumber() * 2 * 0.1; // 10% of total pot
    expect(platformWalletBalanceAfter - platformWalletBalanceBefore).to.equal(expectedPlatformFee);
    
    // Check that total winnings were distributed (either to winner or split)
    const creatorBalanceAfter = await provider.connection.getBalance(creator.publicKey);
    const playerTwoBalanceAfter = await provider.connection.getBalance(playerTwo.publicKey);
    
    const creatorWinnings = creatorBalanceAfter - creatorBalanceBefore;
    const playerTwoWinnings = playerTwoBalanceAfter - playerTwoBalanceBefore;
    
    // Total winnings should equal 90% of pot (after platform fee)
    const expectedRemainingPot = depositAmount.toNumber() * 2 * 0.9;
    expect(creatorWinnings + playerTwoWinnings).to.equal(expectedRemainingPot);
    
    // With random number 4, player one should win all remaining pot
    expect(creatorWinnings).to.equal(expectedRemainingPot);
    expect(playerTwoWinnings).to.equal(0);
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
      .joinGame(newGameId)
      .accounts({
        player: creator.publicKey, // Creator is player one
        game: newGamePda,
        creator: creator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();
    
    // Get creator's balance before cancellation
    const creatorBalanceBefore = await provider.connection.getBalance(creator.publicKey);
    
    // Cancel the game
    await program.methods
      .cancelGame(newGameId)
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
    
    // Check creator received their deposit back
    const creatorBalanceAfter = await provider.connection.getBalance(creator.publicKey);
    const balanceIncrease = creatorBalanceAfter - creatorBalanceBefore;
    
    // Should get exactly the deposit amount back
    expect(balanceIncrease).to.equal(depositAmount.toNumber());
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