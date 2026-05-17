function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const adminUiCss = String.raw`
:root {
  color-scheme: light;
  --bg: #f3f5f8;
  --panel: #ffffff;
  --text: #17202a;
  --muted: #5f6b7a;
  --line: #d7dde5;
  --accent: #0f766e;
  --accent-strong: #0b4f49;
  --danger: #b42318;
  --warning: #b54708;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

a {
  color: var(--accent);
}

button,
input,
textarea,
select {
  font: inherit;
}

.shell {
  width: min(1180px, calc(100% - 24px));
  margin: 0 auto;
  padding: 24px 0 48px;
}

.hero {
  margin-bottom: 18px;
}

.hero h1 {
  margin: 0;
  font-size: clamp(28px, 4vw, 42px);
}

.hero p {
  margin: 8px 0 0;
  color: var(--muted);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 14px;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 18px;
}

.panel-wide {
  grid-column: 1 / -1;
}

.panel h2 {
  margin: 0 0 14px;
  font-size: 20px;
}

.muted {
  color: var(--muted);
}

.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.field label {
  color: var(--muted);
  font-size: 14px;
}

.field input,
.field textarea,
.field select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--text);
}

.field textarea {
  min-height: 120px;
  resize: vertical;
}

.inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.inline label {
  color: var(--muted);
  font-size: 14px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
}

.actions button {
  padding: 10px 14px;
  border: 0;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}

.actions button.secondary {
  background: #dcefea;
  color: var(--accent-strong);
}

.actions button.ghost {
  background: #eef2f6;
  color: var(--text);
}

.status-bar {
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #eef6f4;
  color: var(--accent-strong);
}

.status-bar.error {
  background: #fff0ee;
  color: var(--danger);
}

.status-bar.warning {
  background: #fff6eb;
  color: var(--warning);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.stat-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  background: #fbfcfd;
}

.stat-card span {
  display: block;
  color: var(--muted);
  font-size: 13px;
}

.stat-card strong {
  display: block;
  margin-top: 8px;
  font-size: 20px;
}

.list {
  margin: 12px 0 0;
  padding-left: 18px;
}

.list li {
  margin-bottom: 6px;
}

.qr-wrap {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 12px;
  margin-top: 12px;
}

.qr-preview {
  width: 180px;
  height: 180px;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.qr-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.json {
  margin: 0;
  padding: 14px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: #0f172a;
  color: #dbe8ff;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.55;
}

.help {
  margin-top: 8px;
  color: var(--muted);
  font-size: 13px;
}

@media (max-width: 760px) {
  .qr-wrap {
    grid-template-columns: 1fr;
  }
}
`;

