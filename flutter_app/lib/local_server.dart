import 'dart:io';

import 'package:flutter/services.dart' show rootBundle;

/// 固定端口：保证 WebView 内 IndexedDB / localStorage 的 origin（host:port）稳定不丢
const int kServerPort = 12888;

const String _cfApiBase = 'https://api.cloudflare.com/client/v4';

/// 启动本地 HTTP 服务：serve 打包进 assets 的 Web 构建产物，
/// 并把 `/cf-api/*` 反向代理到 Cloudflare V4 API（规避 WebView 跨域）。
class LocalWebServer {
  HttpServer? _server;
  String baseUrl = 'http://127.0.0.1:$kServerPort';

  Future<void> start() async {
    if (_server != null) return;
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, kServerPort);
    server.listen((request) async {
      try {
        await _handle(request);
      } catch (e) {
        request.response.statusCode = HttpStatus.internalServerError;
        request.response.write('$e');
        await request.response.close();
      }
    });
    _server = server;
  }

  Future<void> stop() async {
    await _server?.close(force: true);
    _server = null;
  }

  Future<void> _handle(HttpRequest request) async {
    final path = (request.uri.path == '/' || request.uri.path.isEmpty)
        ? '/index.html'
        : request.uri.path;

    if (path.startsWith('/cf-api')) {
      return _proxy(request, path.substring('/cf-api'.length));
    }

    return _serveStatic(request, path);
  }

  /* ---------------- 静态资源 ---------------- */

  static const Map<String, String> _mime = {
    'html': 'text/html; charset=utf-8',
    'js': 'application/javascript; charset=utf-8',
    'mjs': 'application/javascript; charset=utf-8',
    'css': 'text/css; charset=utf-8',
    'json': 'application/json; charset=utf-8',
    'svg': 'image/svg+xml',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'wasm': 'application/wasm',
    'map': 'application/json; charset=utf-8',
    'txt': 'text/plain; charset=utf-8',
  };

  Future<void> _serveStatic(HttpRequest request, String path) async {
    // 仅允许 GET/HEAD
    if (request.method != 'GET' && request.method != 'HEAD') {
      request.response.statusCode = HttpStatus.methodNotAllowed;
      await request.response.close();
      return;
    }

    final relative = path.replaceFirst(RegExp(r'^/'), '');
    final key = 'assets/web/$relative';
    if (!await _assetExists(key)) {
      request.response.statusCode = HttpStatus.notFound;
      await request.response.close();
      return;
    }

    final ext = relative.split('.').last.toLowerCase();
    request.response.headers.contentType = ContentType.parse(_mime[ext] ?? 'application/octet-stream');
    request.response.headers.set('Cache-Control', 'no-cache');
    final data = await rootBundle.load(key);
    request.response.add(data.buffer.asUint8List(data.offsetInBytes));
    await request.response.close();
  }

  Future<bool> _assetExists(String key) async {
    try {
      await rootBundle.load(key);
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ---------------- /cf-api 反向代理 ---------------- */

  Future<void> _proxy(HttpRequest request, String restPath) async {
    final uri = Uri.parse('$_cfApiBase$restPath${_queryOf(request.uri)}');

    final targetRequest = await _httpClient.openUrl(request.method, uri);

    // 逐头拷贝（Host 自动重建；跳过 hop-by-hop）
    request.headers.forEach((h, values) {
      final key = h.toLowerCase();
      if (key == 'host' ||
          key == 'connection' ||
          key == 'accept-encoding' ||
          key == 'content-length') {
        return;
      }
      targetRequest.headers.set(h, values);
    });
    // Dart HttpClient 默认带 gzip，跳过 accept-encoding 以避免双重压缩
    targetRequest.followRedirects = true;

    // 转发请求体（含 multipart FormData）
    if (request.method != 'GET' && request.method != 'HEAD') {
      final body = await request.fold<List<int>>(<int>[], (acc, chunk) {
        acc.addAll(chunk);
        return acc;
      });
      targetRequest.add(body);
    }

    final targetResponse = await targetRequest.close();

    request.response.statusCode = targetResponse.statusCode;
    targetResponse.headers.forEach((key, values) {
      final k = key.toLowerCase();
      if (k == 'transfer-encoding' || k == 'connection') return;
      request.response.headers.set(key, values);
    });

    await targetResponse.pipe(request.response);
    await request.response.close();
  }

  String _queryOf(Uri uri) {
    final q = uri.query;
    return q.isEmpty ? '' : '?$q';
  }
}

final HttpClient _httpClient = HttpClient()
  ..userAgent = 'CloudPivot'
  ..connectionTimeout = const Duration(seconds: 30);