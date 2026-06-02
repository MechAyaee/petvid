// functions/admin.js

// ========== 全局辅助函数（在 onRequest 之外定义）==========
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
  return hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

async function getDataFromKV(env) {
  try {
    var stored = await env.DATA.get('petvid_data');
    if (stored) {
      return JSON.parse(stored);
    }
    return {};
  } catch(e) {
    return {};
  }
}

async function saveDataToKV(env, data) {
  await env.DATA.put('petvid_data', JSON.stringify(data));
}

async function checkAuth(cookie, adminPassword) {
  if (!cookie) return false;
  var match = cookie.match(/admin_token=([^;]+)/);
  if (!match) return false;
  var expected = await sha256(adminPassword);
  return match[1] === expected;
}

// ========== 登录页 HTML ==========
function getLoginPage() {
  return '<!DOCTYPE html>' +
  '<html lang="zh-CN">' +
  '<head>' +
  '<meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
  '<title>管理员登录</title>' +
  '<style>' +
    'body { font-family: Arial, sans-serif; background: #f0f2f5; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; }' +
    '.login-box { background:white; padding:30px; border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.1); width:300px; }' +
    'h2 { margin-top:0; text-align:center; }' +
    'input { width:100%; padding:10px; margin:10px 0; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; }' +
    'button { width:100%; padding:10px; background:#007acc; color:white; border:none; border-radius:4px; cursor:pointer; }' +
    'button:hover { background:#005fa3; }' +
    '.error { color:red; text-align:center; margin-top:10px; display:none; }' +
  '</style>' +
  '</head>' +
  '<body>' +
  '<div class="login-box">' +
    '<h2>管理员登录</h2>' +
    '<input type="password" id="password" placeholder="请输入密码" autofocus />' +
    '<button id="loginBtn">登录</button>' +
    '<div class="error" id="errorMsg">密码错误</div>' +
  '</div>' +
  '<script>' +
    'document.getElementById("loginBtn").addEventListener("click", async function() {' +
      'var password = document.getElementById("password").value;' +
      'var errorEl = document.getElementById("errorMsg");' +
      'if (!password) { errorEl.textContent = "请输入密码"; errorEl.style.display = "block"; return; }' +
      'try {' +
        'var res = await fetch("/admin", {' +
          'method: "POST",' +
          'headers: {"Content-Type": "application/json"},' +
          'body: JSON.stringify({ password: password })' +
        '});' +
        'if (res.ok) { window.location.reload(); }' +
        'else { var text = await res.text(); errorEl.textContent = text || "密码错误"; errorEl.style.display = "block"; }' +
      '} catch(err) { errorEl.textContent = "网络错误"; errorEl.style.display = "block"; }' +
    '});' +
    'document.getElementById("password").addEventListener("keypress", function(e) {' +
      'if (e.key === "Enter") document.getElementById("loginBtn").click();' +
    '});' +
  '</script>' +
  '</body>' +
  '</html>';
}

// ========== 管理页面模板 ==========
function adminPage(content, extraScript) {
  if (!extraScript) extraScript = '';
  return '<!DOCTYPE html>' +
  '<html lang="zh-CN">' +
  '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>管理面板 - PetVid</title>' +
    '<link rel="stylesheet" href="/style.css">' +
    '<style>' +
      'body { font-family: Arial, sans-serif; background: #f0f2f5; margin:0; padding:20px; }' +
      '.admin-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }' +
      '.admin-header h1 { margin:0; }' +
      '.admin-header a { text-decoration:none; color:#666; }' +
      '.toolbar { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }' +
      '.toolbar input { flex:1; min-width:120px; padding:8px; border:1px solid #ccc; border-radius:4px; }' +
      '.card-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap:16px; }' +
      '.card { background:white; border-radius:8px; padding:16px; box-shadow:0 2px 4px rgba(0,0,0,0.1); }' +
      '.card h3 { margin:0 0 8px 0; }' +
      '.card .btn { margin-right:4px; }' +
      '.btn { display:inline-block; padding:6px 12px; background:#007acc; color:white; border:none; border-radius:4px; cursor:pointer; text-decoration:none; font-size:14px; }' +
      '.btn.danger { background:#e74c3c; }' +
      '.btn:hover { opacity:0.85; }' +
      '.breadcrumb a { color:#007acc; text-decoration:none; }' +
      '.breadcrumb { margin-bottom:16px; }' +
      '.video-card .btn-group { margin-top:8px; }' +
    '</style>' +
  '</head>' +
  '<body>' +
    '<div class="container">' +
      '<div class="admin-header">' +
        '<h1>管理面板</h1>' +
        '<a href="/admin?logout=1">退出登录</a>' +
      '</div>' +
      content +
    '</div>' +
    '<script>' + extraScript + '</script>' +
  '</body>' +
  '</html>';
}

