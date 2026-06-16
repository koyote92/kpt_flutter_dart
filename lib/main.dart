import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:io' show Platform, Directory, File;
import 'package:flutter/services.dart' show rootBundle;
import 'package:path_provider/path_provider.dart';
import 'dart:convert';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  if (Platform.isAndroid) {
    WebViewPlatform.instance = AndroidWebViewPlatform();
  }

  runApp(const MaterialApp(
    debugShowCheckedModeBanner: false,
    home: WebViewPage(),
  ));
}

class WebViewPage extends StatefulWidget {
  const WebViewPage({super.key});

  @override
  State<WebViewPage> createState() => _WebViewPageState();
}

class _WebViewPageState extends State<WebViewPage> with AutomaticKeepAliveClientMixin {
  late final WebViewController controller;
  bool hasError = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();

    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFFFFFFF))
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (NavigationRequest request) async {
            final String url = request.url.toLowerCase();

            if (url.startsWith('file:///android_asset/') ||
                url.startsWith('asset:///') ||
                url.startsWith('file://') ||
                url.endsWith('.html') ||
                url.endsWith('.js') ||
                url.endsWith('.css') ||
                url.endsWith('.svg') ||
                url.endsWith('.png') ||
                url.endsWith('.jpg') ||
                url.endsWith('.jpeg') ||
                url.startsWith('https://auth.0422.ru') ||
                url.startsWith('https://app.kuraj-prodaj.com') ||
                url.startsWith('https://kpt.kuraj-prodaj.com')) {
              return NavigationDecision.navigate;
            }

            await _openInExternalBrowser(request.url);
            return NavigationDecision.prevent;
          },

          onWebResourceError: (WebResourceError error) {
            if (!mounted) return;
            if (error.isForMainFrame == true) {
              setState(() => hasError = true);
            }
          },
        ),
      );

    if (Platform.isAndroid) {
      if (controller.platform is AndroidWebViewController) {
        final androidController = controller.platform as AndroidWebViewController;
        androidController.setAllowFileAccess(true);
        androidController.setAllowContentAccess(true);
      }
    }

    // JavaScript канал для команд из веб-версии
    controller.addJavaScriptChannel(
      'FlutterWebView',
      onMessageReceived: (JavaScriptMessage message) async {
        final String raw = message.message;

        if (raw == "RESTART_APP" || raw == "ERROR_PAGE_RETRY") {
          if (!mounted) return;
          setState(() => hasError = false);
          await _loadLocalWebApp();
        }
      },
    );

    _loadLocalWebApp();
  }

  Future<void> _loadLocalWebApp() async {
    const String remoteFallback = "https://app.kuraj-prodaj.com";

    if (Platform.isAndroid) {
      try {
        await controller.loadRequest(
          Uri.parse('file:///android_asset/flutter_assets/assets/web/index.html'),
        );
        print('✅ Android: загружен локальный index.html');
      } catch (e) {
        print('⚠️ Android ошибка: $e');
        await controller.loadRequest(Uri.parse(remoteFallback));
      }
    } else {
      try {
        print('📱 [iOS] Начинаем загрузку локальных файлов...');

        final appDir = await getApplicationSupportDirectory();
        final webDir = Directory('${appDir.path}/web');

        final indexFile = File('${webDir.path}/index.html');

        // Копируем ассеты, если папки ещё нет ИЛИ index.html отсутствует
        if (!await webDir.exists() || !await indexFile.exists()) {
          print('📂 [iOS] Нужно скопировать ассеты...');
          if (await webDir.exists()) {
            await webDir.delete(recursive: true); // очищаем старую папку
          }
          await webDir.create(recursive: true);
          await _copyWebAssetsToDirectory(webDir.path);
          print('✅ [iOS] Ассеты успешно скопированы');
        } else {
          print('📂 [iOS] Локальные файлы уже есть');
        }

        if (await indexFile.exists()) {
          await controller.loadRequest(Uri.file(indexFile.path));
          print('✅ [iOS] УСПЕШНО загружен локальный index.html');
        } else {
          print('❌ [iOS] index.html всё равно не найден!');
          await controller.loadRequest(Uri.parse(remoteFallback));
        }
      } catch (e, stackTrace) {
        print('❌ [iOS] КРИТИЧЕСКАЯ ОШИБКА: $e');
        print(stackTrace);
        await controller.loadRequest(Uri.parse(remoteFallback));
      }
    }
  }

  Future<void> _copyWebAssetsToDirectory(String targetPath) async {
    try {
      final manifestContent = await rootBundle.loadString('AssetManifest.json');
      final Map<String, dynamic> manifest = json.decode(manifestContent);
  
      for (String assetPath in manifest.keys) {
        if (assetPath.startsWith('assets/web/')) {
          final data = await rootBundle.load(assetPath);
          final relativePath = assetPath.replaceFirst('assets/web/', '');
          final file = File('$targetPath/$relativePath');
  
          await file.create(recursive: true);
          await file.writeAsBytes(data.buffer.asUint8List());
        }
      }
    } catch (e) {
      print('⚠️ Ошибка при чтении AssetManifest.json: $e');
      // Можно добавить fallback-логику здесь при необходимости
      rethrow;
    }
  }

  Future<void> _openInExternalBrowser(String url) async {
    final uri = Uri.parse(url);
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {}
  }

  void _reloadPage() {
    setState(() => hasError = false);
    controller.reload();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            WebViewWidget(controller: controller),
            if (hasError)
              Container(
                color: Colors.white,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.cloud_off_rounded, size: 90, color: Colors.grey),
                        const SizedBox(height: 32),
                        const Text(
                          "Сервис временно недоступен",
                          style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 40),
                        ElevatedButton.icon(
                          onPressed: _reloadPage,
                          icon: const Icon(Icons.refresh),
                          label: const Text("Повторить попытку"),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}