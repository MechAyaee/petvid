// functions/lib/render-admin.js

import { escapeHtml, escapeHtmlAttr, escapeJsStr, generateVideoId } from './helpers.js';
import { adminPage } from './page.js';

/**
 * 统一渲染管理页面（用户列表 / 平台列表 / 视频列表 / 回收站）
 * @param {object} data - 完整数据
 * @param {string|null} userId - 如果为 null 则渲染用户列表
 * @param {string|null} platformId - 如果为 null 且 userId 不为空则渲染平台列表
 * @param {boolean} showRecycle - 是否显示回收站视图
 */
export function renderAdminHtml(data, userId, platformId, showRecycle) {
  // 无用户ID -> 用户列表
  if (!userId) {
    return renderUserList(data);
  }

  const user = data.accounts[userId];
  if (!user) return renderUserList(data);

  // 有用户ID但无平台ID -> 平台列表
  if (!platformId) {
    return renderPlatformList(data, userId);
  }

  const platform = user.platforms[platformId];
  if (!platform) return renderPlatformList(data, userId);

  // 有用户ID和平台ID -> 视频列表或回收站
  if (showRecycle) {
    return renderRecycleBin(data, userId, platformId);
  }
  return renderVideoList(data, userId, platformId);
}

// ==================== 内部分段渲染函数 ====================

function renderUserList(data) {
  const html = `
    <h2>用户列表</h2>
    <div class="toolbar">
      <button class="btn" onclick="showAddUserModal()">+ 添加用户</button>
    </div>
    <div class="card-grid">
      ${Object.keys(data.accounts || {}).length === 0
        ? '<p>暂无用户</p>'
        : Object.entries(data.accounts).map(([uid, u]) => `
          <div class="card">
            <h3><a href="/admin/${encodeURIComponent(uid)}">${escapeHtml(u.displayName)}</a></h3>
            <p>ID: ${escapeHtml(uid)}</p>
            <p>平台数: ${Object.keys(u.platforms || {}).length}</p>
            <button class="btn danger" onclick="deleteUser('${escapeJsStr(uid)}','${escapeJsStr(u.displayName)}')">删除</button>
          </div>
        `).join('')}
    </div>
    <!-- 添加用户模态框 -->
    ${addUserModal()}
  `;

  const script = `
    async function deleteUser(uid, name) {
      if (!confirm('确定删除用户「' + name + '」？')) return;
      const res = await fetch('/admin', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action:'deleteUser', userId: uid})
      });
      if (res.ok) location.reload(); else alert((await res.json()).error);
    }
    function showAddUserModal() { document.getElementById('addUserModal').style.display='flex'; }
    function closeAddUserModal() { document.getElementById('addUserModal').style.display='none'; }
    async function saveUser() {
      const uid = document.getElementById('newUserId').value.trim();
      const name = document.getElementById('newUserDisplayName').value.trim();
      if (!uid || !name) { alert('用户ID和显示名称不能为空'); return; }
      const res = await fetch('/admin', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action:'addUser', userId: uid, displayName: name})
      });
      if (res.ok) { closeAddUserModal(); location.reload(); }
      else alert((await res.json()).error);
    }
  `;
  return adminPage(html, script);
}

