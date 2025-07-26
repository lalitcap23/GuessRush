use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};

declare_id!("73NgH4cvjbnCRiR2cP7RrTZnUzjwBERsPAb6AThEt8py");

#[program]
pub mod number_guessing_game {
    use super::*;

    pub fn initialize_game(
        ctx: Context<InitializeGame>,
        _game_id: u64,
        deposit_amount: u64,
        platform_fee_percent: u8,
    ) -> Result<()> {
        // Validate platform fee
        require!(
            platform_fee_percent <= 100,
            ErrorCode::InvalidPlatformFee
        );

        let game = &mut ctx.accounts.game;
        
        // Initialize game state
        game.is_initialized = true;
        game.player_one = ctx.accounts.creator.key();
        game.player_two = None;
        game.player_one_deposited = false;
        game.player_two_deposited = false;
        game.player_one_guess = None;
        game.player_two_guess = None;
        game.random_number = None;
        game.winner = None;
        game.deposit_amount = deposit_amount;
        game.total_pot = 0;
        game.platform_fee_percent = platform_fee_percent;
        game.platform_wallet = ctx.accounts.platform_wallet.key();
        game.game_settled = false;
        game.game_cancelled = false;

        Ok(())
    }

    pub fn join_game(ctx: Context<JoinGame>, game_id: u64) -> Result<()> {
        let player = &ctx.accounts.player;

        // Check if game is initialized
        require!(ctx.accounts.game.is_initialized, ErrorCode::GameNotInitialized);
        
        // Check if game is already settled or cancelled
        require!(!ctx.accounts.game.game_settled, ErrorCode::GameAlreadySettled);
        require!(!ctx.accounts.game.game_cancelled, ErrorCode::GameAlreadyCancelled);

        // Store values we need before creating mutable borrow
        let deposit_amount = ctx.accounts.game.deposit_amount;
        let player_key = player.key();
        let game_key = ctx.accounts.game.key();

        // Check if player is already in the game
        if ctx.accounts.game.player_one == player_key {
            // Player one is joining
            require!(!ctx.accounts.game.player_one_deposited, ErrorCode::PlayerAlreadyJoined);
            
            // Transfer deposit from player to game account
            invoke(
                &system_instruction::transfer(
                    &player_key,
                    &game_key,
                    deposit_amount,
                ),
                &[
                    player.to_account_info(),
                    ctx.accounts.game.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
            
            // Now create mutable borrow after invoke
            let game = &mut ctx.accounts.game;
            game.player_one_deposited = true;
            game.total_pot += deposit_amount;
            
        } else if ctx.accounts.game.player_two.is_none() {
            // Transfer deposit from player to game account first
            invoke(
                &system_instruction::transfer(
                    &player_key,
                    &game_key,
                    deposit_amount,
                ),
                &[
                    player.to_account_info(),
                    ctx.accounts.game.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
            
            // Now create mutable borrow after invoke
            let game = &mut ctx.accounts.game;
            // New player joining as player two
            game.player_two = Some(player_key);
            game.player_two_deposited = true;
            game.total_pot += deposit_amount;
            
        } else if ctx.accounts.game.player_two == Some(player_key) {
            // Player two is joining
            require!(!ctx.accounts.game.player_two_deposited, ErrorCode::PlayerAlreadyJoined);
            
            // Transfer deposit from player to game account
            invoke(
                &system_instruction::transfer(
                    &player_key,
                    &game_key,
                    deposit_amount,
                ),
                &[
                    player.to_account_info(),
                    ctx.accounts.game.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
            
            // Now create mutable borrow after invoke
            let game = &mut ctx.accounts.game;
            game.player_two_deposited = true;
            game.total_pot += deposit_amount;
            
        } else {
            // Game is full
            return err!(ErrorCode::GameAlreadyFull);
        }

        Ok(())
    }

    pub fn make_guess(ctx: Context<MakeGuess>, _game_id: u64, guess: u8) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let player = &ctx.accounts.player;

        // Check if game is initialized
        require!(game.is_initialized, ErrorCode::GameNotInitialized);
        
        // Check if game is already settled or cancelled
        require!(!game.game_settled, ErrorCode::GameAlreadySettled);
        require!(!game.game_cancelled, ErrorCode::GameAlreadyCancelled);

        // Validate guess range (1-10)
        require!(guess >= 1 && guess <= 10, ErrorCode::InvalidGuess);

        // Check if player is in the game and has deposited
        if game.player_one == player.key() {
            require!(game.player_one_deposited, ErrorCode::PlayerNotDeposited);
            require!(game.player_one_guess.is_none(), ErrorCode::PlayerAlreadyGuessed);
            game.player_one_guess = Some(guess);
        } else if game.player_two == Some(player.key()) {
            require!(game.player_two_deposited, ErrorCode::PlayerNotDeposited);
            require!(game.player_two_guess.is_none(), ErrorCode::PlayerAlreadyGuessed);
            game.player_two_guess = Some(guess);
        } else {
            return err!(ErrorCode::PlayerNotJoined);
        }

        Ok(())
    }

    pub fn settle_game(ctx: Context<SettleGame>, _game_id: u64, random_number: u8) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        // Check if game is initialized
        require!(game.is_initialized, ErrorCode::GameNotInitialized);
        
        // Check if game is already settled or cancelled
        require!(!game.game_settled, ErrorCode::GameAlreadySettled);
        require!(!game.game_cancelled, ErrorCode::GameAlreadyCancelled);

        // Validate random number range (1-10)
        require!(random_number >= 1 && random_number <= 10, ErrorCode::InvalidGuess);

        // Check if both players have joined, deposited, and made guesses
        require!(game.player_one_deposited, ErrorCode::PlayerNotDeposited);
        require!(game.player_two_deposited, ErrorCode::PlayerNotDeposited);
        require!(game.player_one_guess.is_some(), ErrorCode::GameNotReady);
        require!(game.player_two_guess.is_some(), ErrorCode::GameNotReady);
        require!(game.player_two.is_some(), ErrorCode::GameNotReady);

        // Set the random number
        game.random_number = Some(random_number);

        // Calculate differences to determine the winner
        let player_one_diff = if let Some(guess) = game.player_one_guess {
            if guess > random_number {
                guess - random_number
            } else {
                random_number - guess
            }
        } else {
            return err!(ErrorCode::GameNotReady);
        };

        let player_two_diff = if let Some(guess) = game.player_two_guess {
            if guess > random_number {
                guess - random_number
            } else {
                random_number - guess
            }
        } else {
            return err!(ErrorCode::GameNotReady);
        };

        // Calculate platform fee
        let platform_fee = (game.total_pot * game.platform_fee_percent as u64) / 100;
        let remaining_pot = game.total_pot - platform_fee;

        // Determine winner and distribute funds
        if player_one_diff < player_two_diff {
            // Player one wins
            game.winner = Some(game.player_one);
            
            // Transfer platform fee
            **game.to_account_info().try_borrow_mut_lamports()? -= platform_fee;
            **ctx.accounts.platform_wallet.try_borrow_mut_lamports()? += platform_fee;
            
            // Transfer winnings to player one
            **game.to_account_info().try_borrow_mut_lamports()? -= remaining_pot;
            **ctx.accounts.player_one.try_borrow_mut_lamports()? += remaining_pot;
            
        } else if player_two_diff < player_one_diff {
            // Player two wins
            game.winner = game.player_two;
            
            // Transfer platform fee
            **game.to_account_info().try_borrow_mut_lamports()? -= platform_fee;
            **ctx.accounts.platform_wallet.try_borrow_mut_lamports()? += platform_fee;
            
            // Transfer winnings to player two
            **game.to_account_info().try_borrow_mut_lamports()? -= remaining_pot;
            **ctx.accounts.player_two.try_borrow_mut_lamports()? += remaining_pot;
            
        } else {
            // It's a tie, split the pot
            let split_amount = remaining_pot / 2;
            
            // Transfer platform fee
            **game.to_account_info().try_borrow_mut_lamports()? -= platform_fee;
            **ctx.accounts.platform_wallet.try_borrow_mut_lamports()? += platform_fee;
            
            // Transfer split to player one
            **game.to_account_info().try_borrow_mut_lamports()? -= split_amount;
            **ctx.accounts.player_one.try_borrow_mut_lamports()? += split_amount;
            
            // Transfer split to player two
            **game.to_account_info().try_borrow_mut_lamports()? -= split_amount;
            **ctx.accounts.player_two.try_borrow_mut_lamports()? += split_amount;
            
            // If there's an odd number of lamports, give the extra one to player one
            if remaining_pot % 2 == 1 {
                **game.to_account_info().try_borrow_mut_lamports()? -= 1;
                **ctx.accounts.player_one.try_borrow_mut_lamports()? += 1;
            }
        }

        // Mark game as settled
        game.game_settled = true;

        Ok(())
    }

    pub fn cancel_game(ctx: Context<CancelGame>, _game_id: u64) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        // Check if game is initialized
        require!(game.is_initialized, ErrorCode::GameNotInitialized);
        
        // Check if game is already settled or cancelled
        require!(!game.game_settled, ErrorCode::GameAlreadySettled);
        require!(!game.game_cancelled, ErrorCode::GameAlreadyCancelled);

        // Only the creator or a player can cancel the game
        let authority_key = ctx.accounts.authority.key();
        require!(
            authority_key == game.player_one || 
            game.player_two == Some(authority_key),
            ErrorCode::UnauthorizedAction
        );

        // Return deposits to players
        if game.player_one_deposited {
            let amount = game.deposit_amount;
            **game.to_account_info().try_borrow_mut_lamports()? -= amount;
            **ctx.accounts.player_one.try_borrow_mut_lamports()? += amount;
        }

        if let Some(player_two_account) = &ctx.accounts.player_two {
            if game.player_two_deposited {
                let amount = game.deposit_amount;
                **game.to_account_info().try_borrow_mut_lamports()? -= amount;
                **player_two_account.try_borrow_mut_lamports()? += amount;
            }
        }

        // Mark game as cancelled
        game.game_cancelled = true;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(game_id: u64, deposit_amount: u64, platform_fee_percent: u8)]
pub struct InitializeGame<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    
    #[account(
        init,
        payer = creator,
        space = 8 + GameState::INIT_SPACE,
        seeds = [b"game", creator.key().as_ref(), &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, GameState>,
    
    /// CHECK: This is the platform wallet that will receive fees
    pub platform_wallet: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct JoinGame<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"game", creator.key().as_ref(), &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, GameState>,
    
    /// CHECK: This is just used for PDA derivation
    pub creator: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct MakeGuess<'info> {
    pub player: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"game", creator.key().as_ref(), &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, GameState>,
    
    /// CHECK: This is just used for PDA derivation
    pub creator: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct SettleGame<'info> {
    pub settler: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"game", creator.key().as_ref(), &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, GameState>,
    
    /// CHECK: This is just used for PDA derivation
    pub creator: UncheckedAccount<'info>,
    
    /// CHECK: This is the player one account that will receive funds if they win
    #[account(mut, constraint = player_one.key() == game.player_one)]
    pub player_one: UncheckedAccount<'info>,
    
    /// CHECK: This is the player two account that will receive funds if they win
    #[account(mut, constraint = player_two.key() == game.player_two.unwrap())]
    pub player_two: UncheckedAccount<'info>,
    
    /// CHECK: This is the platform wallet that will receive fees
    #[account(mut, constraint = platform_wallet.key() == game.platform_wallet)]
    pub platform_wallet: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct CancelGame<'info> {
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"game", creator.key().as_ref(), &game_id.to_le_bytes()],
        bump
    )]
    pub game: Account<'info, GameState>,
    
    /// CHECK: This is just used for PDA derivation
    pub creator: UncheckedAccount<'info>,
    
    /// CHECK: This is the player one account that will receive refund
    #[account(mut, constraint = player_one.key() == game.player_one)]
    pub player_one: UncheckedAccount<'info>,
    
    /// CHECK: This is the player two account that will receive refund if they joined
    #[account(mut)]
    pub player_two: Option<UncheckedAccount<'info>>,
}

#[account]
pub struct GameState {
    pub is_initialized: bool,
    pub player_one: Pubkey,
    pub player_two: Option<Pubkey>,
    pub player_one_deposited: bool,
    pub player_two_deposited: bool,
    pub player_one_guess: Option<u8>,
    pub player_two_guess: Option<u8>,
    pub random_number: Option<u8>,
    pub winner: Option<Pubkey>,
    pub deposit_amount: u64,
    pub total_pot: u64,
    pub platform_fee_percent: u8,
    pub platform_wallet: Pubkey,
    pub game_settled: bool,
    pub game_cancelled: bool,
}

impl GameState {
    pub const INIT_SPACE: usize = 
        1 +                     // is_initialized (bool)
        32 +                    // player_one (Pubkey)
        1 + 32 +                // player_two (Option<Pubkey>)
        1 +                     // player_one_deposited (bool)
        1 +                     // player_two_deposited (bool)
        1 + 1 +                 // player_one_guess (Option<u8>)
        1 + 1 +                 // player_two_guess (Option<u8>)
        1 + 1 +                 // random_number (Option<u8>)
        1 + 32 +                // winner (Option<Pubkey>)
        8 +                     // deposit_amount (u64)
        8 +                     // total_pot (u64)
        1 +                     // platform_fee_percent (u8)
        32 +                    // platform_wallet (Pubkey)
        1 +                     // game_settled (bool)
        1;                      // game_cancelled (bool)
}

#[error_code]
pub enum ErrorCode {
    #[msg("Game is already initialized")]
    GameAlreadyInitialized,
    
    #[msg("Game is not initialized")]
    GameNotInitialized,
    
    #[msg("Player has already joined this game")]
    PlayerAlreadyJoined,
    
    #[msg("Game is already full with two players")]
    GameAlreadyFull,
    
    #[msg("Deposit amount is insufficient")]
    InsufficientDeposit,
    
    #[msg("Guess must be between 1 and 10")]
    InvalidGuess,
    
    #[msg("Player has not joined this game")]
    PlayerNotJoined,
    
    #[msg("Player has not deposited funds")]
    PlayerNotDeposited,
    
    #[msg("Player has already made a guess")]
    PlayerAlreadyGuessed,
    
    #[msg("Game is not ready to be settled")]
    GameNotReady,
    
    #[msg("Game has already been settled")]
    GameAlreadySettled,
    
    #[msg("Game has already been cancelled")]
    GameAlreadyCancelled,
    
    #[msg("Unauthorized action")]
    UnauthorizedAction,
    
    #[msg("Platform fee must be between 0 and 100")]
    InvalidPlatformFee,
}