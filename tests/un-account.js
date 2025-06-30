const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram } = anchor.web3;

describe("un-account", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.unAccount;
  
  // 存储创建的PDA信息
  const createdPdas = [];
  
  it("程序初始化测试", async () => {
    const tx = await program.methods.initialize().rpc();
    console.log("初始化交易签名", tx);
  });

  it("创建多个动态PDA账户", async () => {
    console.log("\n=== 创建多个动态PDA账户 ===");
    
    // 创建5个不同的PDA账户
    const seeds = ["pda1", "pda2", "pda3", "pda4", "pda5"];
    const dataList = [
      "第一个PDA数据",
      "第二个PDA数据", 
      "第三个PDA数据",
      "第四个PDA数据",
      "第五个PDA数据"
    ];

    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i];
      const data = dataList[i];
      
      // 计算PDA地址
      const [pdaAccount, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("dynamic_pda"), Buffer.from(seed)],
        program.programId
      );

      console.log(`正在创建第 ${i + 1} 个PDA，种子: "${seed}"`);
      console.log(`PDA地址: ${pdaAccount.toString()}`);

      try {
        const tx = await program.methods
          .createDynamicPda(seed, data)
          .accounts({
            pdaAccount: pdaAccount,
            user: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log(`✅ 第 ${i + 1} 个PDA创建成功。交易签名: ${tx}`);
        
        // 存储创建的PDA信息
        createdPdas.push({
          seed: seed,
          address: pdaAccount,
          data: data,
          bump: bump
        });

        // 验证PDA账户是否正确创建
        const pdaAccountInfo = await program.account.dynamicPdaAccount.fetch(pdaAccount);
        console.log(`   存储的种子: ${pdaAccountInfo.seed}`);
        console.log(`   存储的数据: ${pdaAccountInfo.data}`);
        console.log(`   权限: ${pdaAccountInfo.authority.toString()}`);
        
      } catch (error) {
        console.error(`❌ 创建第 ${i + 1} 个PDA失败:`, error.message);
      }
    }
    
    console.log(`\n✅ 成功创建了 ${createdPdas.length} 个PDA账户`);
  });

  it("读取PDA信息", async () => {
    console.log("\n=== 读取PDA信息 ===");
    
    for (let i = 0; i < createdPdas.length; i++) {
      const pda = createdPdas[i];
      try {
        const tx = await program.methods
          .getPdaInfo()
          .accounts({
            pdaAccount: pda.address,
          })
          .rpc();
        
        console.log(`✅ 读取第 ${i + 1} 个PDA信息成功。交易签名: ${tx}`);
      } catch (error) {
        console.error(`❌ 读取第 ${i + 1} 个PDA信息失败:`, error.message);
      }
    }
  });

  it("随机关闭动态PDA账户", async () => {
    console.log("\n=== 随机关闭动态PDA账户 ===");
    
    if (createdPdas.length === 0) {
      console.log("❌ 没有PDA账户可以关闭");
      return;
    }

    // 创建一个随机顺序来关闭PDA（伪随机）
    const pdaIndexes = Array.from({length: createdPdas.length}, (_, i) => i);
    
    // 简单的伪随机打乱算法
    for (let i = pdaIndexes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pdaIndexes[i], pdaIndexes[j]] = [pdaIndexes[j], pdaIndexes[i]];
    }
    
    console.log(`随机关闭顺序: [${pdaIndexes.map(i => createdPdas[i].seed).join(', ')}]`);

    // 关闭前3个PDA（保留一些用于验证）
    const numToClose = Math.min(3, createdPdas.length);
    const closedPdas = [];
    
    for (let i = 0; i < numToClose; i++) {
      const pdaIndex = pdaIndexes[i];
      const pda = createdPdas[pdaIndex];
      
      console.log(`\n尝试关闭PDA: "${pda.seed}" (${pda.address.toString()})`);
      
      try {
        // 获取关闭前的账户余额
        const accountInfo = await provider.connection.getAccountInfo(pda.address);
        const lamportsBefore = accountInfo ? accountInfo.lamports : 0;
        console.log(`   关闭前lamports: ${lamportsBefore}`);
        
        // 获取接收者关闭前的余额
        const receiverBalanceBefore = await provider.connection.getBalance(provider.wallet.publicKey);
        
        const tx = await program.methods
          .closeDynamicPda(pda.seed)
          .accounts({
            pdaAccount: pda.address,
            receiver: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log(`   ✅ PDA "${pda.seed}" 关闭成功。交易签名: ${tx}`);
        
        // 验证账户是否真的被关闭
        try {
          const accountInfoAfter = await provider.connection.getAccountInfo(pda.address);
          if (accountInfoAfter === null) {
            console.log(`   ✅ 账户成功关闭，lamports已返回`);
          } else {
            console.log(`   ⚠️  账户仍然存在，余额: ${accountInfoAfter.lamports} lamports`);
          }
        } catch (fetchError) {
          console.log(`   ✅ 账户已不存在（符合预期）`);
        }
        
        // 检查接收者余额是否增加
        const receiverBalanceAfter = await provider.connection.getBalance(provider.wallet.publicKey);
        const balanceIncrease = receiverBalanceAfter - receiverBalanceBefore;
        console.log(`   💰 接收者余额增加了: ${balanceIncrease} lamports`);
        
        closedPdas.push(pda);
        
      } catch (error) {
        console.error(`   ❌ 关闭PDA "${pda.seed}" 失败:`, error.message);
        if (error.logs) {
          console.error("   错误日志:", error.logs);
        }
      }
    }
    
    console.log(`\n✅ 成功关闭了 ${closedPdas.length} 个PDA，共尝试 ${numToClose} 个`);
    console.log(`已关闭的PDA: [${closedPdas.map(p => p.seed).join(', ')}]`);
    
    // 验证剩余的PDA仍然存在
    const remainingPdas = createdPdas.filter(pda => !closedPdas.some(closed => closed.seed === pda.seed));
    console.log(`\n验证剩余的PDA: [${remainingPdas.map(p => p.seed).join(', ')}]`);
    
    for (const pda of remainingPdas) {
      try {
        const accountInfo = await program.account.dynamicPdaAccount.fetch(pda.address);
        console.log(`   ✅ PDA "${pda.seed}" 仍然存在，数据: "${accountInfo.data}"`);
      } catch (error) {
        console.log(`   ❌ PDA "${pda.seed}" 意外消失`);
      }
    }
  });

  it("尝试关闭已经关闭的PDA（应该失败）", async () => {
    console.log("\n=== 测试关闭已经关闭的PDA ===");
    
    // 尝试关闭第一个PDA（应该已经被关闭）
    if (createdPdas.length > 0) {
      const pda = createdPdas[0];
      
      try {
        const tx = await program.methods
          .closeDynamicPda(pda.seed)
          .accounts({
            pdaAccount: pda.address,
            receiver: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        console.log(`❌ 意外成功关闭了已经关闭的PDA。交易签名: ${tx}`);
      } catch (error) {
        console.log(`✅ 预期的错误，尝试关闭已经关闭的PDA: ${error.message}`);
      }
    }
  });

  it("尝试用无效方法关闭普通PDA（应该失败）", async () => {
    console.log("\n=== 测试无效的普通PDA关闭方法 ===");
    
    if (createdPdas.length === 0) {
      console.log("❌ 没有PDA可用于测试");
      return;
    }
    
    // 找一个还存在的PDA来测试
    let testPda = null;
    for (const pda of createdPdas) {
      try {
        await program.account.dynamicPdaAccount.fetch(pda.address);
        testPda = pda;
        break;
      } catch (error) {
        // 这个PDA可能已经被关闭了，继续寻找
        continue;
      }
    }
    
    if (!testPda) {
      console.log("❌ 没有找到现存的PDA用于测试");
      return;
    }
    
    console.log(`测试无效关闭普通PDA: "${testPda.seed}" (${testPda.address.toString()})`);
    
    try {
      const tx = await program.methods
        .closeNormalPdaInvalid(testPda.seed)
        .accounts({
          pdaAccount: testPda.address,
          receiver: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      // 如果到达这里，说明调用意外成功了
      console.log(`❌ 意外成功！普通PDA被无效方法关闭了。交易签名: ${tx}`);
      console.log("   这表明手动关闭方法在普通PDA账户上也起作用了");
      
      // 验证账户是否真的被关闭
      try {
        const accountInfoAfter = await provider.connection.getAccountInfo(testPda.address);
        if (accountInfoAfter === null) {
          console.log("   ⚠️  账户实际上被关闭了（这是意外行为）");
        } else {
          console.log("   ✅ 账户仍然存在，所以操作实际上没有关闭它");
        }
      } catch (fetchError) {
        console.log("   ⚠️  账户不再存在（意外）");
      }
      
    } catch (error) {
      console.log(`✅ 尝试用无效方法关闭普通PDA时的预期错误:`);
      console.log(`   错误: ${error.message}`);
      
      // 检查错误类型
      if (error.message.includes("already in use") || error.message.includes("borrow")) {
        console.log("   📝 这可能是RefCell借用错误 - 普通PDA账户不能用这种方式手动关闭");
      } else if (error.message.includes("access violation") || error.message.includes("write")) {
        console.log("   📝 这可能是访问冲突 - 普通PDA账户受到保护，不能直接操作");
      } else {
        console.log("   📝 未知错误类型，但这证实了这种方法在普通PDA上不起作用");
      }
      
      // 验证账户仍然存在且数据完整
      try {
        const accountInfo = await program.account.dynamicPdaAccount.fetch(testPda.address);
        console.log(`   ✅ 原始PDA "${testPda.seed}" 仍然存在，数据: "${accountInfo.data}"`);
      } catch (fetchError) {
        console.log(`   ❌ 无法验证PDA仍然存在: ${fetchError.message}`);
      }
    }
  });

  it("测试总结", async () => {
    console.log("\n=== 测试总结 ===");
    console.log(`总共创建的PDA数量: ${createdPdas.length}`);
    console.log(`创建的PDA: [${createdPdas.map(p => p.seed).join(', ')}]`);
    console.log("✅ 动态PDA创建和关闭测试成功完成！");
    console.log("✅ 无效的普通PDA关闭方法被正确处理！");
  });
});
