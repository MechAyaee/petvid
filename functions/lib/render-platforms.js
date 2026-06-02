// functions/lib/render-platforms.js

import { escapeHtml, escapeJsStr } from './helpers.js';
import { adminPage } from './page.js';

export function renderPlatformListHtml(data, userId) {
  var user = data.accounts[userId];
  if (!user) return renderUserListHtml(data);

  var html = '<h2>' + escapeHtml(user.displayName) + ' 的平台</h2>' +
    '<div class="breadcrumb"><a href="/admin">← 返回用户列表</a></div>' +
    '<div class="toolbar">' +
      '<input type="text" id="newPlatformId" placeholder="平台ID (如 tube)" />' +
      '<input type="text" id="newPlatformDisplayName" placeholder="平台名称" />' +
      '<button class="btn" onclick="addPlatform(\'' + escapeJsStr(userId) + '\')">添加平台</button>' +
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
        '<h3>' + escapeHtml(plat.displayName) + ' <small>(' + escapeHtml(id) + ')</small></h3>' +
        '<a href="/admin?path=user/' + encodeURIComponent(userId) + '/platform/' + encodeURIComponent(id) + '" class="btn">管理视频</a>' +
        '<button class="btn danger" onclick="deletePlatform(\'' + escapeJsStr(userId) + '\',\'' + escapeJsStr(id) + '\')">删除</button>' +
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
