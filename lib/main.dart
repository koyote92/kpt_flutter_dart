import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:device_info_plus/device_info_plus.dart';
import 'dart:io' show Platform;
import 'dart:convert';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // ←←← Ручная инициализация Firebase (вставь свои данные)
  await Firebase.initializeApp(
    options: const FirebaseOptions(
      apiKey: "AIzaSyDYh443MCVeiuM4Kc6rtLJrZOmABsWYzBE",           // из current_key
      appId: "1:263810602183:android:3b91a432544f36a7901ae2",   // mobilesdk_app_id
      messagingSenderId: "263810602183",                  // project_number
      projectId: "kpt-origin",                                // project_id
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
                url.startsWith('https://auth.0422.ru') ||
                url.startsWith('https://app.kuraj-prodaj.com')) {

              print('✅ Allowed: $url');
              return NavigationDecision.navigate;
            }

            print('→ Открываем во внешнем браузере: $url');
            await _openInExternalBrowser(request.url);
            return NavigationDecision.prevent;
          },

          onWebResourceError: (WebResourceError error) async {
            // ... твой текущий код onWebResourceError без изменений ...
            print('╔══════════════════════════════════════════════════════════════');
            print('║ WEBVIEW RESOURCE ERROR');
            print('║ Code      : ${error.errorCode}');
            print('║ Desc      : ${error.description}');
            print('║ URL       : ${error.url ?? "unknown"}');
            print('║ MainFrame : ${error.isForMainFrame}');
            print('╚══════════════════════════════════════════════════════════════');

            if (!mounted) return;

            if (error.errorCode == -2 ||
                error.errorCode == -3 ||
                error.errorCode == -6 ||
                error.errorCode == -102 ||
                error.errorCode == -104 ||
                error.errorCode == -109 ||
                error.description.toLowerCase().contains('name not resolved') ||
                error.description.toLowerCase().contains('net::err_name_not_resolved')) {

              try {
                final String errorHtml = await rootBundle.loadString('assets/web/error.html');
                await controller.loadHtmlString(errorHtml);
                print('→ Кастомная error.html успешно загружена');
                return;
              } catch (e) {
                print('→ Не удалось загрузить error.html: $e');
              }
            }

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

          // === ТВОЙ СТАРЫЙ КОД (оставляем как было) ===
          if (message.message == "RESTART_APP" || message.message == "ERROR_PAGE_RETRY") {
            if (!mounted) return;

            print('🔄 Получена команда на перезапуск приложения');

            setState(() => hasError = false);
            await _loadLocalWebApp();
            return;   // ← выходим, чтобы не обрабатывать дальше
          }

          // === НОВОЕ: обработка сообщения от JS (REGISTER_FCM) ===
          if (message.message.contains("REGISTER_FCM")) {
            try {
              final data = jsonDecode(message.message);
              final userId = data['userId'];

              if (userId != null) {
                _currentUserId = userId is int ? userId : int.tryParse(userId.toString());
                print('✅ Получен userId из JS: $_currentUserId');
                await _registerFCMToken();
              }
            } catch (e) {
              print('❌ Не удалось распарсить REGISTER_FCM: $e');
            }
          }
        },
      );
    }

    // Загружаем стартовую страницу
    _loadLocalWebApp();
  }

  // ====================== ИСПРАВЛЕННАЯ ФУНКЦИЯ ======================
  Future<void> _registerFCMToken() async {
    if (_currentUserId == null) return;

    try {
      final messaging = FirebaseMessaging.instance;

      // Запрос разрешения (как было в твоём исходном коде)
      final NotificationSettings settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );

      print('Разрешение на уведомления: ${settings.authorizationStatus}');

      if (settings.authorizationStatus != AuthorizationStatus.authorized) {
        print('❌ Пользователь не дал разрешение на уведомления');
        return;
      }

      final token = await messaging.getToken();
      if (token == null || token.isEmpty) {
        print('❌ FCM Token не получен');
        return;
      }

      print('🔥 FCM Token получен');

      // Получаем информацию об устройстве
      String deviceName = "WebView App (Unknown)";
      String deviceId = "";                     // ← новое поле

      if (Platform.isAndroid) {
        final deviceInfo = DeviceInfoPlugin();
        final androidInfo = await deviceInfo.androidInfo;

        deviceName = "${androidInfo.manufacturer} ${androidInfo.model} (Android ${androidInfo.version.release})";
        deviceId = androidInfo.id;              // Android ID — уникальный для устройства
      }

      // Отправляем ровно то, что требует схема FCMTokenRegister
      final response = await http.post(
        Uri.parse('https://auth.0422.ru/fcm/register-token'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          "user_id": _currentUserId,
          "fcm_token": token,
          "device_id": deviceId,           // ← добавлено
          "platform": "android",
          "device_name": deviceName,
        }),
      );

      print('Сервер ответил кодом: ${response.statusCode}');
      if (response.statusCode == 200 || response.statusCode == 201) {
        print('✅ Токен успешно отправлен (с device_id)');
      } else {
        print('⚠️ Сервер вернул ошибку: ${response.body}');
      }
    } catch (e) {
      print('❌ Ошибка при регистрации FCM: $e');
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
      await controller.loadRequest(Uri.parse("https://kpt.kuraj-prodaj.com"));
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