// functions/lib/render-videos.js

import { escapeHtml, escapeHtmlAttr, escapeJsStr } from './helpers.js';
import { adminPage } from './page.js';

export function renderVideoListHtml(data, userId, platformId) {
  var user = data.accounts[userId];
  if (!user) return renderUserListHtml(data);
  var platform = user.platforms[platformId];
  if (!platform) return renderPlatformListHtml(data, userId);

  var html = '<h2>' + escapeHtml(platform.displayName) + ' 的视频</h2>' +
    '<div class="breadcrumb">' +
      '<a href="/admin">用户列表</a> &gt; ' +
      '<a href="/admin?path=user/' + encodeURIComponent(userId) + '">' + escapeHtml(user.displayName) + '</a>' +
    '</div>' +
    '<div class="toolbar">' +
      '<button class="btn" onclick="showAddModal(\'' + escapeJsStr(userId) + '\',\'' + escapeJsStr(platformId) + '\')">+ 添加视频</button>' +
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
      var imgHtml = (vid.imageUrl) ? '<img src="' + escapeHtmlAttr(vid.imageUrl) + '" alt="' + escapeHtmlAttr(vid.title) + '" style="max-width:160px; border-radius:4px; margin:8px 0;" />' : '<p style="color:#999;">未设置图片</p>';
      var linkHtml = (vid.affiliateLink) ? '<a href="' + escapeHtmlAttr(vid.affiliateLink) + '" target="_blank" style="word-break:break-all;">' + escapeHtml(vid.affiliateLink) + '</a>' : '<span style="color:#999;">未设置推广链接</span>';

      var safeTitle = escapeJsStr(vid.title);
      var safeImageUrl = escapeJsStr(vid.imageUrl || '');
      var safeAffiliateLink = escapeJsStr(vid.affiliateLink || '');
      var safeId = escapeHtmlAttr(id);

      html += '<div class="card video-card" data-video-id="' + safeId + '">' +
        '<h3>' + escapeHtml(vid.title) + ' <small>(' + escapeHtml(id) + ')</small></h3>' +
        imgHtml +
        '<p><strong>推广链接：</strong>' + linkHtml + '</p>' +
        '<div class="btn-group">' +
          '<button class="btn" onclick="showEditModal(\'' + escapeJsStr(userId) + '\',\'' + escapeJsStr(platformId) + '\',\'' + safeId + '\',\'' + safeTitle + '\',\'' + safeImageUrl + '\',\'' + safeAffiliateLink + '\')">编辑</button>' +
          '<button class="btn danger" onclick="deleteVideo(\'' + escapeJsStr(userId) + '\',\'' + escapeJsStr(platformId) + '\',\'' + safeId + '\')">删除</button>' +
        '</div>' +
      '</div>';
    }
  }

  html += '</div>';

  // 模态框
  html += '<div id="videoModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; justify-content:center; align-items:center;">' +
    '<div style="background:white; border-radius:8px; padding:24px; max-width:500px; width:90%; box-shadow:0 4px 12px rgba(0,0,0,0.2);">' +
      '<h3 id="modalTitle">添加视频</h3>' +
      '<input type="hidden" id="modalOldVideoId" />' +   
      '<input type="hidden" id="modalUserId" />' +
      '<input type="hidden" id="modalPlatformId" />' +
      '<div style="margin-bottom:12px;"><label>视频ID</label><input type="text" id="modalVideoIdInput" placeholder="如 V001" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" /></div>' +
      '<div style="margin-bottom:12px;"><label>标题</label><input type="text" id="modalTitleInput" placeholder="请输入视频标题" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" /></div>' +
      '<div style="margin-bottom:12px;"><label>图片URL <span style="color:#999;">(可选)</span></label><input type="text" id="modalImageUrlInput" placeholder="https://example.com/thumbnail.jpg 或留空" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" oninput="previewImage()" /></div>' +
      '<div style="margin-bottom:12px;" id="previewContainer"><img id="previewImage" style="max-width:200px; max-height:120px; display:none; border-radius:4px;" /></div>' +
      '<div style="margin-bottom:12px;"><label>推广链接 <span style="color:#999;">(可选)</span></label><input type="text" id="modalAffiliateLinkInput" placeholder="https://s.click.taobao.com/xxx 或留空" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" /></div>' +
      '<div style="text-align:right; margin-top:16px;">' +
        '<button class="btn danger" onclick="closeModal()" style="margin-right:8px;">取消</button>' +
        '<button class="btn" onclick="saveVideo()">保存</button>' +
      '</div>' +
    '</div>' +
  '</div>';

  var script = [
    'function showAddModal(userId, platformId) {',
      'document.getElementById("modalTitle").innerText = "添加视频";',
      'document.getElementById("modalVideoIdInput").value = "";',
      'document.getElementById("modalTitleInput").value = "";',
      'document.getElementById("modalImageUrlInput").value = "";',
      'document.getElementById("modalAffiliateLinkInput").value = "https://s.click.taobao.com/xxx";',
      'document.getElementById("modalOldVideoId").value = "";',
      'document.getElementById("modalUserId").value = userId;',
      'document.getElementById("modalPlatformId").value = platformId;',
      'document.getElementById("previewImage").style.display = "none";',
      'document.getElementById("videoModal").style.display = "flex";',
    '}',
    'function showEditModal(userId, platformId, videoId, title, imageUrl, affiliateLink) {',
      'document.getElementById("modalTitle").innerText = "编辑视频";',
      'document.getElementById("modalVideoIdInput").value = videoId;',
      'document.getElementById("modalTitleInput").value = title;',
      'document.getElementById("modalImageUrlInput").value = imageUrl;',
      'document.getElementById("modalAffiliateLinkInput").value = affiliateLink;',
      'document.getElementById("modalOldVideoId").value = videoId;',
      'document.getElementById("modalUserId").value = userId;',
      'document.getElementById("modalPlatformId").value = platformId;',
      'if (imageUrl) { document.getElementById("previewImage").src = imageUrl; document.getElementById("previewImage").style.display = "block"; }',
      'document.getElementById("videoModal").style.display = "flex";',
    '}',
    'function closeModal() {',
      'document.getElementById("videoModal").style.display = "none";',
    '}',
    'function previewImage() {',
      'var url = document.getElementById("modalImageUrlInput").value;',
      'if (url && url.startsWith("http")) {',
        'document.getElementById("previewImage").src = url;',
        'document.getElementById("previewImage").style.display = "block";',
      '} else {',
        'document.getElementById("previewImage").style.display = "none";',
      '}',
    '}',
    'async function saveVideo() {',
      'var userId = document.getElementById("modalUserId").value;',
      'var platformId = document.getElementById("modalPlatformId").value;',
      'var oldVideoId = document.getElementById("modalOldVideoId").value;',
      'var newVideoId = document.getElementById("modalVideoIdInput").value.trim();',
      'var title = document.getElementById("modalTitleInput").value.trim();',
      'var imageUrl = document.getElementById("modalImageUrlInput").value.trim();',
      'var affiliateLink = document.getElementById("modalAffiliateLinkInput").value.trim();',
      'if (!newVideoId || !title) { alert("视频ID和标题不能为空"); return; }',
      'var action = oldVideoId ? "editVideo" : "addVideo";',
      'var res = await fetch("/admin", {',
        'method: "POST",',
        'headers: {"Content-Type": "application/json"},',
        'body: JSON.stringify({',
          'action: action,',
          'userId: userId,',
          'platformId: platformId,',
          'oldVideoId: oldVideoId,',
          'newVideoId: newVideoId,',
          'title: title,',
          'imageUrl: imageUrl,',
          'affiliateLink: affiliateLink',
        '})',
      '});',
      'var data = await res.json();',
      'if (data.ok) { closeModal(); location.reload(); }',
      'else { alert(data.error); }',
    '}',
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
    'window.addEventListener("DOMContentLoaded", function() {',
      'var modalInputs = document.querySelectorAll("#videoModal input");',
      'for (var i = 0; i < modalInputs.length; i++) {',
        'modalInputs[i].addEventListener("keypress", function(e) {',
          'if (e.key === "Enter") { e.preventDefault(); saveVideo(); }',
        '});',
      '}',
    '});',
  ].join('\n');

  return adminPage(html, script);
}
