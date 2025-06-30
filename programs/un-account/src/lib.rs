use anchor_lang::prelude::*;

declare_id!("DJPMEwCmviVKBZfWinMZBX6vR73Cx8wvxxhBaUds9SQi");

#[program]
pub mod un_account {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("程序初始化完成，程序ID: {:?}", ctx.program_id);
        Ok(())
    }

    /// 创建动态 PDA 账户
    pub fn create_dynamic_pda(
        ctx: Context<CreateDynamicPda>,
        seed: String,
        data: String,
    ) -> Result<()> {
        let pda_account = &mut ctx.accounts.pda_account;
        pda_account.seed = seed.clone();
        pda_account.data = data;
        pda_account.authority = ctx.accounts.user.key();
        
        msg!("已创建PDA账户，种子: {}", seed);
        Ok(())
    }

    /// 动态关闭 PDA 账户
    pub fn close_dynamic_pda(ctx: Context<CloseDynamicPda>, seed: String) -> Result<()> {
        // 验证 PDA 地址是否正确
        let (expected_pda, _bump) = Pubkey::find_program_address(
            &[b"dynamic_pda", seed.as_bytes()],
            ctx.program_id,
        );
        
        require_eq!(
            ctx.accounts.pda_account.key(),
            expected_pda,
            ErrorCode::InvalidPdaAddress
        );

        msg!("正在关闭PDA账户，种子: {}", seed);
        
        // 手动执行关闭逻辑
        // 1. 获取账户中的所有 lamports
        let account_lamports = ctx.accounts.pda_account.lamports();
        
        // 2. 将 lamports 转移到接收者账户
        **ctx.accounts.pda_account.try_borrow_mut_lamports()? = 0;
        **ctx.accounts.receiver.try_borrow_mut_lamports()? = ctx.accounts
            .receiver
            .lamports()
            .checked_add(account_lamports)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        
        // 3. 将账户数据清零
        let mut account_data = ctx.accounts.pda_account.try_borrow_mut_data()?;
        account_data.fill(0);
        
        Ok(())
    }

    /// 获取所有 PDA 信息（用于测试）
    pub fn get_pda_info(ctx: Context<GetPdaInfo>) -> Result<()> {
        let pda_account = &ctx.accounts.pda_account;
        msg!("PDA信息 - 种子: {}, 数据: {}, 权限: {}", 
             pda_account.seed, pda_account.data, pda_account.authority);
        Ok(())
    }

    /// 尝试关闭普通PDA账户（应该失败）
    pub fn close_normal_pda_invalid(ctx: Context<CloseNormalPdaInvalid>, seed: String) -> Result<()> {
        msg!("尝试用无效方法关闭普通PDA账户，种子: {}", seed);
        
        // 尝试使用与UncheckedAccount相同的手动关闭逻辑
        // 这应该在编译时或运行时失败，因为Account<'info, T>类型不支持这些操作
        
        let pda_account_info = ctx.accounts.pda_account.to_account_info();
        
        // 1. 尝试获取账户中的所有 lamports
        let account_lamports = pda_account_info.lamports();
        
        // 2. 尝试将 lamports 转移到接收者账户（这里应该会失败）
        **pda_account_info.try_borrow_mut_lamports()? = 0;
        **ctx.accounts.receiver.try_borrow_mut_lamports()? = ctx.accounts
            .receiver
            .lamports()
            .checked_add(account_lamports)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        
        // 3. 尝试将账户数据清零（这里也应该会失败）
        let mut account_data = pda_account_info.try_borrow_mut_data()?;
        account_data.fill(0);
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
#[instruction(seed: String)]
pub struct CreateDynamicPda<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + DynamicPdaAccount::INIT_SPACE,
        seeds = [b"dynamic_pda", seed.as_bytes()],
        bump
    )]
    pub pda_account: Account<'info, DynamicPdaAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseDynamicPda<'info> {
    /// CHECK: 这是一个动态PDA账户，无法在编译时验证seeds， 
    /// 在运行时手动验证PDA地址是否匹配预期的seed
    #[account(mut)]
    pub pda_account: UncheckedAccount<'info>, 
    
    #[account(mut)]
    pub receiver: SystemAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GetPdaInfo<'info> {
    pub pda_account: Account<'info, DynamicPdaAccount>,
}

#[derive(Accounts)]
#[instruction(seed: String)]
pub struct CloseNormalPdaInvalid<'info> {
    /// 这是一个普通的PDA账户，使用编译时seeds验证
    /// 我们将尝试手动关闭它，但这应该失败
    #[account(
        mut,
        seeds = [b"dynamic_pda", seed.as_bytes()],
        bump
    )]
    pub pda_account: Account<'info, DynamicPdaAccount>,
    
    #[account(mut)]
    pub receiver: SystemAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct DynamicPdaAccount {
    #[max_len(32)]
    pub seed: String,
    #[max_len(100)]
    pub data: String,
    pub authority: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("无效的PDA地址")]
    InvalidPdaAddress,
    #[msg("算术溢出")]
    ArithmeticOverflow,
}
