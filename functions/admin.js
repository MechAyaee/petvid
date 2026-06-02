// functions/admin.js
export async function onRequest(context) {
  // 解析请求路径和方法
  const url = new URL(context.request.url);
  const path = url.pathname.replace('/admin', '') || '/'; // 去掉前缀，得到子路径

  // 如果是 /admin 或 /admin/ 直接返回测试页面
  if (path === '/') {
    return new Response('Admin route working！接下来将在这里构建管理页面。', {
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
    });
  }

  // 其他子路径（如 /admin/api/...）暂不处理，返回 404
  return new Response('Not found in admin', { status: 404 });
}
