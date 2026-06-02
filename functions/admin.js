// functions/admin.js
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  // ========== 验证管理员环境变量 ==========
  const adminPassword = env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return new Response('请先在 Cloudflare 面板设置 ADMIN_PASSWORD 环境变量并重新部署', {
      status: 500,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
    });
  }

  // ========== 公共函数：读取/写入 KV ==========
  const KV_KEY = 'petvid_data';
  async function getData() {
    try {
      const stored = await env.DATA.get(KV_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }
  async function saveData(data) {
    await env.DATA.put(KV_KEY, JSON.stringify(data));
  }

  // ========== 工具：认证 ==========
  async function checkAuth(cookie) {
    const match = (cookie || '').match(/admin_token=([^;]+)/);
    if (!match) return false;
    const expected = await sha256(adminPassword);
    return match[1] === expected;
  }
  async function requireAuth(request) {
    const isAuth = await checkAuth(request.headers.get('Cookie'));
    if (!isAuth) {
      return new Response('未授权', { status: 401 });
    }
    return null; // 通过
  }


  if (url.searchParams.get('logout') === '1') {
    return new Response('已退出登录。 <a href="/admin">返回登录</a>', {
      status:200,
      headers:{
        'Set-Cookie': 'admin_token=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0',
        'Content-Type':'text/html;charset=UTF-8'
      }
    });
  }

  // ========== 处理 GET ==========
  if (method === 'GET') {
    // --- 如果未登录，显示登录页 ---
    const isAuth = await checkAuth(request.headers.get('Cookie'));
    if (!isAuth) {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
      });
    }

    // --- 已登录：根据路径渲染不同管理页面 ---
    const pathPart = url.searchParams.get('path') || '';  // 如 "user/abc" 或 "user/abc/platform/tube"
    const [scope, userId, subScope, platformId] = pathPart.split('/');

    if (!scope) {
      // 管理首页：列出所有用户
      return renderUserList(await getData());
    } else if (scope === 'user' && userId) {
      if (!subScope) {
        // 列出该用户下的平台
        return renderPlatformList(await getData(), userId);
      } else if (subScope === 'platform' && platformId) {
        // 列出该平台下的视频
        return renderVideoList(await getData(), userId, platformId);
      }
    }
    // 未知路径
    return renderUserList(await getData());
  }

  // ========== 处理 POST（API 操作） ==========
  if (method === 'POST') {
    // 先验证权限
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
      const body = await request.json();
      const { action, ...params } = body;
      const data = await getData();

      switch (action) {
        // ----- 用户操作 -----
        case 'addUser': {
          const { userId, displayName } = params;
          if (!userId || !displayName) throw new Error('缺少 userId 或 displayName');
          if (data.accounts[userId]) throw new Error('用户已存在');
          data.accounts[userId] = { displayName, platforms: {} };
          await saveData(data);
          return jsonResponse({ ok: true });
        }
        case 'deleteUser': {
          const { userId } = params;
          if (!data.accounts[userId]) throw new Error('用户不存在');
          delete data.accounts[userId];
          await saveData(data);
          return jsonResponse({ ok: true });
        }

        // ----- 平台操作 -----
        case 'addPlatform': {
          const { userId, platformId, displayName } = params;
          if (!userId || !platformId || !displayName) throw new Error('缺少参数');
          if (!data.accounts[userId]) throw new Error('用户不存在');
          if (data.accounts[userId].platforms[platformId]) throw new Error('平台已存在');
          data.accounts[userId].platforms[platformId] = { displayName, videos: {} };
          await saveData(data);
          return jsonResponse({ ok: true });
        }
        case 'deletePlatform': {
          const { userId, platformId } = params;
          if (!data.accounts[userId] || !data.accounts[userId].platforms[platformId]) throw new Error('平台不存在');
          delete data.accounts[userId].platforms[platformId];
          await saveData(data);
          return jsonResponse({ ok: true });
        }

        // ----- 视频操作 -----
        case 'addVideo': {
          const { userId, platformId, videoId, title, imageUrl, affiliateLink } = params;
          if (!userId || !platformId || !videoId || !title || !imageUrl || !affiliateLink) throw new Error('缺少参数');
          if (!data.accounts[userId] || !data.accounts[userId].platforms[platformId]) throw new Error('平台不存在');
          if (data.accounts[userId].platforms[platformId].videos[videoId]) throw new Error('视频ID已存在');
          data.accounts[userId].platforms[platformId].videos[videoId] = { title, imageUrl, affiliateLink };
          await saveData(data);
          return jsonResponse({ ok: true });
        }
        case 'editVideo': {
          const { userId, platformId, videoId, title, imageUrl, affiliateLink } = params;
          if (!data.accounts[userId] || !data.accounts[userId].platforms[platformId] || !data.accounts[userId].platforms[platformId].videos[videoId]) throw new Error('视频不存在');
          data.accounts[userId].platforms[platformId].videos[videoId] = { title, imageUrl, affiliateLink };
          await saveData(data);
          return jsonResponse({ ok: true });
        }
        case 'deleteVideo': {
          const { userId, platformId, videoId } = params;
          if (!data.accounts[userId] || !data.accounts[userId].platforms[platformId] || !data.accounts[userId].platforms[platformId].videos[videoId]) throw new Error('视频不存在');
          delete data.accounts[userId].platforms[platformId].videos[videoId];
          await saveData(data);
          return jsonResponse({ ok: true });
        }

        default:
          return jsonResponse({ error: '未知操作' }, 400);
      }
    } catch (e) {
      return jsonResponse({ error: e.message || '操作失败' }, 500);
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}

