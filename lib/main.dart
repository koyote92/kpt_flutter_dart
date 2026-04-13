import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter/services.dart' show rootBundle;

void main() {
  WebViewPlatform.instance = AndroidWebViewPlatform();

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

  // Состояние ошибки
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
            final url = request.url.toLowerCase();
            print('🔄 NavigationRequest: $url');

            // Разрешаем всё локальное
            if (url.startsWith('asset:///') ||
                url.contains('local') ||
                url.endsWith('.html') ||
                url.endsWith('.js') ||
                url.endsWith('.css')) {
              print('✅ Allowed local resource');
              return NavigationDecision.navigate;
            }

            // Разрешаем свои домены
            if (url.startsWith('https://gl.kuraj-prodaj.com') ||
                url.startsWith('https://gl-auth.0422.ru') ||
                url.startsWith('https://kpt.kuraj-prodaj.com')) {
              return NavigationDecision.navigate;
            }

            // Всё остальное — в браузер
            await _openInExternalBrowser(request.url);
            return NavigationDecision.prevent;
          },

          onWebResourceError: (WebResourceError error) {
            print('╔══════════════════════════════════════════════════════════════');
            print('║ WEBVIEW RESOURCE ERROR');
            print('╠══════════════════════════════════════════════════════════════');
            print('║ Error Code     : ${error.errorCode}');
            print('║ Description    : ${error.description}');
            print('║ Failing URL    : ${error.url ?? "unknown"}');
            print('║ Error Type     : ${error.errorType}');
            print('║ Is Main Frame  : ${error.isForMainFrame}');
            print('╚══════════════════════════════════════════════════════════════');

            if (mounted) {
              setState(() => hasError = true);
            }
          },

          onPageStarted: (String url) => print('📄 Page started: $url'),
          onPageFinished: (String url) => print('✅ Page finished: $url'),
        ),
      );

    // Load local HTML instead of remote URL
    _loadLocalWebApp();
  }

  Future<void> _loadLocalWebApp() async {
    try {
      final String html = await rootBundle.loadString('assets/web/index.html');

      await controller.loadHtmlString(
        html,
        baseUrl: 'file:///android_asset/flutter_assets/assets/web/', // ← Это важно!
      );

      print('[WebView] Successfully loaded via loadHtmlString + baseUrl');
    } catch (e) {
      print('[WebView] Failed to load local HTML: $e');
      await controller.loadRequest(Uri.parse("https://gl.kuraj-prodaj.com"));
    }
  }

  Future<void> _openInExternalBrowser(String url) async {
    final uri = Uri.parse(url);
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      try {
        await launchUrl(uri, mode: LaunchMode.platformDefault);
      } catch (_) {}
    }
  }

  // Кнопка "Повторить"
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
            // Основной WebView
            WebViewWidget(controller: controller),

            // === НАША ЗАГЛУШКА ===
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
                        const SizedBox(height: 20),

                        // Show more details on phone
                        Container(
                          padding: const EdgeInsets.all(12),
                          color: Colors.red[50],
                          child: const Text(
                            "Не удалось загрузить локальные файлы.\nПроверьте assets/web/kpt_start.html",
                            style: TextStyle(color: Colors.red, fontSize: 14),
                            textAlign: TextAlign.center,
                          ),
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