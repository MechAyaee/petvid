// functions/lib/page.js

export function adminPage(content, extraScript) {
  if (!extraScript) extraScript = '';
  return '<!DOCTYPE html>' +
  '<html lang="zh-CN">' +
  '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>管理面板 - PetVid</title>' +
    '<link rel="stylesheet" href="/style.css">' +
    '<style>' +
      'body { font-family: Arial, sans-serif; background: #f0f2f5; margin:0; padding:20px; }' +
      '.admin-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; }' +
      '.admin-header h1 { margin:0; }' +
      '.admin-header a { text-decoration:none; color:#666; }' +
      '.toolbar { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }' +
      '.toolbar input { flex:1; min-width:120px; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; }' +
      '.card-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap:16px; }' +
      '.card { background:white; border-radius:8px; padding:16px; box-shadow:0 2px 4px rgba(0,0,0,0.1); overflow:hidden; }' +
      '.card h3 { margin:0 0 8px 0; word-break:break-word; }' +
      '.card .btn { margin-right:4px; }' +
      '.btn { display:inline-block; padding:6px 12px; background:#007acc; color:white; border:none; border-radius:4px; cursor:pointer; text-decoration:none; font-size:14px; }' +
      '.btn.danger { background:#e74c3c; }' +
      '.btn:hover { opacity:0.85; }' +
      '.breadcrumb a { color:#007acc; text-decoration:none; }' +
      '.breadcrumb { margin-bottom:16px; }' +
      '.video-card .btn-group { margin-top:8px; }' +
      '@media (max-width: 600px) {' +
        'body { padding:10px; }' +
        '.card-grid { grid-template-columns: 1fr; }' +
        '.card { padding:12px; }' +
        '.toolbar input { min-width:80px; }' +
        '.btn { font-size:12px; padding:4px 8px; }' +
        '.admin-header h1 { font-size:20px; }' +
      '}' +
      '@media (max-width: 400px) {' +
        '.card-grid { grid-template-columns: 1fr; }' +
      '}' +
    '</style>' +
  '</head>' +
  '<body>' +
    '<div class="container">' +
      '<div class="admin-header">' +
        '<h1>管理面板</h1>' +
        '<a href="/admin?logout=1">退出登录</a>' +
      '</div>' +
      content +
    '</div>' +
    '<script>' + extraScript + '</script>' +
  '</body>' +
  '</html>';
}
