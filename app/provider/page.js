'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useNumberGuessingGame } from '../hooks/useNumberGuessingGame';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export default function Home() {
  const { publicKey, connected } = useWallet();
  const {
    games,
    loading,
    error,
    createGame,
    joinGame,
    makeGuess,
    settleGame,
    cancelGame,
    fetchGames,
  } = useNumberGuessingGame();

  const [depositAmount, setDepositAmount] = useState(0.1);
  const [selectedGuess, setSelectedGuess] = useState(1);
  const [activeGame, setActiveGame] = useState(null);
  const [gameResult, setGameResult] = useState(null);

  // Refresh games periodically
  useEffect(() => {
    if (connected) {
      const interval = setInterval(() => {
        fetchGames();
      }, 10000);
      
      return () => clearInterval(interval);
    }
  }, [connected, fetchGames]);

  // Handle create game
  const handleCreateGame = async () => {
    if (!connected) return;
    
    const result = await createGame(depositAmount);
    if (result) {
      setActiveGame(result);
    }
  };

  // Handle join game
  const handleJoinGame = async (game) => {
    if (!connected) return;
    
    await joinGame(game.pubkey, game.creator, game.gameId);
  };

  // Handle make guess
  const handleMakeGuess = async (game) => {
    if (!connected) return;
    
    await makeGuess(game.pubkey, game.creator, game.gameId, selectedGuess);
  };

  // Handle settle game
  const handleSettleGame = async (game) => {
    if (!connected) return;
    
    const result = await settleGame(
      game.pubkey,
      game.creator,
      game.gameId,
      game.creator, // player one is the creator
      game.playerTwo
    );
    
    if (result.success) {
      setGameResult({
        randomNumber: result.randomNumber,
        playerOneGuess: game.playerOneGuess,
        playerTwoGuess: game.playerTwoGuess,
        winner: result.randomNumber
      });
    }
  };

  // Handle cancel game
  const handleCancelGame = async (game) => {
    if (!connected) return;
    
    await cancelGame(
      game.pubkey,
      game.creator,
      game.gameId,
      game.creator, // player one is the creator
      game.playerTwo
    );
  };

  // Filter active games (not settled or cancelled)
  const activeGames = games.filter(game => game.isActive);
  
  // Filter completed games (settled)
  const completedGames = games.filter(game => game.settled);
  
  // Filter cancelled games
  const cancelledGames = games.filter(game => game.cancelled);
  
  // Filter games created by the current user
  const myCreatedGames = connected ? 
    activeGames.filter(game => game.creator === publicKey.toString()) : 
    [];
  
  // Filter games where the current user can join
  const availableGames = connected ? 
    activeGames.filter(game => 
      game.creator !== publicKey.toString() && 
      (!game.playerTwo || game.playerTwo === publicKey.toString()) &&
      !game.playerTwoDeposited
    ) : 
    [];
  
  // Filter games where the current user has joined and needs to make a guess
  const myJoinedGames = connected ? 
    activeGames.filter(game => 
      (game.creator === publicKey.toString() && !game.playerOneGuess) ||
      (game.playerTwo === publicKey.toString() && !game.playerTwoGuess)
    ) : 
    [];
  
  // Filter games ready to be settled (both players have made guesses)
  const gamesToSettle = connected ? 
    activeGames.filter(game => 
      game.playerOneGuess !== null && 
      game.playerTwoGuess !== null &&
      (game.creator === publicKey.toString() || game.playerTwo === publicKey.toString())
    ) : 
    [];

  return (
    <main className="flex min-h-screen flex-col items-center p-8 bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-8">Solana Number Guessing Game</h1>
      
      <div className="mb-8">
        <WalletMultiButton />
      </div>
      
      {error && (
        <div className="bg-red-500 text-white p-4 rounded-md mb-8 w-full max-w-3xl">
          {error}
        </div>
      )}
      
      {connected && (
        <div className="w-full max-w-3xl">
          <div className="bg-gray-800 p-6 rounded-lg mb-8">
            <h2 className="text-2xl font-bold mb-4">Create New Game</h2>
            <div className="flex items-center mb-4">
              <label className="mr-4">Deposit Amount (SOL):</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={depositAmount}
                onChange={(e) => setDepositAmount(parseFloat(e.target.value))}
                className="bg-gray-700 text-white p-2 rounded"
              />
            </div>
            <button
              onClick={handleCreateGame}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Game'}
            </button>
          </div>
          
          {myCreatedGames.length > 0 && (
            <div className="bg-gray-800 p-6 rounded-lg mb-8">
              <h2 className="text-2xl font-bold mb-4">My Created Games</h2>
              <div className="space-y-4">
                {myCreatedGames.map((game) => (
                  <div key={game.pubkey} className="bg-gray-700 p-4 rounded-md">
                    <p>Game ID: {game.pubkey.slice(0, 8)}...</p>
                    <p>Deposit Amount: {parseInt(game.depositAmount) / LAMPORTS_PER_SOL} SOL</p>
                    <p>Total Pot: {parseInt(game.totalPot) / LAMPORTS_PER_SOL} SOL</p>
                    <p>Status: {game.playerTwoDeposited ? 'Waiting for guesses' : 'Waiting for player two'}</p>
                    {!game.playerOneGuess && game.playerOneDeposited && (
                      <div className="mt-2">
                        <label className="block mb-2">Your Guess (1-10):</label>
                        <div className="flex items-center">
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={selectedGuess}
                            onChange={(e) => setSelectedGuess(parseInt(e.target.value))}
                            className="bg-gray-600 text-white p-2 rounded mr-2"
                          />
                          <button
                            onClick={() => handleMakeGuess(game)}
                            disabled={loading}
                            className="bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded disabled:opacity-50"
                          >
                            Submit Guess
                          </button>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => handleCancelGame(game)}
                      disabled={loading}
                      className="bg-red-600 hover:bg-red-700 text-white py-1 px-3 rounded mt-2 disabled:opacity-50"
                    >
                      Cancel Game
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {availableGames.length > 0 && (
            <div className="bg-gray-800 p-6 rounded-lg mb-8">
              <h2 className="text-2xl font-bold mb-4">Available Games to Join</h2>
              <div className="space-y-4">
                {availableGames.map((game) => (
                  <div key={game.pubkey} className="bg-gray-700 p-4 rounded-md">
                    <p>Game ID: {game.pubkey.slice(0, 8)}...</p>
                    <p>Creator: {game.creator.slice(0, 8)}...</p>
                    <p>Deposit Required: {parseInt(game.depositAmount) / LAMPORTS_PER_SOL} SOL</p>
                    <button
                      onClick={() => handleJoinGame(game)}
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded mt-2 disabled:opacity-50"
                    >
                      Join Game
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {myJoinedGames.length > 0 && (
            <div className="bg-gray-800 p-6 rounded-lg mb-8">
              <h2 className="text-2xl font-bold mb-4">My Games to Make a Guess</h2>
              <div className="space-y-4">
                {myJoinedGames.map((game) => (
                  <div key={game.pubkey} className="bg-gray-700 p-4 rounded-md">
                    <p>Game ID: {game.pubkey.slice(0, 8)}...</p>
                    <p>Creator: {game.creator.slice(0, 8)}...</p>
                    <p>Total Pot: {parseInt(game.totalPot) / LAMPORTS_PER_SOL} SOL</p>
                    <div className="mt-2">
                      <label className="block mb-2">Your Guess (1-10):</label>
                      <div className="flex items-center">
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={selectedGuess}
                          onChange={(e) => setSelectedGuess(parseInt(e.target.value))}
                          className="bg-gray-600 text-white p-2 rounded mr-2"
                        />
                        <button
                          onClick={() => handleMakeGuess(game)}
                          disabled={loading}
                          className="bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded disabled:opacity-50"
                        >
                          Submit Guess
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {gamesToSettle.length > 0 && (
            <div className="bg-gray-800 p-6 rounded-lg mb-8">
              <h2 className="text-2xl font-bold mb-4">Games Ready to Settle</h2>
              <div className="space-y-4">
                {gamesToSettle.map((game) => (
                  <div key={game.pubkey} className="bg-gray-700 p-4 rounded-md">
                    <p>Game ID: {game.pubkey.slice(0, 8)}...</p>
                    <p>Creator: {game.creator.slice(0, 8)}...</p>
                    <p>Player Two: {game.playerTwo.slice(0, 8)}...</p>
                    <p>Total Pot: {parseInt(game.totalPot) / LAMPORTS_PER_SOL} SOL</p>
                    <p>Player One Guess: {game.playerOneGuess}</p>
                    <p>Player Two Guess: {game.playerTwoGuess}</p>
                    <button
                      onClick={() => handleSettleGame(game)}
                      disabled={loading}
                      className="bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded mt-2 disabled:opacity-50"
                    >
                      Settle Game
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {completedGames.length > 0 && (
            <div className="bg-gray-800 p-6 rounded-lg mb-8">
              <h2 className="text-2xl font-bold mb-4">Completed Games</h2>
              <div className="space-y-4">
                {completedGames.map((game) => (
                  <div key={game.pubkey} className="bg-gray-700 p-4 rounded-md">
                    <p>Game ID: {game.pubkey.slice(0, 8)}...</p>
                    <p>Random Number: {game.randomNumber}</p>
                    <p>Player One Guess: {game.playerOneGuess}</p>
                    <p>Player Two Guess: {game.playerTwoGuess}</p>
                    <p>Winner: {game.winner ? game.winner.slice(0, 8) + '...' : 'Tie'}</p>
                    <p>Total Pot: {parseInt(game.totalPot) / LAMPORTS_PER_SOL} SOL</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {cancelledGames.length > 0 && (
            <div className="bg-gray-800 p-6 rounded-lg mb-8">
              <h2 className="text-2xl font-bold mb-4">Cancelled Games</h2>
              <div className="space-y-4">
                {cancelledGames.map((game) => (
                  <div key={game.pubkey} className="bg-gray-700 p-4 rounded-md">
                    <p>Game ID: {game.pubkey.slice(0, 8)}...</p>
                    <p>Creator: {game.creator.slice(0, 8)}...</p>
                    <p>Status: Cancelled</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {!connected && (
        <div className="text-center mt-8">
          <p className="text-xl mb-4">Connect your wallet to play the game</p>
        </div>
      )}
      
      {gameResult && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-lg max-w-md">
            <h2 className="text-2xl font-bold mb-4">Game Result</h2>
            <p>Random Number: {gameResult.randomNumber}</p>
            <p>Player One Guess: {gameResult.playerOneGuess}</p>
            <p>Player Two Guess: {gameResult.playerTwoGuess}</p>
            <button
              onClick={() => setGameResult(null)}
              className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded mt-4"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}