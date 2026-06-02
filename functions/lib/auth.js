// functions/lib/auth.js

import { sha256 } from './helpers.js';

export async function checkAuth(cookie, adminPassword) {
  if (!cookie) return false;
  var match = cookie.match(/admin_token=([^;]+)/);
  if (!match) return false;
  var expected = await sha256(adminPassword);
  return match[1] === expected;
}

export function getLoginPage() {
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
