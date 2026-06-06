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
            <button class="btn" onclick="showEditUserModal('${escapeJsStr(uid)}','${escapeJsStr(u.displayName)}')">编辑</button>
            <button class="btn danger" onclick="deleteUser('${escapeJsStr(uid)}','${escapeJsStr(u.displayName)}')">删除</button>
          </div>
        `).join('')}
    </div>
    <!-- 添加用户模态框 -->
    ${addUserModal()}
    <!-- 编辑用户模态框 -->
    ${editUserModal()}
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
    function showEditUserModal(uid, name) {
      document.getElementById('editUserId').value = uid;
      document.getElementById('editUserIdDisplay').textContent = uid;
      document.getElementById('editUserDisplayName').value = name;
      document.getElementById('editUserModal').style.display = 'flex';
    }
    function closeEditUserModal() { document.getElementById('editUserModal').style.display = 'none'; }
    async function saveEditUser() {
      const uid = document.getElementById('editUserId').value;
      const name = document.getElementById('editUserDisplayName').value.trim();
      if (!name) { alert('显示名称不能为空'); return; }
      const res = await fetch('/admin', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action:'updateUser', userId: uid, displayName: name})
      });
      if (res.ok) { closeEditUserModal(); location.reload(); }
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
            <button class="btn" onclick="showEditPlatformModal('${escapeJsStr(pid)}','${escapeJsStr(p.displayName)}')">编辑</button>
            <button class="btn danger" onclick="deletePlatform('${escapeJsStr(userId)}','${escapeJsStr(pid)}','${escapeJsStr(p.displayName)}')">删除</button>
          </div>
        `).join('')}
    </div>
    <!-- 添加平台模态框 -->
    ${addPlatformModal()}
    <!-- 编辑平台模态框 -->
    ${editPlatformModal()}
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
    function showEditPlatformModal(pid, name) {
      document.getElementById('editPlatformId').value = pid;
      document.getElementById('editPlatformIdDisplay').textContent = pid;
      document.getElementById('editPlatformDisplayName').value = name;
      document.getElementById('editPlatformModal').style.display = 'flex';
    }
    function closeEditPlatformModal() { document.getElementById('editPlatformModal').style.display = 'none'; }
    async function saveEditPlatform() {
      const uid = '${escapeJsStr(userId)}';
      const pid = document.getElementById('editPlatformId').value;
      const name = document.getElementById('editPlatformDisplayName').value.trim();
      if (!name) { alert('显示名称不能为空'); return; }
      const res = await fetch('/admin', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action:'updatePlatform', userId: uid, platformId: pid, displayName: name})
      });
      if (res.ok) { closeEditPlatformModal(); location.reload(); }
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
      <span style="margin-left:12px; display:inline-flex; align-items:center; gap:4px;">
        <span style="font-size:13px; color:#666;">占位图:</span>
        <button class="btn placeholder-btn" data-mode="kitten" onclick="setPlaceholderMode('kitten')" style="padding:4px 8px; font-size:13px;">🐱</button>
        <button class="btn placeholder-btn" data-mode="dog" onclick="setPlaceholderMode('dog')" style="padding:4px 8px; font-size:13px;">🐶</button>
        <button class="btn placeholder-btn" data-mode="random" onclick="setPlaceholderMode('random')" style="padding:4px 8px; font-size:13px;">🎲</button>
      </span>
      <button class="btn" onclick="showExportModal()" style="margin-left:auto;">导出选中</button>
      <button class="btn" onclick="exportAll()" style="margin-left:8px;">导出全部</button>
    </div>
    <div class="card-grid">
      ${Object.keys(activeVideos).length === 0
        ? '<p>暂无视频，点击上方按钮添加</p>'
        : Object.entries(activeVideos).map(([vid, v]) => videoCard(vid, v, userId, platformId, false)).join('')}
    </div>
    <!-- 添加/编辑视频模态框 -->
    ${videoModal()}
    <!-- 迁移视频模态框 -->
    ${moveVideoModal(data, userId, platformId)}
    ${exportLinksModal()}
  `;

  // 前端所有可选的用户+平台选项（用于迁移选择器）
  const allAccounts = Object.entries(data.accounts).map(([uid, u]) => ({
    uid,
    displayName: u.displayName,
    platforms: Object.keys(u.platforms || {})
  }));

  const script = `
    const allAccounts = ${JSON.stringify(allAccounts)};

    // ---- 占位图模式 ----
    let currentPlaceholderMode = localStorage.getItem('petvid_placeholder_mode') || 'kitten';
    function updatePlaceholderUI() {
      document.querySelectorAll('.placeholder-btn').forEach(b => {
        b.style.border = b.dataset.mode === currentPlaceholderMode ? '2px solid #007bff' : '1px solid #ccc';
        b.style.fontWeight = b.dataset.mode === currentPlaceholderMode ? 'bold' : 'normal';
      });
    }
    function setPlaceholderMode(mode) {
      currentPlaceholderMode = mode;
      localStorage.setItem('petvid_placeholder_mode', mode);
      updatePlaceholderUI();
    }
    updatePlaceholderUI();

    function showAddVideoModal() {
      document.getElementById('modalTitle').innerText = '添加视频';
      document.getElementById('modalVideoId').value = '';
      document.getElementById('modalTitleInput').value = '';
      document.getElementById('modalImageUrlInput').value = '';
      document.getElementById('modalAffiliateLinkInput').value = '';
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
        videoId,
        title,
        imageUrl,
        affiliateLink,
        placeholderMode: currentPlaceholderMode
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

    // ---- 迁移视频 ----
    let moveVideoId = '';
    function showMoveVideoModal(vid) {
      moveVideoId = vid;
      populateMoveUsers();
      document.getElementById('moveVideoModal').style.display = 'flex';
    }
    function closeMoveVideoModal() { document.getElementById('moveVideoModal').style.display = 'none'; }
    function populateMoveUsers() {
      const sel = document.getElementById('moveTargetUserId');
      sel.innerHTML = '<option value="">-- 选择用户 --</option>' + allAccounts.map(a => '<option value="' + a.uid + '">' + a.displayName + '</option>').join('');
      document.getElementById('moveTargetPlatformId').innerHTML = '<option value="">-- 选择平台 --</option>';
    }
    function onMoveUserChange() {
      const uid = document.getElementById('moveTargetUserId').value;
      const sel = document.getElementById('moveTargetPlatformId');
      const account = allAccounts.find(a => a.uid === uid);
      sel.innerHTML = '<option value="">-- 选择平台 --</option>' + (account ? account.platforms.map(p => '<option value="' + p + '">' + p + '</option>').join('') : '');
    }
    async function saveMoveVideo() {
      const targetUserId = document.getElementById('moveTargetUserId').value;
      const targetPlatformId = document.getElementById('moveTargetPlatformId').value;
      if (!targetUserId || !targetPlatformId) { alert('请选择目标用户和平台'); return; }
      const res = await fetch('/admin', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'moveVideo',
          userId: '${escapeJsStr(userId)}',
          platformId: '${escapeJsStr(platformId)}',
          videoId: moveVideoId,
          targetUserId,
          targetPlatformId
        })
      });
      if (res.ok) { closeMoveVideoModal(); location.reload(); }
      else alert((await res.json()).error);
    }

    // ---- 导出选中链接（函数定义在 exportLinksModal 的 script 标签中） ----
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
        <button class="btn" onclick="showMoveVideoModal('${escapeJsStr(vid)}')">迁移</button>
        <button class="btn" onclick="copyVideoLink('${escapeJsStr(vid)}')">复制链接</button>
        <button class="btn danger" onclick="deleteVideo('${escapeJsStr(vid)}')">移入回收站</button>
       </div>`;
  return `
    <div class="card video-card">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        ${deleted ? '' : `<input type="checkbox" class="video-checkbox" value="${escapeHtmlAttr(vid)}" data-title="${escapeHtmlAttr(v.title)}" style="flex-shrink:0;" />`}
        <h3 style="margin:0; flex:1;">${escapeHtml(v.title)} <small>(${escapeHtml(vid)})</small></h3>
      </div>
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
        <div style="margin-bottom:12px;"><label>图片URL <span style="color:#999;">(留空自动填充占位图)</span></label><input type="text" id="modalImageUrlInput" placeholder="https://picsum.photos/400/225" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" oninput="previewImage()" /></div>
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

