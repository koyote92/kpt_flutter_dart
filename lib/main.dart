import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // ←←← Ручная инициализация Firebase (вставь свои данные)
  await Firebase.initializeApp(
    options: const FirebaseOptions(
      apiKey: "AIzaSyD2xdIAMZfiV3SsRxYDsdD4lsIy40xR04A",           // из current_key
      appId: "1:719323150827:android:6cb7abe58ce3d804e5c1ae",   // mobilesdk_app_id
      messagingSenderId: "719323150827",                  // project_number
      projectId: "kpt-gl",                                // project_id
    ),
  );

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

  int? _currentUserId;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();

    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFFFFFFF))

    // === ЕДИНСТВЕННЫЙ NavigationDelegate ===
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (NavigationRequest request) async {
            final String url = request.url.toLowerCase();
            print('🔄 NavigationRequest: $url');

            if (url.startsWith('file:///android_asset/') ||
                url.startsWith('asset:///') ||
                url.endsWith('.html') ||
                url.endsWith('.js') ||
                url.endsWith('.css') ||
                url.endsWith('.svg') ||
                url.endsWith('.png') ||
                url.endsWith('.jpg') ||
                url.endsWith('.jpeg') ||
                // url.startsWith('https://kuraj-prodaj.com') ||
                url.startsWith('https://gl.kuraj-prodaj.com/index') ||
                url.startsWith('https://gl.kuraj-prodaj.com/kpt_start') ||
                url.startsWith('https://gl-auth.0422.ru') ||
                // url.startsWith('https://mechtatel.team') ||
                url.startsWith('https://kpt.kuraj-prodaj.com')) {

              print('✅ Allowed: $url');
              return NavigationDecision.navigate;
            }

            // Всё остальное — во внешний браузер
            print('→ Открываем во внешнем браузере: $url');
            await _openInExternalBrowser(request.url);
            return NavigationDecision.prevent;
          },

          onWebResourceError: (WebResourceError error) async {
            print('╔══════════════════════════════════════════════════════════════');
            print('║ WEBVIEW RESOURCE ERROR');
            print('║ Code      : ${error.errorCode}');
            print('║ Desc      : ${error.description}');
            print('║ URL       : ${error.url ?? "unknown"}');
            print('║ MainFrame : ${error.isForMainFrame}');
            print('╚══════════════════════════════════════════════════════════════');

            if (!mounted) return;

            // Ловим DNS и сетевые ошибки
            if (error.errorCode == -2 ||
                error.errorCode == -3 ||
                error.errorCode == -6 ||
                error.errorCode == -102 ||
                error.errorCode == -104 ||
                error.errorCode == -109 ||
                error.description.toLowerCase().contains('name not resolved') ||
                error.description.toLowerCase().contains('net::err_name_not_resolved')) {

              print('→ Обнаружена ошибка ERR_NAME_NOT_RESOLVED');

              try {
                final String errorHtml = await rootBundle.loadString('assets/web/error.html');
                await controller.loadHtmlString(errorHtml);
                print('→ Кастомная error.html успешно загружена');
                return;
              } catch (e) {
                print('→ Не удалось загрузить error.html: $e');
              }
            }

            // Если ошибка на главном фрейме — показываем заглушку
            if (error.isForMainFrame == true) {
              if (mounted) setState(() => hasError = true);
            }
          },

          onPageFinished: (String url) async {
            print('✅ Page finished: $url');

            // Хак против ORB (оставляем)
            await controller.runJavaScript('''
            if (window.ORBWorkaround === undefined) {
              console.log("[ORB Workaround] Injecting...");
              window.ORBWorkaround = true;
              const originalFetch = window.fetch;
              window.fetch = function(...args) {
                return originalFetch(...args);
              };
            }
          ''');
          },
        ),
      );

    // === Android-specific настройки ===
    if (controller.platform is AndroidWebViewController) {
      final androidController = controller.platform as AndroidWebViewController;
      androidController.setAllowFileAccess(true);
      androidController.setAllowContentAccess(true);

      controller.addJavaScriptChannel(
        'FlutterWebView',
        onMessageReceived: (JavaScriptMessage message) async {
          print('📨 FlutterWebView message: ${message.message}');

          if (message.message == "RESTART_APP" || message.message == "ERROR_PAGE_RETRY") {
            if (!mounted) return;

            print('🔄 Получена команда на перезапуск приложения');

            setState(() => hasError = false);

            // Полный рестарт — перезагружаем локальный index.html
            await _loadLocalWebApp();
          }
        },
      );
    }

    // Загружаем стартовую страницу
    _loadLocalWebApp();

    _generateRandomUserIdAndRegisterFCM();
  }

  // ====================== ИСПРАВЛЕННАЯ ФУНКЦИЯ ======================
  Future<void> _generateRandomUserIdAndRegisterFCM() async {
    _currentUserId = 10000 + DateTime.now().millisecondsSinceEpoch % 90000;
    print('👤 Сгенерирован тестовый user_id: $_currentUserId');

    try {
      final messaging = FirebaseMessaging.instance;

      // Запрашиваем разрешение (это должно показать диалог)
      final NotificationSettings settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );

      print('Разрешение на уведомления: ${settings.authorizationStatus}');

      if (settings.authorizationStatus != AuthorizationStatus.authorized) {
        print('❌ Пользователь не дал разрешение');
        return;
      }

      // Получаем токен
      final token = await messaging.getToken();
      if (token == null || token.isEmpty) {
        print('❌ Токен не получен');
        return;
      }

      print('🔥 FCM Token получен (первые 50 символов): ${token.substring(0, 50)}...');

      // Отправляем на сервер
      final response = await http.post(
        Uri.parse('https://gl-auth.0422.ru/fcm/register-token'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          "user_id": _currentUserId,
          "fcm_token": token,
          "platform": "android",
          "device_name": "WebView App (Test)",
        }),
      );

      print('Сервер ответил кодом: ${response.statusCode}');

      if (response.statusCode == 200 || response.statusCode == 201) {
        print('✅ Токен успешно отправлен на сервер!');
      } else {
        print('⚠️ Ошибка от сервера: ${response.body}');
      }
    } catch (e, stack) {
      print('❌ Критическая ошибка при работе с FCM: $e');
      print(stack);
    }
  }

  Future<void> _loadLocalWebApp() async {
    try {
      print('[WebView] Trying file:///android_asset/flutter_assets/assets/web/index.html');

      await controller.loadRequest(
        Uri.parse('file:///android_asset/flutter_assets/assets/web/index.html'),
      );

      print('[WebView] Successfully loaded via file:///android_asset/');
    } catch (e) {
      print('[WebView] Failed to load local: $e');
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