function renderPlatformList(data, userId) {
  const user = data.accounts[userId];
  const platforms = user.platforms || {};
  const html = `
    <h2>${escapeHtml(user.displayName)} 的平台</h2>
    <div class="breadcrumb">
      <a href="/admin">用户列表</a> &gt; ${escapeHtml(user.displayName)}
    </div>
    <div class="toolbar">
      <button class="btn" onclick="showAddPlatformModal()">+ 添加平台</button>
    </div>
    <div class="card-grid">
      ${Object.keys(platforms).length === 0
        ? '<p>暂无平台</p>'
        : Object.entries(platforms).map(([pid, p]) => `
          <div class="card">
            <h3><a href="/admin/${encodeURIComponent(userId)}/${encodeURIComponent(pid)}">${escapeHtml(p.displayName)}</a></h3>
            <p>视频数: ${Object.keys(p.videos || {}).filter(vid => !p.videos[vid].deleted).length}</p>
            <button class="btn danger" onclick="deletePlatform('${escapeJsStr(userId)}','${escapeJsStr(pid)}','${escapeJsStr(p.displayName)}')">删除</button>
          </div>
        `).join('')}
    </div>
    <!-- 添加平台模态框 -->
    ${addPlatformModal()}
  `;

  const script = `
    async function deletePlatform(uid, pid, name) {
      if (!confirm('确定删除平台「' + name + '」？')) return;
      const res = await fetch('/admin', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action:'deletePlatform', userId: uid, platformId: pid})
      });
      if (res.ok) location.reload(); else alert((await res.json()).error);
    }
    function showAddPlatformModal() { document.getElementById('addPlatformModal').style.display='flex'; }
    function closeAddPlatformModal() { document.getElementById('addPlatformModal').style.display='none'; }
    async function savePlatform() {
      const uid = '${escapeJsStr(userId)}';
      const pid = document.getElementById('newPlatformId').value.trim();
      const name = document.getElementById('newPlatformDisplayName').value.trim();
      if (!pid || !name) { alert('平台ID和显示名称不能为空'); return; }
      const res = await fetch('/admin', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action:'addPlatform', userId: uid, platformId: pid, displayName: name})
      });
      if (res.ok) { closeAddPlatformModal(); location.reload(); }
      else alert((await res.json()).error);
    }
  `;
  return adminPage(html, script);
}

function renderVideoList(data, userId, platformId) {
  const user = data.accounts[userId];
  const platform = user.platforms[platformId];
  const videos = platform.videos || {};
  const activeVideos = Object.fromEntries(Object.entries(videos).filter(([,v]) => !v.deleted));

  const html = `
    <h2>${escapeHtml(platform.displayName)} 的视频</h2>
    <div class="breadcrumb">
      <a href="/admin">用户列表</a> &gt;
      <a href="/admin/${encodeURIComponent(userId)}">${escapeHtml(user.displayName)}</a> &gt;
      ${escapeHtml(platform.displayName)}
    </div>
    <div class="toolbar">
      <button class="btn" onclick="showAddVideoModal()">+ 添加视频</button>
      <button class="btn" onclick="window.location='/admin/${encodeURIComponent(userId)}/${encodeURIComponent(platformId)}/recycle'">回收站 (${Object.values(videos).filter(v=>v.deleted).length})</button>
    </div>
    <div class="card-grid">
      ${Object.keys(activeVideos).length === 0
        ? '<p>暂无视频，点击上方按钮添加</p>'
        : Object.entries(activeVideos).map(([vid, v]) => videoCard(vid, v, userId, platformId, false)).join('')}
    </div>
    <!-- 添加视频模态框（去掉视频ID输入） -->
    ${videoModal(false)}
  `;

  const script = `
    function showAddVideoModal() {
      document.getElementById('modalTitle').innerText = '添加视频';
      document.getElementById('modalVideoId').value = '';  // 隐藏字段，前端不再需要
      document.getElementById('modalTitleInput').value = '';
      document.getElementById('modalImageUrlInput').value = '';
      document.getElementById('modalAffiliateLinkInput').value = 'https://s.click.taobao.com/xxx';
      document.getElementById('previewImage').style.display = 'none';
      document.getElementById('videoModal').style.display = 'flex';
    }
    function showEditVideoModal(vid, title, imageUrl, affiliateLink) {
      document.getElementById('modalTitle').innerText = '编辑视频';
      document.getElementById('modalVideoId').value = vid;
      document.getElementById('modalTitleInput').value = title;
      document.getElementById('modalImageUrlInput').value = imageUrl || '';
      document.getElementById('modalAffiliateLinkInput').value = affiliateLink || '';
      if (imageUrl) { document.getElementById('previewImage').src = imageUrl; document.getElementById('previewImage').style.display = 'block'; }
      document.getElementById('videoModal').style.display = 'flex';
    }
    function closeModal() { document.getElementById('videoModal').style.display = 'none'; }
    function previewImage() {
      const url = document.getElementById('modalImageUrlInput').value;
      const img = document.getElementById('previewImage');
      if (url && url.startsWith('http')) { img.src = url; img.style.display = 'block'; } else img.style.display = 'none';
    }
    async function saveVideo() {
      const action = document.getElementById('modalVideoId').value ? 'updateVideo' : 'addVideo';
      const videoId = document.getElementById('modalVideoId').value;
      const title = document.getElementById('modalTitleInput').value.trim();
      const imageUrl = document.getElementById('modalImageUrlInput').value.trim();
      const affiliateLink = document.getElementById('modalAffiliateLinkInput').value.trim();
      if (!title) { alert('标题不能为空'); return; }
      const body = {
        action,
        userId: '${escapeJsStr(userId)}',
        platformId: '${escapeJsStr(platformId)}',
        videoId,  // 仅update时有效
        title,
        imageUrl,
        affiliateLink
      };
      const res = await fetch('/admin', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
      });
      if (res.ok) { closeModal(); location.reload(); }
      else alert((await res.json()).error || '操作失败');
    }
    async function deleteVideo(vid) {
      if (!confirm('确定将视频移入回收站？')) return;
      const res = await fetch('/admin', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action:'deleteVideo', userId: '${escapeJsStr(userId)}', platformId: '${escapeJsStr(platformId)}', videoId: vid})
      });
      if (res.ok) location.reload(); else alert((await res.json()).error);
    }
  `;
  return adminPage(html, script);
}