// ========== 渲染用户列表 ==========
function renderUserListHtml(data) {
  var html = '<h2>管理用户</h2>' +
    '<div class="toolbar">' +
      '<input type="text" id="newUserId" placeholder="用户ID (如 bob)" />' +
      '<input type="text" id="newUserDisplayName" placeholder="显示名称" />' +
      '<button class="btn" onclick="addUser()">添加用户</button>' +
    '</div>' +
    '<div class="card-grid">';

  var accounts = data.accounts || {};
  var keys = Object.keys(accounts);
  if (keys.length === 0) {
    html += '<p>暂无用户</p>';
  } else {
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      var acc = accounts[id];
      html += '<div class="card">' +
        '<h3>' + acc.displayName + ' <small>(' + id + ')</small></h3>' +
        '<a href="/admin?path=user/' + id + '" class="btn">管理平台</a>' +
        '<button class="btn danger" onclick="deleteUser(\'' + id + '\')">删除</button>' +
      '</div>';
    }
  }

  html += '</div>';

  var script = [
    'async function addUser() {',
      'var userId = document.getElementById("newUserId").value.trim();',
      'var displayName = document.getElementById("newUserDisplayName").value.trim();',
      'if (!userId || !displayName) return alert("请填写完整");',
      'var res = await fetch("/admin", {',
        'method: "POST",',
        'headers: {"Content-Type": "application/json"},',
        'body: JSON.stringify({ action: "addUser", userId: userId, displayName: displayName })',
      '});',
      'var data = await res.json();',
      'if (data.ok) location.reload(); else alert(data.error);',
    '}',
    'async function deleteUser(userId) {',
      'if (!confirm("确定删除用户 " + userId + " ？")) return;',
      'var res = await fetch("/admin", {',
        'method: "POST",',
        'headers: {"Content-Type": "application/json"},',
        'body: JSON.stringify({ action: "deleteUser", userId: userId })',
      '});',
      'var data = await res.json();',
      'if (data.ok) location.reload(); else alert(data.error);',
    '}',
  ].join('\n');

  return adminPage(html, script);
}

// ========== 渲染平台列表 ==========
function renderPlatformListHtml(data, userId) {
  var user = data.accounts[userId];
  if (!user) return renderUserListHtml(data);

  var html = '<h2>' + user.displayName + ' 的平台</h2>' +
    '<div class="breadcrumb"><a href="/admin">← 返回用户列表</a></div>' +
    '<div class="toolbar">' +
      '<input type="text" id="newPlatformId" placeholder="平台ID (如 tube)" />' +
      '<input type="text" id="newPlatformDisplayName" placeholder="平台名称" />' +
      '<button class="btn" onclick="addPlatform(\'' + userId + '\')">添加平台</button>' +
    '</div>' +
    '<div class="card-grid">';

  var platforms = user.platforms || {};
  var keys = Object.keys(platforms);
  if (keys.length === 0) {
    html += '<p>暂无平台</p>';
  } else {
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      var plat = platforms[id];
      html += '<div class="card">' +
        '<h3>' + plat.displayName + ' <small>(' + id + ')</small></h3>' +
        '<a href="/admin?path=user/' + userId + '/platform/' + id + '" class="btn">管理视频</a>' +
        '<button class="btn danger" onclick="deletePlatform(\'' + userId + '\',\'' + id + '\')">删除</button>' +
      '</div>';
    }
  }

  html += '</div>';

  var script = [
    'async function addPlatform(userId) {',
      'var platformId = document.getElementById("newPlatformId").value.trim();',
      'var displayName = document.getElementById("newPlatformDisplayName").value.trim();',
      'if (!platformId || !displayName) return alert("请填写完整");',
      'var res = await fetch("/admin", {',
        'method: "POST",',
        'headers: {"Content-Type": "application/json"},',
        'body: JSON.stringify({ action: "addPlatform", userId: userId, platformId: platformId, displayName: displayName })',
      '});',
      'var data = await res.json();',
      'if (data.ok) location.reload(); else alert(data.error);',
    '}',
    'async function deletePlatform(userId, platformId) {',
      'if (!confirm("确定删除平台 " + platformId + " ？")) return;',
      'var res = await fetch("/admin", {',
        'method: "POST",',
        'headers: {"Content-Type": "application/json"},',
        'body: JSON.stringify({ action: "deletePlatform", userId: userId, platformId: platformId })',
      '});',
      'var data = await res.json();',
      'if (data.ok) location.reload(); else alert(data.error);',
    '}',
  ].join('\n');

  return adminPage(html, script);
}

