import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import 'local_server.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final server = LocalWebServer();
  await server.start();
  runApp(CloudpivotApp(serverUrl: server.baseUrl));
}

class CloudpivotApp extends StatelessWidget {
  const CloudpivotApp({super.key, required this.serverUrl});

  final String serverUrl;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '云枢 CloudPivot',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF22C55E), useMaterial3: true),
      home: Scaffold(
        body: SafeArea(
          child: InAppWebView(
            initialUrlRequest: URLRequest(url: WebUri(serverUrl)),
            initialSettings: InAppWebViewSettings(
              javaScriptEnabled: true,
              domStorageEnabled: true,
              databaseEnabled: true,
              javaScriptCanOpenWindowsAutomatically: true,
              mediaPlaybackRequiresUserGesture: false,
              allowFileAccess: true,
              supportZoom: false,
            ),
          ),
        ),
      ),
    );
  }
}