function renderRecycleBin(data, userId, platformId) {
  const user = data.accounts[userId];
  const platform = user.platforms[platformId];
  const videos = platform.videos || {};
  const deletedVideos = Object.fromEntries(Object.entries(videos).filter(([,v]) => v.deleted));

  const html = `
    <h2>回收站 - ${escapeHtml(platform.displayName)}</h2>
    <div class="breadcrumb">
      <a href="/admin">用户列表</a> &gt;
      <a href="/admin/${encodeURIComponent(userId)}">${escapeHtml(user.displayName)}</a> &gt;
      <a href="/admin/${encodeURIComponent(userId)}/${encodeURIComponent(platformId)}">${escapeHtml(platform.displayName)}</a> &gt;
      回收站
    </div>
    <div class="toolbar">
      <a class="btn" href="/admin/${encodeURIComponent(userId)}/${encodeURIComponent(platformId)}">← 返回视频列表</a>
    </div>
    <div class="card-grid">
      ${Object.keys(deletedVideos).length === 0
        ? '<p>回收站为空</p>'
        : Object.entries(deletedVideos).map(([vid, v]) => `
          <div class="card" style="opacity:0.7;">
            <h3>${escapeHtml(v.title)} <small>(${escapeHtml(vid)})</small></h3>
            <p>删除时间: ${v.deletedAt ? new Date(v.deletedAt).toLocaleString() : '未知'}</p>
            <div class="btn-group">
              <button class="btn" onclick="restoreVideo('${escapeJsStr(vid)}')">恢复</button>
              <button class="btn danger" onclick="permanentDelete('${escapeJsStr(vid)}','${escapeJsStr(v.title)}')">永久删除</button>
            </div>
          </div>
        `).join('')}
    </div>
  `;

  const script = `
    async function restoreVideo(vid) {
      const res = await fetch('/admin', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action:'restoreVideo', userId: '${escapeJsStr(userId)}', platformId: '${escapeJsStr(platformId)}', videoId: vid})
      });
      if (res.ok) location.reload(); else alert((await res.json()).error);
    }
    async function permanentDelete(vid, title) {
      if (!confirm('确定永久删除视频「' + title + '」？此操作不可恢复！')) return;
      const res = await fetch('/admin', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action:'permanentDeleteVideo', userId: '${escapeJsStr(userId)}', platformId: '${escapeJsStr(platformId)}', videoId: vid})
      });
      if (res.ok) location.reload(); else alert((await res.json()).error);
    }
  `;
  return adminPage(html, script);
}

// ==================== 通用组件 ====================

