// functions/admin.js
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/admin', '') || '/';

  // 获取管理员密码（从环境变量）
  const adminPassword = env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return new Response('错误：未设置 ADMIN_PASSWORD 环境变量，请在 Cloudflare Pages 设置。', {
      status: 500,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
  }

  // 已登录标记：检查 cookie
  const cookie = request.headers.get('Cookie') || '';
  const isLoggedIn = await checkLogin(cookie, adminPassword);

  // 处理不同路径
  if (path === '/' || path === '') {
    // GET /admin 或 /admin/
    if (isLoggedIn) {
      // 已登录：返回管理面板占位页面（后续替换为真正的管理 UI）
      return new Response('<h1>管理面板（稍后实现）</h1><a href="/admin/logout">退出登录</a>', {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
      });
    } else {
      // 未登录：显示登录页面
      return new Response(getLoginPage(), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
      });
    }
  }

  // 处理登录 API
  if (path === '/api/login' && request.method === 'POST') {
    const body = await request.json();
    const { password } = body;
    if (password === adminPassword) {
      // 登录成功：设置 cookie（密码的 sha256 作为令牌）
      const token = await sha256(adminPassword);
      return new Response('OK', {
        status: 200,
        headers: {
          'Set-Cookie': `admin_token=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=86400`,
          'Content-Type': 'text/plain'
        }
      });
    } else {
      return new Response('密码错误', { status: 401 });
    }
  }

  // 其它管理 API（稍后实现），需要登录认证
  if (path.startsWith('/api/')) {
    if (!isLoggedIn) {
      return new Response('未授权', { status: 401 });
    }
    // 目前所有 API 返回占位响应
    return new Response('API 占位', { status: 200 });
  }

  // 其他路径（如 /admin/logout）
  if (path === '/logout') {
    // 清除 cookie
    return new Response('已退出登录', {
      status: 200,
      headers: {
        'Set-Cookie': 'admin_token=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0',
        'Content-Type': 'text/html;charset=UTF-8'
      }
    });
  }

  return new Response('Not Found', { status: 404 });
}

// 辅助函数
async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkLogin(cookie, adminPassword) {
  if (!cookie) return false;
  // 从 cookie 中提取 admin_token
  const match = cookie.match(/admin_token=([^;]+)/);
  if (!match) return false;
  const token = match[1];
  const expectedToken = await sha256(adminPassword);
  return token === expectedToken;
}

function getLoginPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理员登录</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
    .login-box { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 300px; }
    h2 { margin-top: 0; text-align: center; }
    input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    button { width: 100%; padding: 10px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #005fa3; }
    .error { color: red; text-align: center; margin-top: 10px; display: none; }
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
        const res = await fetch('/admin/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        if (res.ok) {
          // 登录成功，刷新页面（此时 cookie 已设置）
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
    // 按回车触发登录
    document.getElementById('password').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') document.getElementById('loginBtn').click();
    });
  </script>
</body>
</html>`;
}
