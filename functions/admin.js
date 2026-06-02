// functions/admin.js

import { getDataFromKV, saveDataToKV } from './lib/db.js';
import { checkAuth, getLoginPage } from './lib/auth.js';
import { jsonResponse, sha256 } from './lib/helpers.js';
import { renderUserListHtml } from './lib/render-users.js';
import { renderPlatformListHtml } from './lib/render-platforms.js';
import { renderVideoListHtml } from './lib/render-videos.js';

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
        var userId = body.userId;
        var platformId = body.platformId;
        var videoId = body.newVideoId;
        var title = body.title;
        var imageUrl = body.imageUrl || "";
        var affiliateLink = body.affiliateLink || "";

        if (!userId || !platformId || !videoId || !title) {
          throw new Error('缺少必要参数（userId, platformId, videoId, title）');
        }
        if (!data.accounts[userId] || !data.accounts[userId].platforms[platformId]) {
          throw new Error('平台不存在');
        }
        if (data.accounts[userId].platforms[platformId].videos[videoId]) {
          throw new Error('视频ID已存在');
        }
        data.accounts[userId].platforms[platformId].videos[videoId] = {
          title: title,
          imageUrl: imageUrl,
          affiliateLink: affiliateLink
        };
        await saveDataToKV(env, data);
        return jsonResponse({ ok: true });
      }

      if (action === 'editVideo') {
        var oldVideoId = body.oldVideoId;
        var newVideoId = body.newVideoId;
        var title = body.title;
        var imageUrl = body.imageUrl || "";
        var affiliateLink = body.affiliateLink || "";

        if (!oldVideoId || !newVideoId || !title) {
          return jsonResponse({ ok: false, error: '缺少必要参数' });
        }
        if (!data.accounts[body.userId] || !data.accounts[body.userId].platforms[body.platformId] || !data.accounts[body.userId].platforms[body.platformId].videos) {
          return jsonResponse({ ok: false, error: '用户或平台或视频为空' });
        }
        var platform = data.accounts[body.userId].platforms[body.platformId];

        if (oldVideoId !== newVideoId) {
          if (platform.videos[newVideoId] && oldVideoId !== newVideoId) {
            return jsonResponse({ ok: false, error: '新视频ID已存在，请使用其他ID' });
          }
          delete platform.videos[oldVideoId];
        }
        platform.videos[newVideoId] = {
          title: title,
          imageUrl: imageUrl,
          affiliateLink: affiliateLink
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
