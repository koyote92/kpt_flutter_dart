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

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();

    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (NavigationRequest request) async {
            final url = request.url.toLowerCase();

            // === ДОМЕНЫ, КОТОРЫЕ ОСТАЮТСЯ ВНУТРИ WEBVIEW ===
            if (url.startsWith('https://app-dev.0422.ru') ||
                url.startsWith('https://auth.0422.ru')) {
              return NavigationDecision.navigate;
            }

            // === ДОМЕН, КОТОРЫЙ ДОЛЖЕН ОТКРЫВАТЬСЯ ВО ВНЕШНЕМ БРАУЗЕРЕ ===
            if (url.startsWith('https://kpt.kuraj-prodaj.com') ||
                url.startsWith('https://max.ru')) {
              await _openInExternalBrowser(request.url);
              return NavigationDecision.prevent;
            }

            // === ВСЁ ОСТАЛЬНОЕ ТОЖЕ ВО ВНЕШНЕМ БРАУЗЕРЕ ===
            await _openInExternalBrowser(request.url);
            return NavigationDecision.prevent;
          },
        ),
      )
      ..loadRequest(Uri.parse("https://app-dev.0422.ru"));
  }

  // Вынесли открытие во внешнем браузере в отдельный метод
  Future<void> _openInExternalBrowser(String url) async {
    final uri = Uri.parse(url);
    try {
      await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
    } catch (e) {
      // fallback на случай, если externalApplication не сработает
      try {
        await launchUrl(uri, mode: LaunchMode.platformDefault);
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      body: SafeArea(
        child: WebViewWidget(controller: controller),
      ),
    );
  }
}