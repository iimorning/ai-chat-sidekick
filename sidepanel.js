
// =============================================================
//  1. 初始化与常量定义
// =============================================================
const SUPABASE_URL = 'https://mhiyubxpmdvgondrtfsr.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oaXl1YnhwbWR2Z29uZHJ0ZnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxNTcxMzksImV4cCI6MjA2NTczMzEzOX0.kzAUt6NPcYpMyMm3_F9zc8-eti_HfvUAHzMdigKl8k4'; 
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MAX_OPTIMIZATIONS = 3;
let user = null;
let currentUserInput = '';
let history = [];
let optimizationCount = 0;
let sessionOptimizationHistory = [];
let viewingOptimizationIndex = 0;
let initialAnalysis = '';

// =============================================================
//  2. DOM 元素获取 (只在脚本开始时获取一次)
// =============================================================
const authContainer = document.getElementById('authContainer');
const loginButton = document.getElementById('loginButton');
const mainContent = document.getElementById('mainContent');
const userEmailElem = document.getElementById('userEmail');
const logoutButton = document.getElementById('logoutButton');
const currentUserInputElem = document.getElementById('currentUserInput');
const optimizeBtn = document.getElementById('optimizeBtn');
const structureBtn = document.getElementById('structureBtn');
const resultOutputElem = document.getElementById('resultOutput');
const historyToggleBtn = document.getElementById('historyToggleBtn');
const historyDropdown = document.getElementById('historyDropdown');
const historyListElem = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const voiceInputBtn = document.getElementById('voice-input-btn');

// =============================================================
//  3. 核心函数
// =============================================================
function cleanText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[*#]/g, '').replace(/\n\s*\n/g, '\n\n').trim();
}

function resetOptimization() {
  optimizationCount = 0;
  sessionOptimizationHistory = [];
  viewingOptimizationIndex = 0;
  initialAnalysis = '';
  optimizeBtn.disabled = false;
  optimizeBtn.textContent = '优化输入';
}

function renderComparisonView() {
  const promptOutputElem = document.getElementById('optimized-prompt-output');
  const paginationElem = document.getElementById('comparison-pagination');
  const prevBtn = document.getElementById('prev-version-btn');
  const nextBtn = document.getElementById('next-version-btn');
  if (!promptOutputElem || sessionOptimizationHistory.length === 0) return;
  promptOutputElem.textContent = sessionOptimizationHistory[viewingOptimizationIndex];
  paginationElem.textContent = `${viewingOptimizationIndex + 1} / ${sessionOptimizationHistory.length}`;
  prevBtn.disabled = (viewingOptimizationIndex === 0);
  nextBtn.disabled = (viewingOptimizationIndex === sessionOptimizationHistory.length - 1);
}

function renderHistory() {
  historyListElem.innerHTML = ''; 
  if (history.length === 0) {
    historyListElem.innerHTML = '<p class="history-empty-message">暂无历史记录。</p>';
    return;
  }
  history.forEach(item => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.innerHTML = `<p><strong>输入:</strong> ${item.userInput}</p><p><strong>结果:</strong> ${item.result}</p><div class="timestamp">${item.timestamp}</div>`;
    historyItem.addEventListener('click', () => {
      currentUserInputElem.textContent = item.userInput;
      resultOutputElem.innerHTML = `<div class="result-block"><div class="editable-result">${item.result}</div></div>`;
      currentUserInput = item.userInput;
      resetOptimization();
      historyDropdown.classList.remove('active');
    });
    historyListElem.appendChild(historyItem);
  });
}

async function loadUserHistory() {
  if (!user) return;
  try {
    const { data, error } = await supabase.from('history').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) throw error;
    history = data.map(item => ({
        id: item.id,
        userInput: item.user_input,
        result: item.result,
        timestamp: new Date(item.created_at).toLocaleString('zh-CN')
    }));
    renderHistory();
  } catch (error) {
    console.error('Error loading history:', error);
  }
}
// sidepanel.js (工具与核心函数区域)