// ========== 工具函数 ==========
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ========== 页面渲染函数 ==========
function renderUserList(data) {
  const users = Object.entries(data.accounts || {});
  const cards = users.map(([id, acc]) => `
    <div class="card">
      <h3>${acc.displayName} <small>(${id})</small></h3>
      <a href="/admin?path=user/${id}" class="btn">管理平台</a>
      <button class="btn danger" onclick="deleteUser('${id}')">删除</button>
    </div>
  `).join('');

  return new Response(adminPage(`
    <h2>管理用户</h2>
    <div class="toolbar">
      <input type="text" id="newUserId" placeholder="用户ID (如 bob)" />
      <input type="text" id="newUserDisplayName" placeholder="显示名称" />
      <button class="btn" onclick="addUser()">添加用户</button>
    </div>
    <div class="card-grid">${cards || '<p>暂无用户</p>'}</div>
  `, {
    script: `
      async function addUser() {
        const userId = document.getElementById('newUserId').value.trim();
        const displayName = document.getElementById('newUserDisplayName').value.trim();
        if (!userId || !displayName) return alert('请填写完整');
        const res = await fetch('/admin', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'addUser', userId, displayName })
        });
        const data = await res.json();
        if (data.ok) location.reload();
        else alert(data.error);
      }
      async function deleteUser(userId) {
        if (!confirm('确定删除用户 ' + userId + ' ？')) return;
        const res = await fetch('/admin', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'deleteUser', userId })
        });
        const data = await res.json();
        if (data.ok) location.reload();
        else alert(data.error);
      }
    `
  }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

function renderPlatformList(data, userId) {
  const user = data.accounts[userId];
  if (!user) return renderUserList(data); // 回退

  const platforms = Object.entries(user.platforms || {});
  const cards = platforms.map(([id, plat]) => `
    <div class="card">
      <h3>${plat.displayName} <small>(${id})</small></h3>
      <a href="/admin?path=user/${userId}/platform/${id}" class="btn">管理视频</a>
      <button class="btn danger" onclick="deletePlatform('${userId}','${id}')">删除</button>
    </div>
  `).join('');

  return new Response(adminPage(`
    <h2>${user.displayName} 的平台</h2>
    <div class="breadcrumb"><a href="/admin">← 返回用户列表</a></div>
    <div class="toolbar">
      <input type="text" id="newPlatformId" placeholder="平台ID (如 tube)" />
      <input type="text" id="newPlatformDisplayName" placeholder="平台名称" />
      <button class="btn" onclick="addPlatform('${userId}')">添加平台</button>
    </div>
    <div class="card-grid">${cards || '<p>暂无平台</p>'}</div>
  `, {
    script: `
      async function addPlatform(userId) {
        const platformId = document.getElementById('newPlatformId').value.trim();
        const displayName = document.getElementById('newPlatformDisplayName').value.trim();
        if (!platformId || !displayName) return alert('请填写完整');
        const res = await fetch('/admin', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'addPlatform', userId, platformId, displayName })
        });
        const data = await res.json();
        if (data.ok) location.reload();
        else alert(data.error);
      }
      async function deletePlatform(userId, platformId) {
        if (!confirm('确定删除平台 ' + platformId + ' ？')) return;
        const res = await fetch('/admin', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'deletePlatform', userId, platformId })
        });
        const data = await res.json();
        if (data.ok) location.reload();
        else alert(data.error);
      }
    `
  }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

function renderVideoList(data, userId, platformId) {
  const user = data.accounts[userId];
  if (!user) return renderUserList(data);
  const platform = user.platforms[platformId];
  if (!platform) return renderPlatformList(data, userId);

  const videos = Object.entries(platform.videos || {});
  const cards = videos.map(([id, vid]) => `
    <div class="card video-card">
      <h3>${vid.title} <small>(${id})</small></h3>
      <img src="${vid.imageUrl}" alt="${vid.title}" style="max-width:100px; border-radius:4px;" />
      <p>推广链接: <a href="${vid.affiliateLink}" target="_blank">点击</a></p>
      <div class="btn-group">
        <button class="btn" onclick="editVideo('${userId}','${platformId}','${id}')">编辑</button>
        <button class="btn danger" onclick="deleteVideo('${userId}','${platformId}','${id}')">删除</button>
      </div>
    </div>
  `).join('');

  return new Response(adminPage(`
    <h2>${platform.displayName} 的视频</h2>
    <div class="breadcrumb">
      <a href="/admin">用户列表</a> &gt; 
      <a href="/admin?path=user/${userId}">${user.displayName}</a>
    </div>
    <div class="toolbar">
      <input type="text" id="newVideoId" placeholder="视频ID (如 V001)" />
      <input type="text" id="newVideoTitle" placeholder="标题" />
      <input type="text" id="newVideoImageUrl" placeholder="图片URL" />
      <input type="text" id="newVideoAffiliateLink" placeholder="推广链接" />
      <button class="btn" onclick="addVideo('${userId}','${platformId}')">添加视频</button>
    </div>
    <div class="card-grid">${cards || '<p>暂无视频</p>'}</div>
  `, {
    script: `
      async function addVideo(userId, platformId) {
        const videoId = document.getElementById('newVideoId').value.trim();
        const title = document.getElementById('newVideoTitle').value.trim();
        const imageUrl = document.getElementById('newVideoImageUrl').value.trim();
        const affiliateLink = document.getElementById('newVideoAffiliateLink').value.trim();
        if (!videoId || !title || !imageUrl || !affiliateLink) return alert('请填写完整');
        const res = await fetch('/admin', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'addVideo', userId, platformId, videoId, title, imageUrl, affiliateLink })
        });
        const data = await res.json();
        if (data.ok) location.reload();
        else alert(data.error);
      }
      async function deleteVideo(userId, platformId, videoId) {
        if (!confirm('确定删除视频 ' + videoId + ' ？')) return;
        const res = await fetch('/admin', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'deleteVideo', userId, platformId, videoId })
        });
        const data = await res.json();
        if (data.ok) location.reload();
        else alert(data.error);
      }
      // 编辑视频：简单弹窗输入新值（后续可改进）
      async function editVideo(userId, platformId, videoId) {
        const title = prompt('新标题：') || '';
        const imageUrl = prompt('新图片URL：') || '';
        const affiliateLink = prompt('新推广链接：') || '';
        if (!title || !imageUrl || !affiliateLink) return alert('取消或未填写完整');
        const res = await fetch('/admin', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'editVideo', userId, platformId, videoId, title, imageUrl, affiliateLink })
        });
        const data = await res.json();
        if (data.ok) location.reload();
        else alert(data.error);
      }
    `
  }), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

// ---------- HTML 模板 ----------
function adminPage(content, options = {}) {
  const extraScript = options.script || '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理面板 - PetVid</title>
  <link rel="stylesheet" href="/style.css">
  <style>
    body { font-family: Arial, sans-serif; background: #f0f2f5; margin:0; padding:20px; }
    .admin-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
    .admin-header h1 { margin:0; }
    .admin-header a { text-decoration:none; color:#666; }
    .toolbar { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
    .toolbar input { flex:1; min-width:120px; padding:8px; border:1px solid #ccc; border-radius:4px; }
    .card-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap:16px; }
    .card { background:white; border-radius:8px; padding:16px; box-shadow:0 2px 4px rgba(0,0,0,0.1); }
    .card h3 { margin:0 0 8px 0; }
    .card .btn { margin-right:4px; }
    .btn { display:inline-block; padding:6px 12px; background:#007acc; color:white; border:none; border-radius:4px; cursor:pointer; text-decoration:none; font-size:14px; }
    .btn.danger { background:#e74c3c; }
    .btn:hover { opacity:0.85; }
    .breadcrumb a { color:#007acc; text-decoration:none; }
    .breadcrumb { margin-bottom:16px; }
    .video-card .btn-group { margin-top:8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="admin-header">
      <h1>📊 管理面板</h1>
      <a href="/admin?logout=1">退出登录</a>
    </div>
    ${content}
  </div>
  <script>
    ${extraScript}
  </script>
</body>
</html>`;
}

// ---------- 登录页 ----------
function getLoginPage(adminPassword) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理员登录</title>
  <link rel="stylesheet" href="/style.css">
  <style>
    body { font-family: Arial, sans-serif; background: #f0f2f5; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; }
    .login-box { background:white; padding:30px; border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.1); width:300px; }
    h2 { margin-top:0; text-align:center; }
    input { width:100%; padding:10px; margin:10px 0; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; }
    button { width:100%; padding:10px; background:#007acc; color:white; border:none; border-radius:4px; cursor:pointer; }
    button:hover { background:#005fa3; }
    .error { color:red; text-align:center; margin-top:10px; display:none; }
  </style>
</head>
<body>
  <div class="login-box">
    <h2>管理员登录</h2>
    <input type="password" id="password" placeholder="请输入密码" autofocus />
    <button id="loginBtn">登录</button>
    <div class="error" id="errorMsg">密码错误</div>
  </div>
  <script>
    document.getElementById('loginBtn').addEventListener('click', async () => {
      const password = document.getElementById('password').value;
      const errorEl = document.getElementById('errorMsg');
      if (!password) { errorEl.textContent = '请输入密码'; errorEl.style.display = 'block'; return; }
      try {
        const res = await fetch('/admin', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ password })
        });
        if (res.ok) {
          window.location.reload();
        } else {
          const text = await res.text();
          errorEl.textContent = text || '密码错误';
          errorEl.style.display = 'block';
        }
      } catch (err) {
        errorEl.textContent = '网络错误';
        errorEl.style.display = 'block';
      }
    });
    document.getElementById('password').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') document.getElementById('loginBtn').click();
    });
  </script>
</body>
</html>`;
}
