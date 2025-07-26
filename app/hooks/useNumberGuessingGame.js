import { useEffect, useState } from 'react';
import { Connection, PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, BN, web3 } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { IDL } from '../idl/number_guessing_game';

// Constants
const PROGRAM_ID = new PublicKey('Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS');
const PLATFORM_WALLET = new PublicKey('YOUR_PLATFORM_WALLET_ADDRESS'); // Replace with your platform wallet

export const useNumberGuessingGame = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Initialize the program
  const getProgram = () => {
    if (!wallet) return null;
    
    const provider = new AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed' }
    );
    
    return new Program(IDL, PROGRAM_ID, provider);
  };
  
  // Create a new game
  const createGame = async (depositAmount) => {
    try {
      setLoading(true);
      setError(null);
      
      const program = getProgram();
      if (!program) throw new Error('Wallet not connected');
      
      // Generate a unique game ID (timestamp)
      const gameId = new BN(Date.now());
      
      // Calculate the PDA for the game account
      const [gamePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('game'),
          wallet.publicKey.toBuffer(),
          gameId.toArrayLike(Buffer, 'le', 8),
        ],
        program.programId
      );
      
      // Convert deposit amount to lamports
      const depositLamports = new BN(depositAmount * LAMPORTS_PER_SOL);
      
      // Initialize the game
      const tx = await program.methods
        .initializeGame(
          gameId,
          depositLamports,
          10 // 10% platform fee
        )
        .accounts({
          creator: wallet.publicKey,
          game: gamePda,
          platformWallet: PLATFORM_WALLET,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log('Game created with transaction signature', tx);
      
      // Fetch the created game
      await fetchGames();
      
      return { gameId: gameId.toString(), gamePda: gamePda.toString() };
    } catch (err) {
      console.error('Error creating game:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };
  
  // Join a game
  const joinGame = async (gamePda, creator, gameId) => {
    try {
      setLoading(true);
      setError(null);
      
      const program = getProgram();
      if (!program) throw new Error('Wallet not connected');
      
      // Join the game
      const tx = await program.methods
        .joinGame()
        .accounts({
          player: wallet.publicKey,
          game: new PublicKey(gamePda),
          creator: new PublicKey(creator),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log('Joined game with transaction signature', tx);
      
      // Refresh games
      await fetchGames();
      
      return true;
    } catch (err) {
      console.error('Error joining game:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };
  
  // Make a guess
  const makeGuess = async (gamePda, creator, gameId, guess) => {
    try {
      setLoading(true);
      setError(null);
      
      const program = getProgram();
      if (!program) throw new Error('Wallet not connected');
      
      // Validate guess
      if (guess < 1 || guess > 10) {
        throw new Error('Guess must be between 1 and 10');
      }
      
      // Make the guess
      const tx = await program.methods
        .makeGuess(guess)
        .accounts({
          player: wallet.publicKey,
          game: new PublicKey(gamePda),
          creator: new PublicKey(creator),
        })
        .rpc();
      
      console.log('Made guess with transaction signature', tx);
      
      // Refresh games
      await fetchGames();
      
      return true;
    } catch (err) {
      console.error('Error making guess:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };
  
  // Settle a game
  const settleGame = async (gamePda, creator, gameId, playerOne, playerTwo) => {
    try {
      setLoading(true);
      setError(null);
      
      const program = getProgram();
      if (!program) throw new Error('Wallet not connected');
      
      // Generate a random number between 1 and 10
      // In a production environment, you might want to use a verifiable random function or oracle
      const randomNumber = Math.floor(Math.random() * 10) + 1;
      
      // Settle the game
      const tx = await program.methods
        .settleGame(randomNumber)
        .accounts({
          settler: wallet.publicKey,
          game: new PublicKey(gamePda),
          creator: new PublicKey(creator),
          playerOne: new PublicKey(playerOne),
          playerTwo: new PublicKey(playerTwo),
          platformWallet: PLATFORM_WALLET,
        })
        .rpc();
      
      console.log('Settled game with transaction signature', tx);
      
      // Refresh games
      await fetchGames();
      
      return { success: true, randomNumber };
    } catch (err) {
      console.error('Error settling game:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };
  
  // Cancel a game
  const cancelGame = async (gamePda, creator, gameId, playerOne, playerTwo = null) => {
    try {
      setLoading(true);
      setError(null);
      
      const program = getProgram();
      if (!program) throw new Error('Wallet not connected');
      
      // Cancel the game
      const tx = await program.methods
        .cancelGame()
        .accounts({
          authority: wallet.publicKey,
          game: new PublicKey(gamePda),
          creator: new PublicKey(creator),
          playerOne: new PublicKey(playerOne),
          playerTwo: playerTwo ? new PublicKey(playerTwo) : null,
        })
        .rpc();
      
      console.log('Cancelled game with transaction signature', tx);
      
      // Refresh games
      await fetchGames();
      
      return true;
    } catch (err) {
      console.error('Error cancelling game:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch all games created by the connected wallet
  const fetchGames = async () => {
    try {
      setLoading(true);
      
      const program = getProgram();
      if (!program) return;
      
      // Get all program accounts of type GameState
      const gameAccounts = await program.account.gameState.all();
      
      // Filter and format games
      const formattedGames = gameAccounts.map(account => {
        const { publicKey, account: gameState } = account;
        
        return {
          pubkey: publicKey.toString(),
          creator: gameState.playerOne.toString(),
          playerTwo: gameState.playerTwo ? gameState.playerTwo.toString() : null,
          playerOneDeposited: gameState.playerOneDeposited,
          playerTwoDeposited: gameState.playerTwoDeposited,
          playerOneGuess: gameState.playerOneGuess,
          playerTwoGuess: gameState.playerTwoGuess,
          randomNumber: gameState.randomNumber,
          winner: gameState.winner ? gameState.winner.toString() : null,
          depositAmount: gameState.depositAmount.toString(),
          totalPot: gameState.totalPot.toString(),
          platformFeePercent: gameState.platformFeePercent,
          settled: gameState.gameSettled,
          cancelled: gameState.gameCancelled,
          isActive: !gameState.gameSettled && !gameState.gameCancelled,
        };
      });
      
      setGames(formattedGames);
    } catch (err) {
      console.error('Error fetching games:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch games when wallet changes
  useEffect(() => {
    if (wallet) {
      fetchGames();
    } else {
      setGames([]);
    }
  }, [wallet]);
  
  return {
    games,
    loading,
    error,
    createGame,
    joinGame,
    makeGuess,
    settleGame,
    cancelGame,
    fetchGames,
  };
};