const adminUiScript = String.raw`
(function () {
  var adminTokenInput = document.getElementById('admin-token');
  var apiTokenInput = document.getElementById('api-token');
  var connectStatus = document.getElementById('connect-status');
  var statusCards = document.getElementById('status-cards');
  var accountList = document.getElementById('account-list');
  var loginAliasInput = document.getElementById('login-alias');
  var loginAccountNameInput = document.getElementById('login-account-name');
  var loginDefaultInput = document.getElementById('login-default');
  var loginStatus = document.getElementById('login-status');
  var loginJson = document.getElementById('login-json');
  var qrPreview = document.getElementById('qr-preview');
  var qrLink = document.getElementById('qr-link');
  var sendModeInput = document.getElementById('send-mode');
  var sendAccountInput = document.getElementById('send-account');
  var sendToInput = document.getElementById('send-to');
  var sendReplyInput = document.getElementById('send-reply');
  var sendMessageInput = document.getElementById('send-message');
  var sendMediaUrlInput = document.getElementById('send-media-url');
  var sendFilePathInput = document.getElementById('send-file-path');
  var sendStatus = document.getElementById('send-status');
  var sendJson = document.getElementById('send-json');
  var mediaFields = document.getElementById('media-fields');
  var messageFields = document.getElementById('message-fields');
  var lastAlias = '';
  var loginPollTimer = 0;

  function setStoredTokens() {
    adminTokenInput.value = localStorage.getItem('weixin-admin-token') || '';
    apiTokenInput.value = localStorage.getItem('weixin-api-token') || '';
  }

  function normalizeToken(raw) {
    var cleaned = String(raw || '')
      .replace(/^Bearer\s+/i, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/["'\x60]/g, '')
      .trim();
    var candidates = cleaned.match(/[A-Za-z0-9_-]{24,}/g);
    if (candidates && candidates.length) {
      return candidates.sort(function (a, b) { return b.length - a.length; })[0];
    }
    return cleaned.replace(/\s+/g, '');
  }

  function getTokenMeta(kind) {
    var raw = kind === 'admin' ? adminTokenInput.value : apiTokenInput.value;
    var normalized = normalizeToken(raw);
    var hadInvalidChars = /[^\x21-\x7E]/.test(normalized);
    return {
      raw: raw,
      normalized: normalized,
      hadInvalidChars: hadInvalidChars
    };
  }

  function saveTokens() {
    var adminMeta = getTokenMeta('admin');
    var apiMeta = getTokenMeta('api');
    adminTokenInput.value = adminMeta.normalized;
    apiTokenInput.value = apiMeta.normalized;
    localStorage.setItem('weixin-admin-token', adminMeta.normalized);
    localStorage.setItem('weixin-api-token', apiMeta.normalized);
  }

  function setBanner(target, text, level) {
    target.textContent = text;
    target.className = 'status-bar' + (level ? ' ' + level : '');
  }

  function pretty(value) {
    return JSON.stringify(value, null, 2);
  }

  function authHeaders(kind) {
    var meta = getTokenMeta(kind);
    var headers = {};
    if (meta.hadInvalidChars) {
      throw new Error((kind === 'admin' ? 'Admin Token' : 'API Token') + ' 无法提取纯 token，请只保留 24 位以上的字母、数字、下划线或连字符。');
    }
    if (meta.normalized) {
      headers.Authorization = 'Bearer ' + meta.normalized;
    }
    return headers;
  }

  async function requestJson(url, options, kind) {
    var opts = options || {};
    var headers = Object.assign({}, authHeaders(kind), opts.headers || {});
    var response = await fetch(url, Object.assign({}, opts, { headers: headers }));
    var text = await response.text();
    var data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (error) {
      throw new Error('服务返回了非 JSON 内容：' + text.slice(0, 300));
    }
    if (!response.ok || data.ok === false) {
      throw new Error(data && data.error ? data.error : 'HTTP ' + response.status);
    }
    return data;
  }

  function renderStatusCards(statusData, accountsData) {
    var runtime = statusData.runtime || {};
    var cards = [
      ['启动时间', statusData.startedAt || '-'],
      ['监听状态', runtime.listenState || '-'],
      ['入站总数', String(runtime.inboundCount || 0)],
      ['出站总数', String(runtime.outboundCount || 0)],
      ['发送错误', String(runtime.sendErrorCount || 0)],
      ['账号数', String(statusData.accountCount || 0)]
    ];
    statusCards.innerHTML = cards.map(function (item) {
      return '<div class="stat-card"><span>' + item[0] + '</span><strong>' + item[1] + '</strong></div>';
    }).join('');
    var accounts = (accountsData && accountsData.accounts) || [];
    if (!accounts.length) {
      accountList.innerHTML = '<li>当前没有已登录账号。</li>';
      return;
    }
    accountList.innerHTML = accounts.map(function (account) {
      return '<li><strong>' + account.alias + '</strong> · ' +
        (account.default ? 'default' : 'secondary') + ' · ' +
        (account.online ? 'online' : 'offline') + '</li>';
    }).join('');
  }

  async function refreshStatus() {
    saveTokens();
    setBanner(connectStatus, '正在拉取服务状态...', '');
    try {
      var statusData = await requestJson('/status', { method: 'GET' }, 'api');
      var accountsData = await requestJson('/accounts', { method: 'GET' }, 'api');
      renderStatusCards(statusData, accountsData);
      setBanner(connectStatus, '服务连接正常，状态已刷新。', '');
    } catch (error) {
      setBanner(connectStatus, String(error.message || error), 'error');
      statusCards.innerHTML = '';
      accountList.innerHTML = '<li>读取失败。</li>';
    }
  }

  function renderLoginSession(data) {
    loginJson.textContent = pretty(data);
    var session = data && data.session ? data.session : null;
    if (!session) {
      qrPreview.innerHTML = '<div class="muted" style="padding:12px;">暂无二维码</div>';
      qrLink.textContent = '-';
      qrLink.removeAttribute('href');
      return;
    }
    if (session.qrcodeUrl) {
      qrPreview.innerHTML = '<img alt="微信扫码二维码" src="' + session.qrcodeUrl + '">';
      qrLink.textContent = session.qrcodeUrl;
      qrLink.href = session.qrcodeUrl;
    } else {
      qrPreview.innerHTML = '<div class="muted" style="padding:12px;">当前状态没有二维码</div>';
      qrLink.textContent = '-';
      qrLink.removeAttribute('href');
    }
    if (session.status === 'pending') {
      setBanner(loginStatus, '等待扫码中：' + session.alias, 'warning');
    } else if (session.status === 'succeeded') {
      setBanner(loginStatus, '登录成功：' + session.alias + ' -> ' + (session.accountId || '-'), '');
    } else {
      setBanner(loginStatus, '登录状态：' + session.status + (session.error ? '，' + session.error : ''), 'error');
    }
  }

  function stopPolling() {
    if (loginPollTimer) {
      clearInterval(loginPollTimer);
      loginPollTimer = 0;
    }
  }

  async function queryAliasStatus(alias, silent) {
    if (!alias) {
      setBanner(loginStatus, '请先输入 alias。', 'error');
      return;
    }
    lastAlias = alias;
    try {
      var data = await requestJson('/admin/login/alias/' + encodeURIComponent(alias), { method: 'GET' }, 'admin');
      renderLoginSession(data);
      if (data.session && data.session.status !== 'pending') {
        stopPolling();
        refreshStatus();
      }
    } catch (error) {
      if (!silent) {
        setBanner(loginStatus, String(error.message || error), 'error');
      }
    }
  }

  async function startLogin() {
    saveTokens();
    var alias = loginAliasInput.value.trim();
    if (!alias) {
      setBanner(loginStatus, '请先填写 alias。', 'error');
      return;
    }
    stopPolling();
    setBanner(loginStatus, '正在发起登录会话...', 'warning');
    try {
      var payload = {
        alias: alias,
        accountName: loginAccountNameInput.value.trim() || undefined,
        default: Boolean(loginDefaultInput.checked)
      };
      var data = await requestJson('/admin/login/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, 'admin');
      renderLoginSession(data);
      lastAlias = alias;
      loginPollTimer = window.setInterval(function () {
        queryAliasStatus(alias, true);
      }, 3000);
    } catch (error) {
      setBanner(loginStatus, String(error.message || error), 'error');
    }
  }

  function updateSendMode() {
    var mode = sendModeInput.value;
    mediaFields.style.display = mode === 'media' ? 'grid' : 'none';
    messageFields.style.display = 'block';
  }

  async function submitSend() {
    saveTokens();
    var mode = sendModeInput.value;
    var endpoint = '/send';
    var payload = {
      account: sendAccountInput.value.trim() || undefined,
      to: sendToInput.value.trim() || undefined,
      message: sendMessageInput.value,
      reply: Boolean(sendReplyInput.checked)
    };
    if (mode === 'markdown') {
      endpoint = '/send/markdown';
    } else if (mode === 'media') {
      endpoint = '/send/media';
      payload.mediaUrl = sendMediaUrlInput.value.trim() || undefined;
      payload.filePath = sendFilePathInput.value.trim() || undefined;
    }
    setBanner(sendStatus, '正在发送...', 'warning');
    try {
      var result = await requestJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, 'api');
      sendJson.textContent = pretty(result);
      setBanner(sendStatus, '发送成功。', '');
      refreshStatus();
    } catch (error) {
      sendJson.textContent = '';
      setBanner(sendStatus, String(error.message || error), 'error');
    }
  }

  document.getElementById('save-tokens').addEventListener('click', function () {
    try {
      saveTokens();
      setBanner(connectStatus, 'Token 已规范化并保存到当前浏览器。', '');
    } catch (error) {
      setBanner(connectStatus, String(error.message || error), 'error');
    }
  });

  document.getElementById('test-connection').addEventListener('click', function () {
    refreshStatus();
  });

  document.getElementById('refresh-status').addEventListener('click', function () {
    refreshStatus();
  });

  document.getElementById('start-login').addEventListener('click', function () {
    startLogin();
  });

  document.getElementById('check-alias').addEventListener('click', function () {
    queryAliasStatus(loginAliasInput.value.trim(), false);
  });

  sendModeInput.addEventListener('change', updateSendMode);
  document.getElementById('send-submit').addEventListener('click', function () {
    submitSend();
  });

  setStoredTokens();
  updateSendMode();
  if (adminTokenInput.value || apiTokenInput.value) {
    refreshStatus();
  }
})();
`;

