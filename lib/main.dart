import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:io' show Directory, File;
import 'package:flutter/services.dart' show rootBundle;
import 'package:path_provider/path_provider.dart';
// import 'package:onesignal_flutter/onesignal_flutter.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // OneSignal временно отключён
  // OneSignal.Debug.setLogLevel(OSLogLevel.verbose);
  // OneSignal.initialize("f29fb00f-46a6-415a-9c39-1f02aa0e9676");
  // OneSignal.Notifications.requestPermission(true);

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

            if (url.startsWith('file://') ||
                url.endsWith('.html') ||
                url.endsWith('.js') ||
                url.endsWith('.css') ||
                url.endsWith('.svg') ||
                url.endsWith('.png') ||
                url.endsWith('.jpg') ||
                url.endsWith('.jpeg') ||
                url.startsWith('https://auth.0422.ru') ||
                url.startsWith('https://app.kuraj-prodaj.com') ||
                url.startsWith('https://kpt.kuraj-prodaj.com') ||
                url.startsWith('https://auth.0422.ru.compitum.ru') ||
                url.startsWith('https://app.kuraj-prodaj.com.compitum.ru')) {
              return NavigationDecision.navigate;
            }

            await _openInExternalBrowser(request.url);
            return NavigationDecision.prevent;
          },
          onWebResourceError: (WebResourceError error) {
            print(error);
            if (!mounted) return;
            if (error.isForMainFrame == true) {
              setState(() => hasError = true);
            }
          },
        ),
      );

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

    // Запуск загрузки веб-приложения (OneSignal закомментирован)
    _loadLocalWebApp();
  }

  Future<void> _loadLocalWebApp() async {
    const String realUrl  = "https://app.kuraj-prodaj.com";
    const String proxyUrl = "https://app.kuraj-prodaj.com.compitum.ru";
  
    try {
      print('📱 [iOS] Начинаем загрузку локальных файлов...');
      final appDir = await getApplicationSupportDirectory();
      final webDir = Directory('${appDir.path}/web');
      final indexFile = File('${webDir.path}/index.html');
  
      if (await webDir.exists()) {
        await webDir.delete(recursive: true);
      }
      await webDir.create(recursive: true);
      await _copyWebAssetsToDirectory(webDir.path);
      print('✅ [iOS] Ассеты успешно скопированы');
  
      if (await indexFile.exists()) {
        await controller.loadFile(indexFile.path);
        print('✅ [iOS] УСПЕХ: загружен локальный index.html');
      } else {
        print('❌ index.html не найден → пробуем remote');
        await _loadRemoteWithFallback(realUrl, proxyUrl);
      }
    } catch (e, stackTrace) {
      print('❌ ОШИБКА: $e');
      print(stackTrace);
      await _loadRemoteWithFallback(realUrl, proxyUrl);
    }
  }
  
  Future<void> _loadRemoteWithFallback(String realUrl, String proxyUrl) async {
    try {
      // Пробуем основной (таймаут 5 секунд)
      await controller
          .loadRequest(Uri.parse(realUrl))
          .timeout(const Duration(seconds: 5));
      print('✅ Загрузили основной: $realUrl');
    } catch (e) {
      print('⚠️ Основной недоступен ($e), пробуем прокси...');
      try {
        await controller.loadRequest(Uri.parse(proxyUrl));
        print('✅ Загрузили прокси: $proxyUrl');
      } catch (proxyErr) {
        print('❌ Прокси тоже не загрузился: $proxyErr');
        if (mounted) {
          setState(() => hasError = true);
        }
      }
    }
  }

  // ============================================================
  // КОПИРОВАНИЕ ЛОКАЛЬНЫХ ФАЙЛОВ
  // ============================================================
  Future<void> _copyWebAssetsToDirectory(String targetPath) async {
    const List<String> webAssets = [
      'index_FULL.html',
      'client.js',
      'old-client.js',
      'chart.min.js',
      'index.html',
      'bootstrap/css/bootstrap.min.css',
      'bootstrap/js/bootstrap.min.js',
      'admin.html',
      'kpt_drop.html',
      'css/Login-Form-Basic-icons.css',
      'css/all.min.css',
      'info_12.html',
      'kpt_bye_old.html',
      'kpt_bye_full.html',
      'kpt_bye.html',
      'telegram-web-app.js',
      'img/KP_STUDIO_LOGO-03.svg',
      'img/hero_GL-15.png',
      'img/instramet_final 8.jpeg',
      'img/instramet_final 18.jpeg',
      'img/instramet_final 34.jpeg',
      'img/instramet_final 22.jpeg',
      'img/instramet_final 43.jpeg',
      'img/instramet_final 14.jpeg',
      'img/12_logo-02.png',
      'img/instramet_final 4.jpeg',
      'img/12_logo-02_optimal-02.png',
      'img/instramet_final 38.jpeg',
      'img/instramet_final 39.jpeg',
      'img/instramet_final 5.jpeg',
      'img/instramet_final 15.jpeg',
      'img/instramet_final 42.jpeg',
      'img/kp_new_11.png',
      'img/12_logo-02_small-02.png',
      'img/instramet_final 23.jpeg',
      'img/instramet_final 35.jpeg',
      'img/instramet_final 19.jpeg',
      'img/kp_icon_192.png',
      'img/instramet_final 9.jpeg',
      'img/instramet_final 53.jpeg',
      'img/instramet_final 45.jpeg',
      'img/instramet_final 12.jpeg',
      'img/instramet_final 2.jpeg',
      'img/12_logo-02_small-02.svg',
      'img/instramet_final 28.jpeg',
      'img/kp_new_11.svg',
      'img/instramet_final 49.jpeg',
      'img/instramet_final 32.jpeg',
      'img/instramet_final 24.jpeg',
      'img/instramet_final 25.jpeg',
      'img/instramet_final 33.jpeg',
      'img/12_logo-02_optimal-02.svg',
      'img/instramet_final 48.jpeg',
      'img/12_logo-02.svg',
      'img/instramet_final 29.jpeg',
      'img/KP_STUDIO_LOGO-03.png',
      'img/instramet_final 3.jpeg',
      'img/instramet_final 13.jpeg',
      'img/hero_GL-15.svg',
      'img/instramet_final 44.jpeg',
      'img/instramet_final 52.jpeg',
      'img/instramet_final 10.jpeg',
      'img/hero_GL-19.svg',
      'img/instramet_final 47.jpeg',
      'img/kp_icon_512.png',
      'img/instramet_final 51.jpeg',
      'img/instramet_final 26.jpeg',
      'img/instramet_final 30.jpeg',
      'img/12_logo_medium_blur.png',
      'img/hero_GL_16.png',
      'img/dreamer_logo-03.svg',
      'img/instramet_final 31.jpeg',
      'img/instramet_final 27.jpeg',
      'img/instramet_final 50.jpeg',
      'img/instramet_final 46.jpeg',
      'img/instramet_final 11.jpeg',
      'img/instramet_final 1.jpeg',
      'img/12_logo-02_small-02-1.png',
      'img/instramet_final 20.jpeg',
      'img/instramet_final 36.jpeg',
      'img/kp_field.png',
      'img/icon_3_512.png',
      'img/instramet_final 6.jpeg',
      'img/hero_GL_16.svg',
      'img/instramet_final 16.jpeg',
      'img/instramet_final 41.jpeg',
      'img/instramet_final 40.jpeg',
      'img/instramet_final 17.jpeg',
      'img/instramet_final 7.jpeg',
      'img/dreamer.jpg',
      'img/hero_GL-19.png',
      'img/instramet_final 37.jpeg',
      'img/instramet_final 21.jpeg',
      'info_mechtatel.html',
      'error_no_internet.html',
      'webfonts/fa-solid-900.ttf',
      'webfonts/fa-regular-400.woff2',
      'webfonts/fa-v4compatibility.ttf',
      'webfonts/fa-regular-400.ttf',
      'webfonts/fa-v4compatibility.woff2',
      'webfonts/fa-solid-900.woff2',
      'webfonts/fa-brands-400.woff2',
      'webfonts/fa-brands-400.ttf',
      'icons/kp_icon_192.png',
      'icons/kp_icon_512.png',
      'icons/favicon.png',
      'style.css',
      'manifest.json',
      'index_tmp.html',
      'manifest.webmanifest',
      'error.html',
      'start_img/metacard_start 35.jpeg',
      'start_img/metacard_start 23.jpeg',
      'start_img/metacard_start 4.jpeg',
      'start_img/metacard_start 19.jpeg',
      'start_img/metacard_start 39.jpeg',
      'start_img/metacard_start 8.jpeg',
      'start_img/metacard_start 42.jpeg',
      'start_img/metacard_start 15.jpeg',
      'start_img/metacard_start 14.jpeg',
      'start_img/metacard_start 43.jpeg',
      'start_img/metacard_start 9.jpeg',
      'start_img/metacard_start 38.jpeg',
      'start_img/metacard_start 18.jpeg',
      'start_img/metacard_start 5.jpeg',
      'start_img/metacard_start 22.jpeg',
      'start_img/metacard_start 34.jpeg',
      'start_img/metacard_start 29.jpeg',
      'start_img/metacard_start 52.jpeg',
      'start_img/metacard_start 44.jpeg',
      'start_img/metacard_start 13.jpeg',
      'start_img/metacard_start 33.jpeg',
      'start_img/metacard_start 25.jpeg',
      'start_img/metacard_start 48.jpeg',
      'start_img/metacard_start 2.jpeg',
      'start_img/metacard_start 3.jpeg',
      'start_img/metacard_start 49.jpeg',
      'start_img/metacard_start 24.jpeg',
      'start_img/metacard_start 32.jpeg',
      'start_img/metacard_start 12.jpeg',
      'start_img/metacard_start 45.jpeg',
      'start_img/metacard_start 53.jpeg',
      'start_img/metacard_start 28.jpeg',
      'start_img/metacard_start 11.jpeg',
      'start_img/metacard_start 46.jpeg',
      'start_img/metacard_start 50.jpeg',
      'start_img/metacard_start 27.jpeg',
      'start_img/metacard_start 31.jpeg',
      'start_img/metacard_start 30.jpeg',
      'start_img/metacard_start 26.jpeg',
      'start_img/metacard_start 1.jpeg',
      'start_img/metacard_start 51.jpeg',
      'start_img/metacard_start 47.jpeg',
      'start_img/metacard_start 10.jpeg',
      'start_img/metacard_start 6.jpeg',
      'start_img/metacard_start 21.jpeg',
      'start_img/metacard_start 37.jpeg',
      'start_img/metacard_start 17.jpeg',
      'start_img/metacard_start 40.jpeg',
      'start_img/metacard_start 41.jpeg',
      'start_img/metacard_start 16.jpeg',
      'start_img/metacard_start 36.jpeg',
      'start_img/metacard_start 20.jpeg',
      'start_img/metacard_start 7.jpeg',
      'privacy.html',
      'kpt_start.html',
    ];

    for (final relativePath in webAssets) {
      final assetPath = 'assets/web/$relativePath';
      try {
        final data = await rootBundle.load(assetPath);
        final file = File('$targetPath/$relativePath');
        await file.create(recursive: true);
        await file.writeAsBytes(data.buffer.asUint8List());
      } catch (e) {
        print('⚠️ Не удалось скопировать $relativePath: $e');
      }
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