// ↓↓↓↓ 用这段全新的函数，替换掉旧的 callGeminiAPI 函数 ↓↓↓↓
async function callGeminiAPI(action, input) {
  try {
    // 调用云函数，并将 action 和 input 作为请求体发送
    const { data, error } = await supabase.functions.invoke('call-gemini', {
      body: { action, input },
    });
    if (error) throw error;
    if (data.error) throw new Error(data.error);
    return data.result;
  } catch (error) {
    console.error("Function invoke error:", error);
    return `错误: ${error.message}`;
  }
}

// =============================================================
//  4. 事件监听器
// =============================================================
// 在现有的事件监听器设置中添加
function setupEventListeners() {
  // 登录按钮事件
  loginButton.addEventListener('click', () => {
    const manifest = chrome.runtime.getManifest();
    const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
    const params = new URLSearchParams({
      client_id: manifest.oauth2.client_id,
      response_type: 'id_token',
      redirect_uri: `https://${chrome.runtime.id}.chromiumapp.org/`,
      scope: manifest.oauth2.scopes.join(' '),
      nonce: String(Math.random()),
    });
    authUrl.search = params.toString();
    chrome.identity.launchWebAuthFlow({ url: authUrl.href, interactive: true }, async (redirectedTo) => {
      if (chrome.runtime.lastError || !redirectedTo) return console.error(chrome.runtime.lastError);
      const url = new URL(redirectedTo);
      const id_token = new URLSearchParams(url.hash.substring(1)).get('id_token');
      if (id_token) await supabase.auth.signInWithIdToken({ provider: 'google', token: id_token });
    });
  });

  // 【修复】将语音功能代码移到这里，与其他事件监听器平级
  // --- 语音输入功能 ---
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // 为语音按钮绑定点击事件
    voiceInputBtn.addEventListener('click', () => {
      console.log('麦克风按钮被点击了！准备启动识别...');
      console.log('当前的 recognition 对象是:', recognition);
      recognition.start();
    });

    // 当开始聆听时
    recognition.onstart = () => {
      voiceInputBtn.classList.add('is-listening');
      voiceInputBtn.title = '正在聆听...';
    };

    // 当获取到最终结果时
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      currentUserInput = transcript;
      currentUserInputElem.textContent = transcript;
      resetOptimization();
    };

    // 当识别结束时
    recognition.onend = () => {
      voiceInputBtn.classList.remove('is-listening');
      voiceInputBtn.title = '语音输入';
    };

    // 当发生错误时
    recognition.onerror = (event) => {
      console.error('语音识别错误:', event.error);
    };
  } else {
    // 如果浏览器不支持，则隐藏语音按钮
    voiceInputBtn.style.display = 'none';
    console.warn("浏览器不支持 Web Speech API。");
  }

  // 设置按钮事件监听器
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsDropdown = document.getElementById('settingsDropdown');
  
  if (settingsBtn && settingsDropdown) {
    // 设置按钮点击事件
    settingsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const isVisible = settingsDropdown.style.display !== 'none';
      settingsDropdown.style.display = isVisible ? 'none' : 'block';
    });
    
    // 点击其他地方关闭设置菜单
    document.addEventListener('click', function(e) {
      const settingsContainer = document.querySelector('.settings-container');
      
      if (settingsContainer && !settingsContainer.contains(e.target)) {
        settingsDropdown.style.display = 'none';
      }
    });
  }
  
  // 登出按钮事件
  logoutButton.addEventListener('click', () => supabase.auth.signOut());
  
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session && session.user) {
      user = session.user;
      authContainer.style.display = 'none';
      mainContent.style.display = 'block';
      
      // 更新用户邮箱显示（如果还保留原来的显示）
      if (userEmailElem) {
        userEmailElem.textContent = `已登录: ${user.email}`;
      }
      
      // 更新设置菜单中的用户邮箱
      const userEmailInSettingsElem = document.getElementById('userEmailInSettings');
      if (userEmailInSettingsElem) {
        userEmailInSettingsElem.textContent = user.email;
      }
      
      loadUserHistory();
    } else {
      user = null;
      history = [];
      renderHistory();
      authContainer.style.display = 'block';
      mainContent.style.display = 'none';
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "USER_INPUT") {
      currentUserInput = message.text;
      currentUserInputElem.textContent = currentUserInput || '正在等待用户输入...';
      resetOptimization();
    }
  });

  optimizeBtn.addEventListener('click', async () => {
    if (!user || (optimizationCount === 0 && !currentUserInput)) return;
    let apiPromises = [];
    if (optimizationCount === 0) {
      resultOutputElem.innerHTML = '<p>正在进行首次优化与分析...</p>';
      apiPromises.push(callGeminiAPI('optimize_initial', currentUserInput));
      apiPromises.push(callGeminiAPI('analyze', currentUserInput));
    } else if (optimizationCount < MAX_OPTIMIZATIONS) {
      const previousPrompt = sessionOptimizationHistory[sessionOptimizationHistory.length - 1];
      apiPromises.push(callGeminiAPI('optimize_again', previousPrompt));
    } else {
      return;
    }
    optimizeBtn.disabled = true;
    optimizeBtn.innerHTML = `<span class="spinner"></span> 优化中...`;
    try {
      const results = await Promise.all(apiPromises);
      if (optimizationCount === 0) {
        sessionOptimizationHistory.push(cleanText(results[0]));
        initialAnalysis = cleanText(results[1]);
      } else {
        sessionOptimizationHistory.push(cleanText(results[0]));
      }
      optimizationCount++;
      viewingOptimizationIndex = sessionOptimizationHistory.length - 1;
      resultOutputElem.innerHTML = `
        <div class="result-block">
          <div class="result-block-header">
            <h4>✨ 优化后的提示词：</h4>
            <div class="comparison-controls">
              <button id="prev-version-btn" class="icon-btn" title="上一个版本"><</button>
              <span id="comparison-pagination"></span>
              <button id="next-version-btn" class="icon-btn" title="下一个版本">></button>
              <button id="copy-prompt-btn" class="icon-btn" title="复制当前版本">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            </div>
          </div>
          <div id="optimized-prompt-output" class="editable-result"></div>
        </div>
        <div class="result-block">
          <h4>🔬 问题分析：</h4>
          <div class="readonly-result">${initialAnalysis.replace(/\n/g, '<br>')}</div>
        </div>`;
      renderComparisonView();
      document.getElementById('prev-version-btn').addEventListener('click', () => { if (viewingOptimizationIndex > 0) { viewingOptimizationIndex--; renderComparisonView(); } });
      document.getElementById('next-version-btn').addEventListener('click', () => { if (viewingOptimizationIndex < sessionOptimizationHistory.length - 1) { viewingOptimizationIndex++; renderComparisonView(); } });
      document.getElementById('copy-prompt-btn').addEventListener('click', () => navigator.clipboard.writeText(sessionOptimizationHistory[viewingOptimizationIndex]));
      if (optimizationCount >= MAX_OPTIMIZATIONS) {
        optimizeBtn.textContent = '已达优化上限';
      } else {
        optimizeBtn.disabled = false;
        optimizeBtn.textContent = `再次优化 (${optimizationCount}/${MAX_OPTIMIZATIONS})`;
      }
      try { await supabase.from('history').insert({ user_input: currentUserInput, action: `optimize-v${optimizationCount}`, result: sessionOptimizationHistory[sessionOptimizationHistory.length - 1] }); loadUserHistory(); } catch (e) { console.error('Error saving history:', e); }
    } catch (error) {
      resultOutputElem.textContent = `处理失败: ${error.message}`;
      resetOptimization();
    }
  });

 // sidepanel.js (事件处理区域)