// ========== 渲染视频列表（改进版） ==========
function renderVideoListHtml(data, userId, platformId) {
  var user = data.accounts[userId];
  if (!user) return renderUserListHtml(data);
  var platform = user.platforms[platformId];
  if (!platform) return renderPlatformListHtml(data, userId);

  var html = '<h2>' + platform.displayName + ' 的视频</h2>' +
    '<div class="breadcrumb">' +
      '<a href="/admin">用户列表</a> &gt; ' +
      '<a href="/admin?path=user/' + userId + '">' + user.displayName + '</a>' +
    '</div>' +
    '<div class="toolbar">' +
      '<button class="btn" onclick="showAddModal(\'' + userId + '\',\'' + platformId + '\')">+ 添加视频</button>' +
    '</div>' +
    '<div class="card-grid">';

  var videos = platform.videos || {};
  var keys = Object.keys(videos);
  if (keys.length === 0) {
    html += '<p>暂无视频，点击上方按钮添加</p>';
  } else {
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      var vid = videos[id];
      var imgHtml = (vid.imageUrl) ? '<img src="' + vid.imageUrl + '" alt="' + vid.title + '" style="max-width:160px; border-radius:4px; margin:8px 0;" />' : '<p style="color:#999;">未设置图片</p>';
      var linkHtml = (vid.affiliateLink) ? '<a href="' + vid.affiliateLink + '" target="_blank" style="word-break:break-all;">' + vid.affiliateLink + '</a>' : '<span style="color:#999;">未设置推广链接</span>';

      html += '<div class="card video-card" data-video-id="' + id + '">' +
        '<h3>' + vid.title + ' <small>(' + id + ')</small></h3>' +
        imgHtml +
        '<p><strong>推广链接：</strong>' + linkHtml + '</p>' +
        '<div class="btn-group">' +
          '<button class="btn" onclick="showEditModal(\'' + userId + '\',\'' + platformId + '\',\'' + id + '\',\'' + vid.title.replace(/'/g, "\\'") + '\',\'' + (vid.imageUrl || '').replace(/'/g, "\\'") + '\',\'' + (vid.affiliateLink || '').replace(/'/g, "\\'") + '\')">编辑</button>' +
          '<button class="btn danger" onclick="deleteVideo(\'' + userId + '\',\'' + platformId + '\',\'' + id + '\')">删除</button>' +
        '</div>' +
      '</div>';
    }
  }

  html += '</div>';

  // 模态框 HTML（添加和编辑共用一个）
  html += '<div id="videoModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; justify-content:center; align-items:center;">' +
    '<div style="background:white; border-radius:8px; padding:24px; max-width:500px; width:90%; box-shadow:0 4px 12px rgba(0,0,0,0.2);">' +
      '<h3 id="modalTitle">添加视频</h3>' +
      '<input type="hidden" id="modalVideoId" />' +
      '<input type="hidden" id="modalUserId" />' +
      '<input type="hidden" id="modalPlatformId" />' +
      '<div style="margin-bottom:12px;"><label>视频ID</label><input type="text" id="modalVideoIdInput" placeholder="如 V001" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" /></div>' +
      '<div style="margin-bottom:12px;"><label>标题</label><input type="text" id="modalTitleInput" placeholder="请输入视频标题" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" /></div>' +
      '<div style="margin-bottom:12px;"><label>图片URL</label><input type="text" id="modalImageUrlInput" placeholder="https://example.com/thumbnail.jpg" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" oninput="previewImage()" /></div>' +
      '<div style="margin-bottom:12px;" id="previewContainer"><img id="previewImage" style="max-width:200px; max-height:120px; display:none; border-radius:4px;" /></div>' +
      '<div style="margin-bottom:12px;"><label>推广链接</label><input type="text" id="modalAffiliateLinkInput" placeholder="https://s.click.taobao.com/xxx 或你的联盟链接" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" /></div>' +
      '<div style="text-align:right; margin-top:16px;">' +
        '<button class="btn danger" onclick="closeModal()" style="margin-right:8px;">取消</button>' +
        '<button class="btn" onclick="saveVideo()">保存</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  var script = [
    // ----- 模态框控制 -----
    'function showAddModal(userId, platformId) {',
      'document.getElementById("modalTitle").innerText = "添加视频";',
      'document.getElementById("modalVideoIdInput").value = "";',
      'document.getElementById("modalTitleInput").value = "";',
      'document.getElementById("modalImageUrlInput").value = "";',
      'document.getElementById("modalAffiliateLinkInput").value = "";',
      'document.getElementById("modalVideoId").value = "";',
      'document.getElementById("modalUserId").value = userId;',
      'document.getElementById("modalPlatformId").value = platformId;',
      'document.getElementById("modalVideoIdInput").style.display = "block";',
      'document.getElementById("previewImage").style.display = "none";',
      'document.getElementById("videoModal").style.display = "flex";',
    '}',
    'function showEditModal(userId, platformId, videoId, title, imageUrl, affiliateLink) {',
      'document.getElementById("modalTitle").innerText = "编辑视频";',
      'document.getElementById("modalVideoIdInput").value = videoId;',
      'document.getElementById("modalTitleInput").value = title;',
      'document.getElementById("modalImageUrlInput").value = imageUrl;',
      'document.getElementById("modalAffiliateLinkInput").value = affiliateLink;',
      'document.getElementById("modalVideoId").value = videoId;',
      'document.getElementById("modalUserId").value = userId;',
      'document.getElementById("modalPlatformId").value = platformId;',
      'document.getElementById("modalVideoIdInput").style.display = "none";',  // 编辑时不允许改ID
      'if (imageUrl) { document.getElementById("previewImage").src = imageUrl; document.getElementById("previewImage").style.display = "block"; }',
      'document.getElementById("videoModal").style.display = "flex";',
    '}',
    'function closeModal() {',
      'document.getElementById("videoModal").style.display = "none";',
    '}',
    // 图片预��
    'function previewImage() {',
      'var url = document.getElementById("modalImageUrlInput").value;',
      'if (url && url.startsWith("http")) {',
        'document.getElementById("previewImage").src = url;',
        'document.getElementById("previewImage").style.display = "block";',
      '} else {',
        'document.getElementById("previewImage").style.display = "none";',
      '}',
    '}',
    // 保存视频（添加或更新）
    'async function saveVideo() {',
      'var userId = document.getElementById("modalUserId").value;',
      'var platformId = document.getElementById("modalPlatformId").value;',
      'var videoId = document.getElementById("modalVideoIdInput").value.trim();',
      'var title = document.getElementById("modalTitleInput").value.trim();',
      'var imageUrl = document.getElementById("modalImageUrlInput").value.trim();',
      'var affiliateLink = document.getElementById("modalAffiliateLinkInput").value.trim();',
      'var editMode = !!document.getElementById("modalVideoId").value;',  // 判断是否为编辑模式
      'if (editMode) { videoId = document.getElementById("modalVideoId").value; }',  // 编辑时用原ID
      'if (!videoId || !title) { alert("视频ID和标题不能为空"); return; }',
      'var action = editMode ? "editVideo" : "addVideo";',
      'var res = await fetch("/admin", {',
        'method: "POST",',
        'headers: {"Content-Type": "application/json"},',
        'body: JSON.stringify({',
          'action: action,',
          'userId: userId,',
          'platformId: platformId,',
          'videoId: videoId,',
          'title: title,',
          'imageUrl: imageUrl || "",',
          'affiliateLink: affiliateLink || ""',
        '})',
      '});',
      'var data = await res.json();',
      'if (data.ok) { closeModal(); location.reload(); }',
      'else { alert(data.error); }',
    '}',
    // 已有的 deleteVideo 保持不变
    'async function deleteVideo(userId, platformId, videoId) {',
      'if (!confirm("确定删除视频 " + videoId + " ？")) return;',
      'var res = await fetch("/admin", {',
        'method: "POST",',
        'headers: {"Content-Type": "application/json"},',
        'body: JSON.stringify({ action: "deleteVideo", userId: userId, platformId: platformId, videoId: videoId })',
      '});',
      'var data = await res.json();',
      'if (data.ok) location.reload(); else alert(data.error);',
    '}',
    // 点击模态框外部关闭（可选）
    'document.getElementById("videoModal").addEventListener("click", function(e) {',
      'if (e.target === this) closeModal();',
    '});',
  ].join('\n');

  return adminPage(html, script);
}