export function renderAdminUiHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>微信桥接管理台</title>
  <style>${adminUiCss}</style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <h1>微信桥接管理台</h1>
      <p>首版内置管理页，当前覆盖登录管理、状态总览和消息发送。页面本身可直接打开，真正的数据访问仍由 token 控制。</p>
    </section>

    <div class="grid">
      <section class="panel panel-wide">
        <h2>连接配置</h2>
        <div id="connect-status" class="status-bar warning">请先填写 Admin Token 和 API Token，再测试连接。</div>
        <div class="row">
          <div class="field">
            <label for="admin-token">Admin Token</label>
            <input id="admin-token" type="password" placeholder="用于 /admin/* 接口">
          </div>
          <div class="field">
            <label for="api-token">API Token</label>
            <input id="api-token" type="password" placeholder="用于 /send /status /accounts">
          </div>
        </div>
        <div class="actions">
          <button id="save-tokens" class="secondary" type="button">保存 Token</button>
          <button id="test-connection" type="button">测试连接</button>
        </div>
        <div class="help">Token 仅保存在当前浏览器的 localStorage，不会写回服务端。</div>
      </section>

      <section class="panel">
        <h2>状态总览</h2>
        <div class="actions">
          <button id="refresh-status" class="ghost" type="button">刷新状态</button>
        </div>
        <div id="status-cards" class="cards" style="margin-top:12px;"></div>
        <h3>账号列表</h3>
        <ul id="account-list" class="list">
          <li>尚未加载。</li>
        </ul>
      </section>

      <section class="panel">
        <h2>登录管理</h2>
        <div id="login-status" class="status-bar warning">输入 alias 后可发起扫码登录，页面会自动轮询最近一次登录状态。</div>
        <div class="field">
          <label for="login-alias">Alias</label>
          <input id="login-alias" type="text" placeholder="例如 research-bot">
        </div>
        <div class="field">
          <label for="login-account-name">账号名（可选）</label>
          <input id="login-account-name" type="text" placeholder="例如 投研机器人">
        </div>
        <div class="inline">
          <input id="login-default" type="checkbox" checked>
          <label for="login-default">设为默认账号</label>
        </div>
        <div class="actions">
          <button id="start-login" type="button">发起登录</button>
          <button id="check-alias" class="secondary" type="button">按 Alias 查询</button>
        </div>
        <div class="qr-wrap">
          <div id="qr-preview" class="qr-preview"><div class="muted" style="padding:12px;">暂无二维码</div></div>
          <div>
            <div class="field">
              <label>二维码链接</label>
              <a id="qr-link" href="#" target="_blank" rel="noreferrer">-</a>
            </div>
            <pre id="login-json" class="json">{}</pre>
          </div>
        </div>
      </section>

      <section class="panel panel-wide">
        <h2>消息发送</h2>
        <div id="send-status" class="status-bar warning">支持文本、Markdown 和媒体发送。发送结果会显示在下方。</div>
        <div class="row">
          <div class="field">
            <label for="send-mode">发送模式</label>
            <select id="send-mode">
              <option value="text">文本</option>
              <option value="markdown">Markdown</option>
              <option value="media">媒体</option>
            </select>
          </div>
          <div class="field">
            <label for="send-account">Account Alias（可选）</label>
            <input id="send-account" type="text" placeholder="默认使用 default">
          </div>
          <div class="field">
            <label for="send-to">目标 userId（可选）</label>
            <input id="send-to" type="text" placeholder="不填则发送给默认 userId">
          </div>
        </div>
        <div class="inline" style="margin-bottom:12px;">
          <input id="send-reply" type="checkbox">
          <label for="send-reply">按 reply 语义发送</label>
        </div>
        <div id="message-fields">
          <div class="field">
            <label for="send-message">消息内容</label>
            <textarea id="send-message" placeholder="输入文本或 Markdown 内容"></textarea>
          </div>
        </div>
        <div id="media-fields" class="row" style="display:none;">
          <div class="field">
            <label for="send-media-url">mediaUrl（可选）</label>
            <input id="send-media-url" type="text" placeholder="https://...">
          </div>
          <div class="field">
            <label for="send-file-path">filePath（可选）</label>
            <input id="send-file-path" type="text" placeholder="/absolute/path/to/file.png">
          </div>
        </div>
        <div class="actions">
          <button id="send-submit" type="button">发送消息</button>
        </div>
        <pre id="send-json" class="json" style="margin-top:12px;">{}</pre>
      </section>
    </div>
  </div>
  <script>${adminUiScript}</script>
</body>
</html>`;
}

export function renderAdminUiNotFound() {
  return `<div class="muted">${escapeHtml("管理台资源不可用")}</div>`;
}