function moveVideoModal(data, currentUserId, currentPlatformId) {
  return `
    <div id="moveVideoModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; justify-content:center; align-items:center;">
      <div style="background:white; border-radius:8px; padding:24px; max-width:400px; width:90%; box-shadow:0 4px 12px rgba(0,0,0,0.2);">
        <h3>迁移视频</h3>
        <p style="margin-bottom:12px; color:#666;">选择目标用户和平台：</p>
        <div style="margin-bottom:12px;">
          <label>目标用户</label>
          <select id="moveTargetUserId" onchange="onMoveUserChange()" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;"></select>
        </div>
        <div style="margin-bottom:12px;">
          <label>目标平台</label>
          <select id="moveTargetPlatformId" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;"></select>
        </div>
        <div style="text-align:right; margin-top:16px;">
          <button class="btn danger" onclick="closeMoveVideoModal()" style="margin-right:8px;">取消</button>
          <button class="btn" onclick="saveMoveVideo()">迁移</button>
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

function editUserModal() {
  return `
    <div id="editUserModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; justify-content:center; align-items:center;">
      <div style="background:white; border-radius:8px; padding:24px; max-width:400px; width:90%;">
        <h3>编辑用户</h3>
        <input type="hidden" id="editUserId" />
        <p>用户ID：<span id="editUserIdDisplay" style="font-weight:bold;"></span></p>
        <input type="text" id="editUserDisplayName" placeholder="显示名称" style="width:100%; padding:8px; margin:8px 0; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" />
        <div style="text-align:right; margin-top:16px;">
          <button class="btn danger" onclick="closeEditUserModal()" style="margin-right:8px;">取消</button>
          <button class="btn" onclick="saveEditUser()">保存</button>
        </div>
      </div>
    </div>
  `;
}

function editPlatformModal() {
  return `
    <div id="editPlatformModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; justify-content:center; align-items:center;">
      <div style="background:white; border-radius:8px; padding:24px; max-width:400px; width:90%;">
        <h3>编辑平台</h3>
        <input type="hidden" id="editPlatformId" />
        <p>平台ID：<span id="editPlatformIdDisplay" style="font-weight:bold;"></span></p>
        <input type="text" id="editPlatformDisplayName" placeholder="显示名称" style="width:100%; padding:8px; margin:8px 0; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" />
        <div style="text-align:right; margin-top:16px;">
          <button class="btn danger" onclick="closeEditPlatformModal()" style="margin-right:8px;">取消</button>
          <button class="btn" onclick="saveEditPlatform()">保存</button>
        </div>
      </div>
    </div>
  `;
}

function exportLinksModal() {
  return `
    <div id="exportModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; justify-content:center; align-items:center;">
      <div style="background:white; border-radius:8px; padding:24px; max-width:700px; width:90%; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 4px 12px rgba(0,0,0,0.2);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-shrink:0;">
          <h3 style="margin:0;">导出链接</h3>
          <button id="copyAllBtn" class="btn" data-links="[]" onclick="copyAllLinks()" style="font-size:13px;">📋 复制全部链接</button>
        </div>
        <div style="display:flex; border-bottom:1px solid #ddd; padding-bottom:8px; margin-bottom:8px; font-weight:bold; font-size:13px; color:#555; flex-shrink:0;">
          <div style="flex:1;">访问链接</div>
          <div style="width:200px; flex-shrink:0; text-align:right;">视频标题</div>
        </div>
        <div id="exportBody" style="overflow-y:auto; flex:1; min-height:0;"></div>
        <div style="text-align:right; margin-top:12px; flex-shrink:0;">
          <button class="btn danger" onclick="closeExportModal()">关闭</button>
        </div>
      </div>
    </div>
    <script>
function copyVideoLink(vid){var url='https://petvid.pages.dev/v/'+vid;var ta=document.createElement('textarea');ta.value=url;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');alert('链接已复制')}catch(e){alert('复制失败: '+url)}document.body.removeChild(ta)}
function showExportModal(){var c=document.querySelectorAll('.video-checkbox');var items=[];c.forEach(function(cb){if(!cb.checked)return;items.push({vid:cb.value,title:cb.dataset.title||cb.value})});if(items.length===0){alert('请先勾选要导出的视频');return}renderExportModalContent(items);document.getElementById('exportModal').style.display='flex'}
function renderExportModalContent(items){var rows=items.map(function(item){var url='https://petvid.pages.dev/v/'+item.vid;return'<div class=\"export-row\"><div class=\"export-link\">'+url+'</div><div class=\"export-title\">'+item.title.replace(/'/g,'\\\\u0027')+'</div></div>'});document.getElementById('exportBody').innerHTML=rows.join('');document.getElementById('copyAllBtn').dataset.links=JSON.stringify(items.map(function(i){return'https://petvid.pages.dev/v/'+i.vid}))}
function copyAllLinks(){var btn=document.getElementById('copyAllBtn');var links=JSON.parse(btn.dataset.links||'[]');if(links.length===0)return;var text=links.join('\\n');var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');alert('已复制 '+links.length+' 条链接')}catch(e){alert('复制失败，请手动选择复制')}document.body.removeChild(ta)}
function closeExportModal(){document.getElementById('exportModal').style.display='none'}
function exportAll(){var c=document.querySelectorAll('.video-checkbox');var items=[];c.forEach(function(cb){items.push({vid:cb.value,title:cb.dataset.title||cb.value})});if(items.length===0){alert('没有可导出的视频');return}renderExportModalContent(items);document.getElementById('exportModal').style.display='flex'}
    <\/script>
  `;
}


