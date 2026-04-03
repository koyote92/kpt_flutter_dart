import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:url_launcher/url_launcher.dart';

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

            if (url.startsWith('https://app-dev.0422.ru') ||
                url.startsWith('https://auth.0422.ru')) {
              return NavigationDecision.navigate;
            }

            if (url.startsWith('https://kpt.kuraj-prodaj.com') ||
                url.startsWith('https://max.ru')) {
              await _openInExternalBrowser(request.url);
              return NavigationDecision.prevent;
            }

            await _openInExternalBrowser(request.url);
            return NavigationDecision.prevent;
          },

          // ====================== ОБРАБОТКА ОШИБОК ======================
          onWebResourceError: (WebResourceError error) {
            print('WebView Error: ${error.errorCode} - ${error.description}');

            // Показываем свою заглушку при любой ошибке загрузки
            if (mounted) {
              setState(() {
                hasError = true;
              });
            }
          },

          onPageStarted: (String url) {
            // Сбрасываем ошибку, когда начинается новая загрузка
            if (mounted && hasError) {
              setState(() => hasError = false);
            }
          },

          onPageFinished: (String url) {
            // Если страница успешно загрузилась — скрываем заглушку
            if (mounted && hasError) {
              setState(() => hasError = false);
            }
          },
        ),
      )
      ..loadRequest(Uri.parse("https://app-dev.0422.ru"));
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
                        const Icon(
                          Icons.cloud_off_rounded,
                          size: 90,
                          color: Colors.grey,
                        ),
                        const SizedBox(height: 32),
                        const Text(
                          "Сервис временно недоступен",
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w600,
                            color: Colors.black87,
                          ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          "Пожалуйста, проверьте подключение к интернету\nи попробуйте позже",
                          style: TextStyle(
                            fontSize: 16,
                            color: Colors.grey,
                            height: 1.4,
                          ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 40),
                        ElevatedButton.icon(
                          onPressed: _reloadPage,
                          icon: const Icon(Icons.refresh),
                          label: const Text("Повторить попытку"),
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 32,
                              vertical: 16,
                            ),
                            textStyle: const TextStyle(fontSize: 17),
                          ),
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