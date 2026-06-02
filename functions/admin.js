// functions/admin.js
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 检查环境变量
  const adminPassword = env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return new Response('请先在 Cloudflare 面板设置 ADMIN_PASSWORD 环境变量并重新部署', {
      status: 500,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
    });
  }

  // 获取请求方法
  const method = request.method;
  
  // ===== POST：处理登录 =====
  if (method === 'POST') {
    try {
      const body = await request.json();
      const { password } = body;
      
      if (password === adminPassword) {
        const token = await sha256(adminPassword);
        return new Response('登录成功', {
          status: 200,
          headers: {
            'Set-Cookie': `admin_token=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=86400`,
            'Content-Type': 'text/plain'
          }
        });
      } else {
        return new Response('密码错误', { status: 401 });
      }
    } catch (e) {
      return new Response('请求格式错误', { status: 400 });
    }
  }

  // ===== GET：显示页面 =====
  // 检查是否已登录
  const cookie = request.headers.get('Cookie') || '';
  const isLoggedIn = await checkLogin(cookie, adminPassword);

  if (isLoggedIn) {
    return new Response('<h1>管理面板（稍后实现）</h1><a href="/admin?logout=1">退出登录</a>', {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
  }

  // 从 URL 参数判断是否退出登录
  if (url.searchParams.get('logout') === '1') {
    return new Response('已退出登录', {
      status: 200,
      headers: {
        'Set-Cookie': 'admin_token=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0',
        'Content-Type': 'text/html;charset=UTF-8'
      }
    });
  }

  // 显示登录页
  return new Response(getLoginPage(), {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' }
  });
}

async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkLogin(cookie, adminPassword) {
  if (!cookie) return false;
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
        // 注意：直接 POST 到 /admin（同一个 URL），通过 method 区分
        const res = await fetch('/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