// ↓↓↓↓ 用这段全新的代码，替换掉旧的 'structureBtn' 事件监听器 ↓↓↓↓
structureBtn.addEventListener('click', async () => {
    if (!user || !currentUserInput) return;
    
    resetOptimization(); // 调用重置，确保状态统一

    resultOutputElem.textContent = '正在思考中...';
    const rawResult = await callGeminiAPI('structure', currentUserInput);
    const cleanResult = cleanText(rawResult);

    // 【关键修改】使用模板字符串创建包含头部的完整结果块
    resultOutputElem.innerHTML = `
        <div class="result-block">
          <div class="result-block-header">
            <h4>✨ 结构化后的提示词：</h4>
            <div class="comparison-controls">
              <button id="copy-structure-btn" class="icon-btn" title="复制结果">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            </div>
          </div>
          <div class="editable-result">${cleanResult}</div>
        </div>`;
    
    // 【关键】为新生成的复制按钮绑定事件
    document.getElementById('copy-structure-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(cleanResult);
        // (可选) 可以在这里增加一个“复制成功”的视觉反馈
    });
    
    // 保存历史记录的逻辑（保持不变）
    try { 
        await supabase.from('history').insert({ user_input: currentUserInput, action: 'structure', result: cleanResult }); 
        loadUserHistory(); 
    } catch (e) { 
        console.error('Error saving history:', e); 
    }
});
  
  historyToggleBtn.addEventListener('click', (event) => {
    historyDropdown.classList.toggle('active');
    event.stopPropagation();
  });
  clearHistoryBtn.addEventListener('click', () => {
  // 1. 获取自定义对话框的 DOM 元素
  const confirmOverlay = document.getElementById('custom-confirm-overlay');
  if (!confirmOverlay) return;

  // 2. 显示自定义对话框
  confirmOverlay.classList.add('active');

  // 3. 为对话框内的按钮绑定一次性的点击事件
  const okBtn = document.getElementById('confirm-ok-btn');
  const cancelBtn = document.getElementById('confirm-cancel-btn');

  const handleConfirm = async () => {
    // 执行真正的删除操作
    if (!user) return;
    try {
      await supabase.from('history').delete().eq('user_id', user.id);
      history = [];
      renderHistory();
    } catch (error) {
      alert('清空失败。');
    }
    cleanup(); // 关闭对话框并移除监听器
  };

  const handleCancel = () => {
    cleanup(); // 只关闭对话框并移除监听器
  };
  
  // 清理函数，用于关闭对话框和移除事件监听器，防止内存泄漏
  const cleanup = () => {
    confirmOverlay.classList.remove('active');
    okBtn.removeEventListener('click', handleConfirm);
    cancelBtn.removeEventListener('click', handleCancel);
  };

  // 绑定事件
  okBtn.addEventListener('click', handleConfirm);
  cancelBtn.addEventListener('click', handleCancel);
});

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!historyDropdown.contains(target) && !target.closest('#historyToggleBtn')) {
      historyDropdown.classList.remove('active');
    }
    
    // 处理结果区域的可编辑功能
    const editableTarget = target.closest('.editable-result');
    if (editableTarget && editableTarget.contentEditable !== 'true') {
      editableTarget.contentEditable = true;
      editableTarget.classList.add('editable');
      editableTarget.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editableTarget);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    
    // 【新增】处理输入框的可编辑功能
    const inputTarget = target.closest('.editable-input');
    if (inputTarget && inputTarget.contentEditable !== 'true') {
      // 如果是默认提示文字，清空内容
      if (inputTarget.textContent === '正在等待用户输入...') {
        inputTarget.textContent = '';
      }
      
      inputTarget.contentEditable = true;
      inputTarget.classList.add('editable');
      inputTarget.classList.remove('placeholder');
      inputTarget.focus();
      
      // 将光标移到末尾
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(inputTarget);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
  
  document.addEventListener('blur', (event) => {
    if (event.target.classList.contains('editable-result')) {
      event.target.contentEditable = false;
      event.target.classList.remove('editable');
    }
    
    // 【新增】处理输入框失去焦点
    if (event.target.classList.contains('editable-input')) {
      event.target.contentEditable = false;
      event.target.classList.remove('editable');
      
      // 更新currentUserInput变量
      const newText = event.target.textContent.trim();
      if (newText === '') {
        event.target.textContent = '正在等待用户输入...';
        event.target.classList.add('placeholder');
        currentUserInput = '';
      } else {
        currentUserInput = newText;
        event.target.classList.remove('placeholder');
      }
      
      // 重置优化状态
      resetOptimization();
    }
  }, true);
}

// =============================================================
//  5. 脚本启动
// =============================================================
setupEventListeners();

// 更新用户信息显示函数
function updateUserDisplay(user) {
  const userEmailElem = document.getElementById('userEmail');
  const userEmailInSettingsElem = document.getElementById('userEmailInSettings');
  
  if (userEmailElem) userEmailElem.textContent = user.email;
  if (userEmailInSettingsElem) userEmailInSettingsElem.textContent = user.email;
}