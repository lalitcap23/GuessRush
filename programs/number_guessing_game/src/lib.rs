use anchor_lang::prelude::*;

declare_id!("73NgH4cvjbnCRiR2cP7RrTZnUzjwBERsPAb6AThEt8py");

#[program]
pub mod number_guessing_game {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {         
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