function videoCard(vid, v, userId, platformId, deleted) {
  const imgHtml = v.imageUrl
    ? `<img src="${escapeHtmlAttr(v.imageUrl)}" alt="${escapeHtmlAttr(v.title)}" style="max-width:160px; border-radius:4px; margin:8px 0;" />`
    : '<p style="color:#999;">未设置图片</p>';
  const linkHtml = v.affiliateLink
    ? `<a href="${escapeHtmlAttr(v.affiliateLink)}" target="_blank" style="word-break:break-all;">${escapeHtml(v.affiliateLink)}</a>`
    : '<span style="color:#999;">未设置推广链接</span>';

  const actions = deleted
    ? ''
    : `<div class="btn-group">
        <button class="btn" onclick="showEditVideoModal('${escapeJsStr(vid)}','${escapeJsStr(v.title)}','${escapeJsStr(v.imageUrl||'')}','${escapeJsStr(v.affiliateLink||'')}')">编辑</button>
        <button class="btn danger" onclick="deleteVideo('${escapeJsStr(vid)}')">移入回收站</button>
       </div>`;

  return `
    <div class="card video-card">
      <h3>${escapeHtml(v.title)} <small>(${escapeHtml(vid)})</small></h3>
      ${imgHtml}
      <p><strong>推广链接：</strong>${linkHtml}</p>
      ${actions}
    </div>
  `;
}

function videoModal() {
  return `
    <div id="videoModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; justify-content:center; align-items:center;">
      <div style="background:white; border-radius:8px; padding:24px; max-width:500px; width:90%; box-shadow:0 4px 12px rgba(0,0,0,0.2);">
        <h3 id="modalTitle">添加视频</h3>
        <input type="hidden" id="modalVideoId" />
        <div style="margin-bottom:12px;"><label>标题</label><input type="text" id="modalTitleInput" placeholder="请输入视频标题" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" /></div>
        <div style="margin-bottom:12px;"><label>图片URL <span style="color:#999;">(可选)</span></label><input type="text" id="modalImageUrlInput" placeholder="https://example.com/thumbnail.jpg" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" oninput="previewImage()" /></div>
        <div style="margin-bottom:12px;" id="previewContainer"><img id="previewImage" style="max-width:200px; max-height:120px; display:none; border-radius:4px;" /></div>
        <div style="margin-bottom:12px;"><label>推广链接 <span style="color:#999;">(可选)</span></label><input type="text" id="modalAffiliateLinkInput" placeholder="https://s.click.taobao.com/xxx" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" /></div>
        <div style="text-align:right; margin-top:16px;">
          <button class="btn danger" onclick="closeModal()" style="margin-right:8px;">取消</button>
          <button class="btn" onclick="saveVideo()">保存</button>
        </div>
      </div>
    </div>
  `;
}

function addUserModal() {
  return `
    <div id="addUserModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; justify-content:center; align-items:center;">
      <div style="background:white; border-radius:8px; padding:24px; max-width:400px; width:90%;">
        <h3>添加用户</h3>
        <input type="text" id="newUserId" placeholder="用户ID（如 zhangsan）" style="width:100%; padding:8px; margin:8px 0; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" />
        <input type="text" id="newUserDisplayName" placeholder="显示名称" style="width:100%; padding:8px; margin:8px 0; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" />
        <div style="text-align:right; margin-top:16px;">
          <button class="btn danger" onclick="closeAddUserModal()" style="margin-right:8px;">取消</button>
          <button class="btn" onclick="saveUser()">保存</button>
        </div>
      </div>
    </div>
  `;
}

function addPlatformModal() {
  return `
    <div id="addPlatformModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; justify-content:center; align-items:center;">
      <div style="background:white; border-radius:8px; padding:24px; max-width:400px; width:90%;">
        <h3>添加平台</h3>
        <input type="text" id="newPlatformId" placeholder="平台ID（如 xiaohongshu）" style="width:100%; padding:8px; margin:8px 0; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" />
        <input type="text" id="newPlatformDisplayName" placeholder="显示名称" style="width:100%; padding:8px; margin:8px 0; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" />
        <div style="text-align:right; margin-top:16px;">
          <button class="btn danger" onclick="closeAddPlatformModal()" style="margin-right:8px;">取消</button>
          <button class="btn" onclick="savePlatform()">保存</button>
        </div>
      </div>
    </div>
  `;
}