// ========== 主入口 ==========
export async function onRequest(context) {
  var request = context.request;
  var env = context.env;
  var url = new URL(request.url);
  var method = request.method;

  // 验证管理员密码环境变量
  var adminPassword = env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return new Response(
      '请先在 Cloudflare 面板设置 ADMIN_PASSWORD 环境变量并重新部署',
      {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=UTF-8' }
      }
    );
  }

  var data;

  // ========== 处理 GET 请求 ==========
  if (method === 'GET') {

    // 退出登录
    if (url.searchParams.get('logout') === '1') {
      return new Response(
        '已退出登录。 <a href="/admin">返回登录</a>',
        {
          status: 200,
          headers: {
            'Set-Cookie': 'admin_token=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0',
            'Content-Type': 'text/html; charset=UTF-8'
          }
        }
      );
    }

    // 检查是否已登录
    var isAuth = await checkAuth(request.headers.get('Cookie'), adminPassword);
    if (!isAuth) {
      // 显示登录页
      return new Response(getLoginPage(), {
        headers: { 'Content-Type': 'text/html; charset=UTF-8' }
      });
    }

    // 已登录，根据路径渲染页面
    data = await getDataFromKV(env);
    var pathPart = url.searchParams.get('path') || '';
    var parts = pathPart.split('/');
    var scope = parts[0] || '';
    var userId = parts[1] || '';
    var subScope = parts[2] || '';
    var platformId = parts[3] || '';

    if (!scope) {
      // 用户列表首页
      return new Response(renderUserListHtml(data), {
        headers: { 'Content-Type': 'text/html; charset=UTF-8' }
      });
    } else if (scope === 'user' && userId && !subScope) {
      // 平台列表
      return new Response(renderPlatformListHtml(data, userId), {
        headers: { 'Content-Type': 'text/html; charset=UTF-8' }
      });
    } else if (scope === 'user' && userId && subScope === 'platform' && platformId) {
      // 视频列表
      return new Response(renderVideoListHtml(data, userId, platformId), {
        headers: { 'Content-Type': 'text/html; charset=UTF-8' }
      });
    }

    // 默认回退到用户列表
    return new Response(renderUserListHtml(data), {
      headers: { 'Content-Type': 'text/html; charset=UTF-8' }
    });
  }

  // ========== 处理 POST 请求 ==========
  if (method === 'POST') {

    // 先检查是否登录POST(密码验证)
    try {
      var body = await request.json();

      // 如果是密码登录请求
      if (body.password) {
        if (body.password === adminPassword) {
          var token = await sha256(adminPassword);
          return new Response('登录成功', {
            status: 200,
            headers: {
              'Set-Cookie': 'admin_token=' + token + '; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=86400',
              'Content-Type': 'text/plain'
            }
          });
        } else {
          return new Response('密码错误', { status: 401 });
        }
      }

      // 验证登录状态（其他API操作需要验证）
      var isAuth = await checkAuth(request.headers.get('Cookie'), adminPassword);
      if (!isAuth) {
        return new Response('未授权', { status: 401 });
      }

      // 读取数据
      data = await getDataFromKV(env);
      if (!data.accounts) data.accounts = {};

      var action = body.action;

      // ----- 用户操作 -----
      if (action === 'addUser') {
        if (!body.userId || !body.displayName) throw new Error('缺少 userId 或 displayName');
        if (data.accounts[body.userId]) throw new Error('用户已存在');
        data.accounts[body.userId] = { displayName: body.displayName, platforms: {} };
        await saveDataToKV(env, data);
        return jsonResponse({ ok: true });
      }

      if (action === 'deleteUser') {
        if (!data.accounts[body.userId]) throw new Error('用户不存在');
        delete data.accounts[body.userId];
        await saveDataToKV(env, data);
        return jsonResponse({ ok: true });
      }

      // ----- 平台操作 -----
      if (action === 'addPlatform') {
        if (!body.userId || !body.platformId || !body.displayName) throw new Error('缺少参数');
        if (!data.accounts[body.userId]) throw new Error('用户不存在');
        if (data.accounts[body.userId].platforms[body.platformId]) throw new Error('平台已存在');
        data.accounts[body.userId].platforms[body.platformId] = { displayName: body.displayName, videos: {} };
        await saveDataToKV(env, data);
        return jsonResponse({ ok: true });
      }

      if (action === 'deletePlatform') {
        if (!data.accounts[body.userId] || !data.accounts[body.userId].platforms[body.platformId]) throw new Error('平台不存在');
        delete data.accounts[body.userId].platforms[body.platformId];
        await saveDataToKV(env, data);
        return jsonResponse({ ok: true });
      }

      // ----- 视频操作 -----
      if (action === 'addVideo') {
        if (!body.userId || !body.platformId || !body.videoId || !body.title || !body.imageUrl || !body.affiliateLink) {
          throw new Error('缺少参数');
        }
        if (!data.accounts[body.userId] || !data.accounts[body.userId].platforms[body.platformId]) {
          throw new Error('平台不存在');
        }
        if (data.accounts[body.userId].platforms[body.platformId].videos[body.videoId]) {
          throw new Error('视频ID已存在');
        }
        data.accounts[body.userId].platforms[body.platformId].videos[body.videoId] = {
          title: body.title,
          imageUrl: body.imageUrl,
          affiliateLink: body.affiliateLink
        };
        await saveDataToKV(env, data);
        return jsonResponse({ ok: true });
      }

      if (action === 'editVideo') {
        if (!data.accounts[body.userId] || !data.accounts[body.userId].platforms[body.platformId] ||
            !data.accounts[body.userId].platforms[body.platformId].videos[body.videoId]) {
          throw new Error('视频不存在');
        }
        data.accounts[body.userId].platforms[body.platformId].videos[body.videoId] = {
          title: body.title,
          imageUrl: body.imageUrl,
          affiliateLink: body.affiliateLink
        };
        await saveDataToKV(env, data);
        return jsonResponse({ ok: true });
      }

      if (action === 'deleteVideo') {
        if (!data.accounts[body.userId] || !data.accounts[body.userId].platforms[body.platformId] ||
            !data.accounts[body.userId].platforms[body.platformId].videos[body.videoId]) {
          throw new Error('视频不存在');
        }
        delete data.accounts[body.userId].platforms[body.platformId].videos[body.videoId];
        await saveDataToKV(env, data);
        return jsonResponse({ ok: true });
      }

      return jsonResponse({ error: '未知操作' }, 400);

    } catch (e) {
      return jsonResponse({ error: e.message || '操作失败' }, 500);
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
