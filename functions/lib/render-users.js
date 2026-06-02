// functions/lib/render-users.js

import { escapeHtml, escapeJsStr } from './helpers.js';
import { adminPage } from './page.js';

export function renderUserListHtml(data) {
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
        '<h3>' + escapeHtml(acc.displayName) + ' <small>(' + escapeHtml(id) + ')</small></h3>' +
        '<a href="/admin?path=user/' + encodeURIComponent(id) + '" class="btn">管理平台</a>' +
        '<button class="btn danger" onclick="deleteUser(\'' + escapeJsStr(id) + '\')">删除</button>' +
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
