/**
 * ФАЙЛ: client.js
 * НАЗНАЧЕНИЕ: Логика клиентской части Telegram Mini App (Frontend).
 * ОПИСАНИЕ:
 * 1. Обрабатывает жизненный цикл Mini App (init, expand, ready).
 * 2. Реализует безопасную авторизацию пользователя через сервер.
 * 3. Управляет состоянием интерфейса (переключение экранов, отрисовка тестов).
 * 4. Содержит логику "Умного рейтинга" (Weekly/All-time) и Sticky-плашки пользователя.
 * 5. Обрабатывает прохождение квалификационного теста и сохранение результатов.
 * ПАЙПЛАЙН: Запуск -> Auth -> Проверка onboarding -> Загрузка контента (Карта дня/Тесты) -> Рендеринг.
 */



document.addEventListener('DOMContentLoaded', () => {
    console.log(new Date().toLocaleString(), `[CLIENT] [DOMContentLoaded] started`);

    // === FADE-IN ВСЕЙ СТРАНИЦЫ ===
    const app = document.getElementById('app');

    setTimeout(() => {
        app.classList.add('loaded');

        // Плавно показываем все основные блоки
        document.querySelectorAll('.header, .main-content, .bottom-nav, .overlay').forEach(element => {
            element.classList.add('loaded');
        });
    }, 1500);   //  0.5 секунды задержка

    // --- ТЕЛЕГРАМ НАСТРОЙКА ---
    // const tg = window.Telegram ? window.Telegram.WebApp : null;
    // if (tg) {
    //     tg.ready();
    //     tg.expand();
    // }

    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
    let currentUser = null;
    let mainQuestions = [];
    let questionsForRetest = [];
    let questionIndex = 0;
    let attempts = 0;
    let sessionScore = 0;
    let correctFirstTryCount = 0;
    let isRetestPhase = false;
    let isOnboardingMode = false;
    let onboardingAnswers = {};
    // ==========================================
    // HARDKOD ДЛЯ КОМАНДНОГО РЕЙТИНГА (Game & Learn)
    // ==========================================
    const DEFAULT_TEAM_UUID = "game_and_learn";
    const DEFAULT_TEAM_NAME = "Game & Learn";

    const DAILY_XP_GOAL = 150;

    // --- ЭЛЕМЕНТЫ ИНТЕРФЕЙСА ---
    const questionTextEl = document.querySelector('.question-text');
    // const answerCards = document.querySelectorAll('.answer-button');
    let answerCards = document.querySelectorAll('.answer-card');
    const balanceEl = document.querySelector('.balance');
    const progressBar = document.querySelector('.progress-bar');
    const startScreen = document.getElementById('start-screen');
    
    // Экраны и Навигация
    const screens = document.querySelectorAll('.screen');
    const navButtons = document.querySelectorAll('.nav-item');

    // Модалки
    const explanationOverlay = document.getElementById('explanation-overlay');
    const explanationText = document.getElementById('explanation-text');
    const explanationOkBtn = document.getElementById('explanation-ok-btn');
    const errorToast = document.getElementById('error-toast');
    
    const achievementPopup = document.getElementById('achievement-popup');
    const congratsPopup = document.getElementById('congrats-popup');

    // ==========================================
    // 1. АВТОРИЗАЦИЯ И ИНИЦИАЛИЗАЦИЯ
    // ==========================================
    /**
 * Инициализация процесса авторизации в приложении.
 * Логика: ждет готовности Telegram.WebApp, затем отправляет данные на /api/auth.
 * На входе: ничего (использует глобальный объект window.Telegram).
 * На выходе: инициализирует профиль пользователя или запускает онбординг.
 */

    // async function startAuth() {
    //     console.log(new Date().toLocaleString(),`[CLIENT] [async function startAuth()] started`);
    //     if (!tg || !tg.initData) {
    //         // Если ТГ не прогрузился, ждем и пробуем еще раз (цикл 10 сек)
    //         console.log(new Date().toLocaleString(),`[CLIENT] [async function startAuth()] TG init data НЕ прогрузился`);
    //         let authAttempts = 0;
    //         const interval = setInterval(async () => {
    //             authAttempts++;
    //             if (window.Telegram?.WebApp?.initData) {
    //                 clearInterval(interval);
    //                 await performAuth(window.Telegram.WebApp);
    //             }
    //             if (authAttempts > 2) {
    //                 clearInterval(interval);
    //                 showBrowserStub();
    //             }
    //         }, 500);
    //     } else {
    //         console.log(new Date().toLocaleString(),`[CLIENT] [async function startAuth()] TG init data прогрузился`);
    //         await performAuth(tg);
    //     }
    // }

    // k92
    // async function startAuth() {
    //     console.log(new Date().toLocaleString(),`[CLIENT] [async function startAuth()] started`);
        
    //     // Проверяем наличие Telegram (опционально, для захвата tg_id)
    //     const tg = window.Telegram ? window.Telegram.WebApp : null;
        
    //     let tgId = null;
    //     if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    //         tgId = tg.initDataUnsafe.user.id; // Захват tg_id, если доступен
    //         console.log(new Date().toLocaleString(),`[CLIENT] [async function startAuth()] TG context detected, tg_id: ${tgId}`);
    //     } else {
    //         console.log(new Date().toLocaleString(),`[CLIENT] [async function startAuth()] No TG context`);
    //     }

    //     // Показываем форму авторизации по телефону (независимо от TG)
    //     showPhoneAuthForm(tgId);
    // }

    async function startAuth() {
        console.log(new Date().toLocaleString(), `[CLIENT] [startAuth] started`);
        
        // 1. Проверяем, вернулись ли мы после успешной авторизации по телефону
        // (FastAPI редиректил нас обратно с ?auth_success=true&phone=...)
        const urlParams = new URLSearchParams(window.location.search);
        // const authSuccess = urlParams.get('auth_success') === 'true';
        const returnedToken = urlParams.get('token');
        const returnedPhone = urlParams.get('phone_no');

        console.log(`token auth is: ${returnedToken}`);
        console.log(`phone is: ${returnedPhone}`);

        // await new Promise(resolve => setTimeout(resolve, 3000));  // 3000 = 3 секунды
        
        if (returnedPhone && returnedToken) {
            console.log('[CLIENT] Вернулись после успешной авторизации по телефону, phone:', returnedPhone);
        
            try {
                const authRes = await fetch('/api/auth-by-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: returnedToken, phone_no: returnedPhone })
                });
            
                if (!authRes.ok) {
                    throw new Error(`Ошибка /api/auth-by-token: ${authRes.status}`);
                }
            
                const userData = await authRes.json();

                console.log('userData below');
                console.log(userData);

                currentUser = userData;
                localStorage.setItem('userId', currentUser.id);
                localStorage.setItem('auth_token', userData.token);

                console.log(`token = ${userData.token}`);

                // Чистим URL от параметров авторизации
                window.history.replaceState({}, document.title, window.location.pathname);
            
                console.log('[CLIENT] Успешно получили юзера после авторизации по телефону');
                updateBalanceUI();
                updateBoostUI(userData.isBoostActive || false);
            
                if (userData.is_onboarded === false) {
                    showOnboardingIntro();
                } else {
                    initStartCard();
                    await loadQuestions();
                }
                return; // всё ок, дальше не идём
            } catch (err) {
                console.error('[CLIENT] Ошибка обработки возврата после авторизации:', err);
                showStyledAlert('Авторизация прошла, но не удалось загрузить профиль. Попробуйте войти заново.');
                // Можно продолжить и показать форму снова
            }
        }
    
        // 2. Проверяем обычный токен в localStorage
        const token = localStorage.getItem('auth_token');
    
        if (token) {
            console.log('[CLIENT] Найден токен в localStorage, проверяем через /api/me...');
            try {
                const res = await fetch('/api/me', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            
                if (res.ok) {
                    currentUser = await res.json();
                    console.log('[CLIENT] Авторизация по существующему токену успешна');
                    console.log(`!! THIS IS currentUser ${JSON.stringify(currentUser, null, 2)}`)
                    updateBalanceUI();
                    updateBoostUI(currentUser.isBoostActive || false);
                
                    if (currentUser.is_onboarded === false) {
                        showOnboardingIntro();
                    } else {
                        initStartCard();
                        await loadQuestions();
                    }
                    return;
                } else {
                    console.warn('[CLIENT] Токен недействителен, статус:', res.status);
                    localStorage.removeItem('auth_token');
                }
            } catch (err) {
                console.error('[CLIENT] Ошибка проверки токена:', err);
                localStorage.removeItem('auth_token');
            }
        }
    
        // 3. Нет ни валидного токена, ни возврата после авторизации → открываем форму
        console.log('[CLIENT] Нет токена и нет возврата после SMS → открываем форму авторизации');
        const returnUrl = encodeURIComponent(window.location.href);
        window.location.href = `https://gl-auth.0422.ru/?redirect=${returnUrl}`;
    }

    // k92
    // function showPhoneAuthForm() {
    //     console.log(new Date().toLocaleString(), `[CLIENT] [showPhoneAuthForm] started`);

    //     // Создаём экран авторизации динамически (как в твоём текущем коде)
    //     const authScreen = document.createElement('div');
    //     authScreen.id = 'auth-screen';
    //     authScreen.className = 'screen';
    //     authScreen.style.position = 'fixed';
    //     authScreen.style.inset = '0';
    //     authScreen.style.zIndex = '9999';
    //     authScreen.style.background = 'rgba(0,0,0,0.4)';
    //     authScreen.style.display = 'flex';
    //     authScreen.style.alignItems = 'center';
    //     authScreen.style.justifyContent = 'center';

    //     authScreen.innerHTML = `
    //         <div class="container" style="background: white; padding: 2rem; border-radius: 16px; max-width: 360px; width: 90%; box-shadow: 0 10px 30px rgba(0,0,0,0.25); text-align: center;">
    //             <h2>Авторизация по номеру телефона</h2>
    //             <input type="tel" id="phone-input" placeholder="+79xxxxxxxxx" pattern="\\+79\\d{9}" required style="width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box;">
    //             <button id="send-sms-btn" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Отправить код</button>
    //             <input type="text" id="code-input" placeholder="Код из SMS" class="hidden" maxlength="6" style="width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box;">
    //             <button id="verify-code-btn" class="hidden" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">Войти</button>
    //             <p id="auth-message" style="color: red; margin-top: 10px;"></p>
    //         </div>
    //     `;

    //     document.body.appendChild(authScreen);

    //     const phoneInput = document.getElementById('phone-input');
    //     const codeInput = document.getElementById('code-input');
    //     const sendBtn = document.getElementById('send-sms-btn');
    //     const verifyBtn = document.getElementById('verify-code-btn');
    //     const messageEl = document.getElementById('auth-message');

    //     // Опционально захватываем tgId, если есть (для передачи в Node.js)
    //     const tg = window.Telegram?.WebApp;
    //     const tgUser = tg?.initDataUnsafe?.user || null;

    //     sendBtn.onclick = async () => {
    //         const phone = phoneInput.value.trim();
    //         if (!phone.match(/^\+79\d{9}$/)) {
    //             messageEl.textContent = 'Неверный формат номера';
    //             return;
    //         }

    //         try {
    //             const res = await fetch('https://gl-auth.0422.ru/api/send-sms', {  // или твой прод URL
    //                 method: 'POST',
    //                 headers: { 'Content-Type': 'application/json' },
    //                 body: JSON.stringify({ phone })
    //             });

    //             if (res.ok) {
    //                 messageEl.textContent = 'SMS отправлена';
    //                 codeInput.classList.remove('hidden');
    //                 verifyBtn.classList.remove('hidden');
    //                 sendBtn.disabled = true;
    //             } else {
    //                 const err = await res.json();
    //                 messageEl.textContent = err.detail || 'Ошибка отправки SMS';
    //             }
    //         } catch (err) {
    //             console.error('[CLIENT] Ошибка отправки SMS:', err);
    //             messageEl.textContent = 'Ошибка соединения';
    //         }
    //     };

    //     verifyBtn.onclick = async () => {
    //         const phone = phoneInput.value.trim();
    //         const code = codeInput.value.trim();
    //         if (!code) {
    //             messageEl.textContent = 'Введите код';
    //             return;
    //         }

    //         try {
    //             const res = await fetch('https://gl-auth.0422.ru/api/verify-code', {  // или твой прод URL
    //                 method: 'POST',
    //                 headers: { 'Content-Type': 'application/json' },
    //                 body: JSON.stringify({ phone, code })
    //             });

    //             if (res.ok) {
    //                 messageEl.textContent = 'Код верный! Авторизация...';

    //                 // Теперь вызываем Node.js для создания/обновления юзера и получения финального токена + данных
    //                 const authRes = await fetch('/api/auth', {
    //                     method: 'POST',
    //                     headers: { 'Content-Type': 'application/json' },
    //                     body: JSON.stringify({
    //                         phone_no: phone,
    //                         tg_id: tgUser?.id || null,
    //                         username: tgUser?.username || null
    //                     })
    //                 });

    //                 if (authRes.ok) {
    //                     const userData = await authRes.json();
    //                     currentUser = userData;
    //                     localStorage.setItem('auth_token', userData.token);
    //                     authScreen.remove();  // Убираем форму
    //                     updateBalanceUI();
    //                     updateBoostUI(userData.isBoostActive || false);
    //                     if (userData.is_onboarded === 0) {
    //                         showOnboardingIntro();
    //                     } else {
    //                         initStartCard();
    //                         await loadQuestions();
    //                     }
    //                 } else {
    //                     const err = await authRes.json();
    //                     messageEl.textContent = err.error || 'Ошибка авторизации';
    //                 }
    //             } else {
    //                 const err = await res.json();
    //                 messageEl.textContent = err.detail || 'Неверный код';
    //             }
    //         } catch (err) {
    //             console.error('[CLIENT] Ошибка верификации:', err);
    //             messageEl.textContent = 'Ошибка соединения';
    //         }
    //     };
    // }

/**
 * ЗАЧЕМ НУЖНА: 
 * Устанавливает связь между Telegram-интерфейсом и твоим сервером. 
 * Если авторизация успешна, она определяет "точку входа": 
 * новичков отправляет на квалификацию, а опытных — к карте дня. 
 * Также она активирует визуальные эффекты "Буста", если пользователь заслужил их утром.
 */
    // async function performAuth(tgObj) {
    //     console.log(new Date().toLocaleString(),`[CLIENT] [async function performAuth] started`);
    //     try {
    //         console.log(new Date().toLocaleString(),`[CLIENT] [async function performAuth] trying to fetch [/api/auth]`);
    //         const res = await fetch('/api/auth', {
    //             method: 'POST',
    //             headers: { 'Content-Type': 'application/json' },
    //             body: JSON.stringify({ initData: tgObj.initData })
    //         });
    //         if (!res.ok) throw new Error("Auth Server Error");
            
    //         currentUser = await res.json();
    //         console.table(currentUser);
            
    //         // Настройка UI после входа
    //         updateBalanceUI();
    //         updateBoostUI(currentUser.isBoostActive);

    //         if (currentUser.is_onboarded === 0) {
    //             // Если новый юзер — сразу в онбординг
    //             console.log(new Date().toLocaleString(),`[CLIENT] [async function performAuth] NEW USER > ONBOARDING`);
    //             startScreen.classList.add('hidden');
    //             showOnboardingIntro();
    //         } else {
    //             // Если старый — показываем карту настроя
    //             console.log(new Date().toLocaleString(),`[CLIENT] [async function performAuth] OLD USER`);
    //             initStartCard();
    //             await loadQuestions();
    //         }
    //     } catch (e) {
    //         console.error(new Date().toLocaleString(),`[CLIENT] [async function performAuth] ERROR`);
    //         if (questionTextEl) questionTextEl.textContent = "Ошибка связи с сервером. Перезапустите приложение.";
    //     }
    // }

    // function showBrowserStub() {
    //     console.log(new Date().toLocaleString(),`[CLIENT] [function showBrowserStub()] started`);
    //     document.body.innerHTML = `
    //         <div style="padding:40px 20px; background:#111; color:#eee; min-height:100vh; font-family:monospace;">
    //             <h2>DEV MODE — без Telegram</h2>
    //             <p>UUID: 04fb8901-14eb-44a5-96e7-7b505b317eee</p>
    //             <!-- <input тут вводим UUID, на основе которого запращиваем объект и данные пользователя> -->
    //             <input type="text" id="userUUID" style="width:100%; max-width:400px; padding:8px; font-size:16px;">
    //             <br><br>
    //             <button id="checkBtn" style="padding:10px 24px; font-size:16px;">Проверить</button>
    //             <br><br>
    //             <a href="https://t.me/kurazh_sales_dev_bot" style="color:#007aff;text-decoration:none;margin-top:20px;padding:10px 20px;border:1px solid #007aff;border-radius:10px;">ТЕЛЕГА</a>
    //             <a href="https://gl-auth.0422.ru/" style="color:#007aff;text-decoration:none;margin-top:20px;padding:10px 20px;border:1px solid #007aff;border-radius:10px;">ВОЙТИ ПО ТЕЛЕФОНУ</a>
    //             <div id="result" style="margin-top:20px; white-space:pre-wrap; word-break:break-all;"></div>
    //         </div>
    //     `;
        
    //     document.getElementById('checkBtn').onclick = async () => {
    //         console.log(new Date().toLocaleString(),`[CLIENT] [document.getElementById('checkBtn').onclick] started`);
    //         const uuid = document.getElementById('userUUID').value.trim();
    //         const result = document.getElementById('result');
        
    //         if (!uuid) {
    //             result.innerHTML = '→ Введи UUID';
    //             return;
    //         }
        
    //         result.innerHTML = '→ Отправляю запрос...';
        
    //         try {
    //             console.log(new Date().toLocaleString(),`[CLIENT] [document.getElementById('checkBtn').onclick] trying to fetch [/api/get_user_by_uuid]: /api/get_user_by_uuid?clientUUID=${encodeURIComponent(uuid)}`);
    //             const res = await fetch(`/api/get_user_by_uuid?clientUUID=${encodeURIComponent(uuid)}`, {
    //                 method: 'GET'
    //             });
            
    //             const text = await res.text();
            
    //             if (res.ok) {
    //                 try {
    //                     console.log(new Date().toLocaleString(),`[CLIENT] [document.getElementById('checkBtn').onclick] res is ok after fetching. Trying to parse response.`);
    //                     const data = JSON.parse(text);
    //                     const pretty = JSON.stringify(data, null, 2);
    //                     result.innerHTML = `→ OK, DB_ID = ${data.id ?? 'нет поля id'} <br><br><pre style="background:#222; padding:12px; border-radius:6px; overflow:auto; max-height:400px;">${pretty}</pre>`;
    //                     console.log(new Date().toLocaleString(),`[CLIENT] [document.getElementById('checkBtn').onclick] response is parsed, everything is ok.`);
    //                 } catch {
    //                     console.log(new Date().toLocaleString(),`[CLIENT] [document.getElementById('checkBtn').onclick] res is ok after fetching, but response is not a JSON. text = ${text}`);
    //                     result.innerHTML = `→ Ответ не JSON:\n${text}`;
    //                 }
    //             } else {
    //                 console.log(new Date().toLocaleString(),`[CLIENT] [document.getElementById('checkBtn').onclick] res is not ok after fetching. res = ${res}`);
    //                 result.innerHTML = `→ Ошибка ${res.status} (${res.statusText})\n${text}`;
    //             }
    //         } catch (err) {
    //             console.error(new Date().toLocaleString(),`[CLIENT] [document.getElementById('checkBtn').onclick] → Fetch упал: ${err.message}\n(сервер запущен? CORS ок? URL верный?)`);
    //             result.innerHTML = `→ Fetch упал: ${err.message}\n(сервер запущен? CORS ок? URL верный?)`;
    //         }
    //     };
    // }

    startAuth();  // k92 важная часть, никуда не удалять

    // ==========================================
    // 2. ЛОГИКА ОНБОРДИНГА
    // ==========================================
/**
 * ЗАЧЕМ НУЖНА: 
 * Создает "момент вовлечения" для нового игрока. Мы не бросаем его сразу в тесты, 
 * а объясняем ценность: что мы подбираем программу под его уровень. 
 * Это снижает стресс и повышает вероятность того, что пользователь пройдет тест до конца.
 */
    function showOnboardingIntro() {
        console.log('[CLIENT] showOnboardingIntro started')
        if (startScreen) {
            startScreen.classList.add('hidden');   // или startScreen.style.display = 'none';
            console.log('[CLIENT] start-screen спрятан после авторизации');
        }
        isOnboardingMode = true;
        const nav = document.querySelector('.bottom-nav');
        pretty_nav = JSON.stringify(nav, null, 2);
        console.log(`[CLIENT] showOnboardingIntro nav=${nav}`)
        if (nav) nav.style.display = 'none';

        questionTextEl.innerHTML = `<div style="font-weight:800; font-size: 20px;">Добро пожаловать, ${currentUser.username}!</div>
        <p style="margin-top:15px;">Чтобы подобрать для тебя идеальную программу, пройди квалификационный тест из 15 кейсов.</p>`;
        
        answerCards.forEach(card => card.style.display = 'none');
        
        const startTestBtn = document.createElement('button');
        startTestBtn.className = 'answer-button';
        startTestBtn.style.textAlign = 'center';
        startTestBtn.style.background = '#58cc02';
        startTestBtn.style.color = 'white';
        startTestBtn.style.borderColor = '#46a302';
        startTestBtn.textContent = 'Начать проверку знаний';
        
        startTestBtn.onclick = async () => {
            startTestBtn.remove();
            answerCards.forEach(btn => btn.style.display = 'block');
            await startOnboardingFlow();
        };
        document.querySelector('.answer-options').appendChild(startTestBtn);
    }

    async function startOnboardingFlow() {
        console.log('[CLIENT] startOnboardingFlow started')
        try {
            const res = await fetch('/api/onboarding/questions');
            mainQuestions = await res.json();
            questionIndex = 0;
            displayQuestion();
        } catch (e) { console.error("Onboarding fetch error"); }
    }
/**
 * ЗАЧЕМ НУЖНА: 
 * Финализирует диагностику навыков. Отправляет массив ответов на сервер 
 * и мгновенно меняет статус игрока. Результат (например, "Ты — Практик") 
 * сразу же отображается пользователю, создавая первый успех в приложении.
 */
    async function finishOnboarding() {
        console.log('[CLIENT] finishOnboarding started')
        try {
            questionTextEl.textContent = "Обработка результатов...";
            const res = await fetch('/api/onboarding/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id, answers: onboardingAnswers })
            });
            const result = await res.json();
            
            showExplanationPopup(`Твой уровень: ${result.title}! Навыки определены. Начинаем основную тренировку!`, () => {
                location.reload();
            });
        } catch (e) { location.reload(); }
    }

    // ==========================================
    // 3. ОСНОВНАЯ ЛОГИКА ТРЕНАЖЕРА
    // ==========================================
/**
 * ЗАЧЕМ НУЖНА: 
 * Реализует психологический ритуал "Метафорическая карта". 
 * Это геймифицированный способ настроить продавца на рабочий лад. 
 * Случайная карта дня заменяет скучное приветствие и делает каждый вход в бота уникальным.
 */
    function initStartCard() {
        console.log(new Date().toLocaleString(),`[CLIENT] [function initStartCard()] NEW USER > METACARD`);
        // Показываем стартовый экран
        if (startScreen) {
            startScreen.classList.remove('hidden');
            startScreen.style.display = 'flex'; // или 'block' — в зависимости от твоего CSS
            console.log('[CLIENT] start-screen показан в initStartCard');
        }

        const randomCard = Math.floor(Math.random() * 53) + 1;
        const frontImg = document.getElementById('metacard-front-img');
        if (frontImg) frontImg.src = `start_img/metacard_start%20${randomCard}.jpeg`;

        const startBtn = document.getElementById('start-btn');
        const flipCard = document.getElementById('flip-card');
        let isFlipped = false;

        if (startBtn && flipCard) {
            startBtn.onclick = () => {
                if (!isFlipped) {
                    flipCard.classList.add('flipped');
                    startBtn.textContent = "Начать тренировку";
                    isFlipped = true;
                } else {
                    startScreen.classList.add('hidden');
                }
            };
        }
    }
/**
 * ЗАЧЕМ НУЖНА: 
 * Загружает ежедневный контент. Если пользователь уже выполнил норму (10 вопросов), 
 * функция блокирует интерфейс и выводит сообщение о "выполненной норме". 
 * Это ограничивает чрезмерное потребление контента и заставляет возвращаться завтра.
 */
    async function loadQuestions() {
        console.log('[CLIENT] loadQuestions started')
        // Прячем стартовый экран (он больше не должен торчать)
        try {
            console.log(new Date().toLocaleString(),`[CLIENT] [async function loadQuestions()] started`);
            console.log(new Date().toLocaleString(),`[CLIENT] [async function performAuth] trying to fetch [/api/questions]: /api/questions?userId=${currentUser.id}&level=${currentUser.level}`);
            const res = await fetch(`/api/questions?userId=${currentUser.id}&level=${currentUser.level}`);
            if (res.status === 403) {
                console.log('[CLIENT] loadQuestions res status = 403');
                questionTextEl.innerHTML = `<div style="text-align:center;">🏆<br><b>Дневная норма выполнена!</b><br><p style="font-size:14px; color:#666; margin-top:10px;">Твои клиенты отдыхают. Возвращайся завтра за новой порцией Куража!</p></div>`;
                document.querySelector('.answer-options').style.display = 'none';
                return;
            }
            console.log('[CLIENT] loadQuestions res status != 403')
            mainQuestions = await res.json();
            const pretty_mainQuestions = JSON.stringify(mainQuestions, null, 2);
            console.log(`[CLIENT] loadQuestions ${pretty_mainQuestions}`);
            questionIndex = 0;
            displayQuestion();
        } catch (e) {
            console.error(e);
            questionTextEl.textContent = "Не удалось загрузить вопросы.";
        }
    }
/**
 * Отрисовка текущего вопроса (универсальная для тестов и квалификации).
 * Логика: парсит options_json или классические варианты A/B/C/D, создает кнопки.
 * На входе: использует глобальный массив mainQuestions и индекс questionIndex.
 * На выходе: обновляет DOM-элементы карточки вопроса и кнопок.
 */
    function displayQuestion() {
        console.log('[CLIENT] displayQuestion() → ЗАПУСК');
        console.log(' → Текущий questionIndex:', questionIndex);
        console.log(' → isRetestPhase:', isRetestPhase);
        console.log(' → mainQuestions.length:', mainQuestions.length);
        console.log(' → questionsForRetest.length:', questionsForRetest.length);

        attempts = 0;
        console.log(' → attempts сброшены до 0');

        const list = isRetestPhase ? questionsForRetest : mainQuestions;
        console.log(' → Выбран список вопросов:', isRetestPhase ? 'questionsForRetest' : 'mainQuestions');
        console.log(' → Длина текущего списка:', list.length);

        if (questionIndex >= list.length) {
            console.log(' → Вопросы закончились');
            if (!isRetestPhase && questionsForRetest.length > 0) {
                startRetestPhase();
            } else {
                showSummaryScreen();
            }
            return;
        }

        const q = list[questionIndex];
        console.log(' → Текущий вопрос:', q);

        // Устанавливаем текст вопроса
        if (questionTextEl) {
            const questionText = isRetestPhase
                ? `РАБОТА НАД ОШИБКАМИ:\n${q.problem || q.question_text || 'нет текста'}`
                : (q.problem || q.question_text || 'нет текста');

            questionTextEl.textContent = questionText;
            console.log(' → Текст вопроса установлен:', questionText);
        }

        // Подготавливаем варианты ответов
        let options = [];
        if (q.options_json) {
            try {
                options = typeof q.options_json === 'string'
                    ? JSON.parse(q.options_json)
                    : q.options_json;
                console.log(' → Используем options_json');
            } catch (e) {
                console.error(' → Ошибка парсинга options_json:', e);
                options = [];
            }
        } else {
            // Старый формат: option_a, option_b, option_c, option_d
            options = [
                q['option_a'],
                q['option_b'],
                q['option_c'],
                q['option_d']
            ];
            console.log(' → Собираем варианты из option_a/b/c/d');
        }

        const keys = ['A', 'B', 'C', 'D'];

        // Обновляем ссылки на карточки (на случай изменений в DOM)
        answerCards = document.querySelectorAll('.answer-card');

        // Заполняем карточки
        answerCards.forEach((card, i) => {
            const optionText = options[i];
            const textEl = card.querySelector('.answer-text');

            if (optionText && optionText !== null && optionText !== '' && optionText !== 'null') {
                textEl.textContent = optionText;
                card.dataset.key = keys[i];
                card.dataset.index = i;
                card.style.display = 'flex';
		card.disabled = false;//alexmay добавил 2026-04-10. 
				    // Решаемая проблема - при клике на неправильный ответ карточка 
				    // дизеблилась и не получала клики. со временем все карты переставали их получать
				    // добавил явное указание, что карта енейблена при отрисовке
		console.log ('PRN 684 alex,ay SETTING CARD TO ENABLED');
                card.classList.remove('correct', 'incorrect'); // сбрасываем подсветку
                console.log(` → Карточка ${keys[i]} запонена: ${optionText.substring(0, 50)}...`);
            } else {
                card.style.display = 'none';
                console.log(` → Карточка ${keys[i]} скрыта (нет текста)`);
            }
        });

        updateProgressBar();

        // Прикрепляем обработчики кликов к новым карточкам
        attachAnswerListeners();

        console.log('[CLIENT] displayQuestion() → ЗАВЕРШЕНО');
    }

    // Обработчик кликов по новым карточкам
    function attachAnswerListeners() {
        answerCards = document.querySelectorAll('.answer-card'); // обновляем ссылки
    
        answerCards.forEach(card => {
            card.onclick = async () => {
		console.log('PRN 703 alexmay ANSWER CLICK  FIRED');
                if (card.style.display === 'none' || card.disabled) {
								    console.log('PRN 705 alexmay CARD DISABLED doing RETURN');
								    return;
								    }
            
                const key = card.dataset.key;
            
                if (isOnboardingMode) {
                    const q = mainQuestions[questionIndex];
                    onboardingAnswers[q.id] = parseInt(card.dataset.index);
                    questionIndex++;
                    if (questionIndex >= mainQuestions.length) {
                        finishOnboarding();
                    } else {
                        displayQuestion();
                    }
                    return;
                }
            
                if (isRetestPhase) {
                    await handleRetestAnswer(key, card);
                } else {
                    await handleMainAnswer(key, card);
                }
            };
        });
}
/**
 * ЗАЧЕМ НУЖНА: 
 * Сердце игровой механики. Обрабатывает нажатие на ответ в реальном времени. 
 * Если ответ верный с первой попытки — дарит максимум очков и дофамина. 
 * Если неверный — дает второй шанс, стимулируя пользователя прочитать варианты внимательнее.
 */
    async function handleMainAnswer(key, btn) {
        console.log('[CLIENT] handleMainAnswer started')
        attempts++;
        const q = mainQuestions[questionIndex];
        const isCorrect = (key === q['correct_answer']);

        if (isCorrect) {
            btn.classList.add('correct');
            sessionScore += (attempts === 1) ? 15 : 5;
            if (attempts === 1) correctFirstTryCount++;
            
            const res = await submitToDB(q.id, key, attempts);
            currentUser.balance = res.newBalance;
            currentUser.total_score = res.newTotalScore; // <--- ДОБАВЬ ЭТУ СТРОКУ
            updateBalanceUI();
            
            setTimeout(() => showExplanationPopup(res.explanation, () => {
                questionIndex++;
                displayQuestion();
            }), 500);
        } else {
            btn.classList.add('incorrect');
	    console.log ('PRN 760 alexmay setting CARD DISABLED');
            btn.disabled = true;
            if (attempts < 2) {
                showErrorToast();
            } else {
                questionsForRetest.push(q);
                answerCards.forEach(b => {
                    if (b.dataset.key === q['correct_answer']) b.classList.add('correct');
                    b.disabled = true;
                });
                const res = await submitToDB(q.id, key, attempts);
                setTimeout(() => showExplanationPopup(res.explanation, () => {
                    questionIndex++;
                    displayQuestion();
                }), 500);
            }
        }
    }

    async function handleRetestAnswer(key, btn) {
        const q = questionsForRetest[questionIndex];
        const isCorrect = (key === q['correct_answer']);
        answerCards.forEach(b => b.disabled = true);

        if (isCorrect) {
            btn.classList.add('correct');
        } else {
            btn.classList.add('incorrect');
            answerCards.forEach(b => { if (b.dataset.key === q['correct_answer']) b.classList.add('correct'); });
            sessionScore -= 10;
            const penRes = await fetch('/api/penalize', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({userId: currentUser.id}) });
            const penData = await penRes.json();
            currentUser.balance = penData.newBalance;
            currentUser.total_score = penData.newTotalScore; // Добавили эту строку
            updateBalanceUI();
        }

        setTimeout(() => showExplanationPopup(q['explanation'], () => {
            questionIndex++;
            displayQuestion();
        }), 500);
    }

    async function submitToDB(qId, ans, att) {
        const r = await fetch('/api/submit', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId: currentUser.id, questionId: qId, answer: ans, attemptNumber: att })
        });
        return r.json();
    }

    function startRetestPhase() {
        isRetestPhase = true;
        questionIndex = 0;
        showExplanationPopup("Теперь поработаем над ошибками. У тебя одна попытка на каждый кейс.", displayQuestion);
    }

    // ==========================================
    // 4. МОДУЛИ: РЕЙТИНГ, ИСТОРИЯ, ПРОФИЛЬ
    // ==========================================

    async function navigateTo(screenId) {
        screens.forEach(s => s.classList.add('hidden'));
        const target = document.getElementById(screenId);
        if (target) target.classList.remove('hidden');

        navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.target === screenId));

        if (screenId === 'rating-screen') await loadRating('weekly');
        if (screenId === 'history-screen') await loadHistory();
        if (screenId === 'profile-screen') await loadProfile();
    }

    // ==========================================
    // BOTTOM NAVIGATION — ИЗМЕНЁННАЯ ВЕРСИЯ (кнопка "Рейтинг" → сразу командный)
    navButtons.forEach(btn => {
        btn.onclick = () => {
            const target = btn.dataset.target;

            // Специальная логика для кнопки "Рейтинг"
            if (target === 'rating-screen') {
                const teamUuid = currentUser?.team_uuid || DEFAULT_TEAM_UUID;
                const teamName = currentUser?.team_name || DEFAULT_TEAM_NAME;

                navigateTo('rating-screen');

                // Небольшая задержка, чтобы экран успел показаться
                setTimeout(() => {
                    showTeamRating(teamUuid, teamName);
                }, 50);

                return; // выходим, чтобы не выполнять обычный navigateTo
            }

            // Для остальных экранов — стандартное поведение
            navigateTo(target);
        };
    });

    // --- ОЖИВЛЯЕМ ТАБЫ В РЕЙТИНГЕ ---
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => {
        btn.onclick = () => {
            // Убираем активный класс у всех
            tabButtons.forEach(b => b.classList.remove('active'));
            // Добавляем нажатому
            btn.classList.add('active');
            
            const tabType = btn.dataset.tab; // 'weekly' или 'all-time'
            loadRating(tabType);
        };
    });
/**
 * Загрузка и рендеринг таблицы лидеров.
 * Логика: запрашивает данные по типу (weekly/all-time), подсвечивает игрока в списке,
 * настраивает IntersectionObserver для управления липкой плашкой "Вы".
 * @param {string} type - Тип рейтинга ('weekly' или 'all-time').
 */
    async function loadRating(type) {
        const list = document.getElementById('leaderboard-list');
        const tabContainer = document.querySelector('.tabs-container');
        if (tabContainer) {
            tabContainer.style.display = 'flex';
        }
        const stickyContainer = document.getElementById('user-position-container');
        // === НОВАЯ СТРОКА: УДАЛЯЕМ КНОПКУ "ОБЩИЙ РЕЙТИНГ", если она есть ===
        const oldGeneralBtn = document.getElementById('show-general-rating-btn');
        if (oldGeneralBtn) {
            oldGeneralBtn.parentElement.remove();
        }
        list.innerHTML = '<div style="padding:20px; text-align:center;">Загрузка...</div>';
        
        const descEl = document.getElementById('leaderboard-description');
        if (type === 'weekly') {
        descEl.textContent = "Топ игроков по заработанному опыту за текущую неделю";
        } else {
        descEl.textContent = "Легенды тренажера: лучшие из лучших за всю историю";
        }

        try {
            const res = await fetch(`/api/rating?type=${type}&userId=${currentUser.id}`);
            const data = await res.json();
            
            // 1. Отрисовываем основной список
            list.innerHTML = data.leaderboard.map(u => {
                const isMe = u.id === currentUser.id;
                
                // Если это я, добавляем спец-класс для золотой подсветки и ID для слежки
                const itemAttr = isMe 
                    ? 'id="me-in-list" class="leaderboard-item in-list-highlight"' 
                    : 'class="leaderboard-item"';
                
                return `
                    <li ${itemAttr}>
                        <div class="rank">${u.rank}</div>
                        <div class="avatar">${u.username.charAt(0).toUpperCase()}</div>
                        <div class="username">${u.username}</div>
                        <div class="score">${u.score} <span class="score-label">${type==='weekly'?'XP':'К'}</span></div>
                    </li>
                `;
            }).join('');

            // 2. Настраиваем липкую плашку
            if (data.userRank) {
                const u = data.userRank;
                stickyContainer.innerHTML = `
                    <div class="user-sticky-card">
                        <div class="rank">${u.rank}</div>
                        <div class="avatar">${u.username.charAt(0).toUpperCase()}</div>
                        <div class="username">${u.username} (Вы)</div>
                        <div class="score">${u.score} <span class="score-label">${type==='weekly'?'XP':'К'}</span></div>
                    </div>
                `;

                // 3. Логика появления/исчезновения
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            // Тебя видно в списке — прячем плашку
                            stickyContainer.classList.remove('visible');
                            stickyContainer.classList.add('hidden');
                        } else {
                            // Ты ушел со страницы — показываем плашку
                            stickyContainer.classList.add('visible');
                            stickyContainer.classList.remove('hidden');
                        }
                    });
                }, { 
                    threshold: 0.5, // Плашка исчезнет, когда ты увидишь себя хотя бы наполовину
                    rootMargin: '0px 0px -100px 0px' // Учитываем высоту нижнего меню
                });

                const myRow = document.getElementById('me-in-list');
                if (myRow) observer.observe(myRow);
            }

        } catch(e) { 
            list.innerHTML = '<div style="padding:20px; text-align:center;">Ошибка загрузки рейтинга.</div>'; 
            console.error(e);
        }
    }
    /**
 * ЗАЧЕМ НУЖНА: 
 * Инструмент рефлексии. Позволяет продавцу разобрать свои ошибки прошлых дней. 
 * Мы показываем не просто "правильно/неправильно", а подробное пояснение к каждому кейсу, 
 * превращая историю ответов в персональную базу знаний.
 */
    async function loadHistory() {
        const list = document.getElementById('history-list');
        try {
            const res = await fetch(`/api/history?userId=${currentUser.id}`);
            const data = await res.json();
            document.getElementById('history-total').textContent = data.stats.total;
            document.getElementById('history-accuracy').textContent = data.stats.accuracy + '%';
            
            list.innerHTML = data.history.map(h => `
                <div class="history-card ${h.is_correct ? 'correct' : 'incorrect'}" onclick="this.classList.toggle('expanded')">
                    <div class="history-header">
                        <div class="history-question-preview">${h.question_text.substring(0, 50)}...</div>
                        <div>${h.is_correct ? '✅' : '❌'}</div>
                    </div>
                    <div class="history-details">
                        <p><b>Вопрос:</b> ${h.question_text}</p>
                        <p><b>Правильно:</b> ${h.correct_option}</p>
                        <p><b>Пояснение:</b> ${h.explanation}</p>
                    </div>
                </div>
            `).join('');
        } catch(e) { console.error("History load error"); }
    }

    // ==================== СТИЛИЗОВАННЫЙ ALERT (БЕЗ КАРТИНКИ) ====================
    function showStyledAlert(message, callback = null) {
        const overlay = document.getElementById('styled-alert-overlay');
        const textEl  = document.getElementById('styled-alert-text');
        const okBtn   = document.getElementById('styled-alert-ok-btn');

        textEl.textContent = message;
        overlay.classList.remove('hidden');

        const closeHandler = () => {
            overlay.classList.add('hidden');
            okBtn.removeEventListener('click', closeHandler);
            if (callback) callback();
        };

        okBtn.addEventListener('click', closeHandler);
    }

    // ==================== СТИЛИЗОВАННЫЙ CONFIRM (БЕЗ КАРТИНКИ) ====================
    function showStyledConfirm(message, onYes, onNo = null) {
        const overlay = document.getElementById('styled-alert-overlay');
        const textEl  = document.getElementById('styled-alert-text');
        const popup   = overlay.querySelector('.explanation-popup'); // основной контейнер

        if (!popup) {
            console.error('styled-alert-overlay: .explanation-popup не найден');
            return;
        }

        // Сбрасываем всё к чистому состоянию
        textEl.textContent = message;
        overlay.classList.remove('hidden');

        // Удаляем ВСЕ старые кнопки (чтобы не плодились)
        const oldButtons = popup.querySelectorAll('button');
        oldButtons.forEach(btn => btn.remove());

        // ───── Кнопка «Да» ─────
        const yesBtn = document.createElement('button');
        yesBtn.textContent = 'Да';
        yesBtn.className = 'promo-action-btn btn-green';
        yesBtn.style.marginBottom = '12px';

        // ───── Кнопка «Нет» ─────
        const noBtn = document.createElement('button');
        noBtn.textContent = 'Нет';
        noBtn.className = 'promo-action-btn btn-blue';

        const closeOverlay = () => {
            overlay.classList.add('hidden');
        };

        yesBtn.onclick = () => {
            closeOverlay();
            if (onYes) onYes();
        };

        noBtn.onclick = () => {
            closeOverlay();
            if (onNo) onNo();
        };

        // Добавляем кнопки в попап
        popup.appendChild(yesBtn);
        popup.appendChild(noBtn);
    }

    // async function loadProfile() {
    //     try {
    //         const res = await fetch(`/api/profile?userId=${currentUser.id}`);
    //         const data = await res.json();
    //         document.getElementById('profile-username').textContent = data.profile.username;
    //         document.getElementById('profile-level').textContent = data.profile.level;
    //         document.getElementById('profile-streak').textContent = data.profile.streak;
    //         document.getElementById('profile-avatar').textContent = data.profile.username.charAt(0).toUpperCase();

    //         const grid = document.getElementById('achievements-grid');
    //         grid.innerHTML = data.achievements.map(a => `
    //             <div class="achievement-item ${a.unlocked ? 'unlocked' : 'locked'}" onclick="alert('${a.title}: ${a.description}')">
    //                 <div class="ach-icon-wrapper">${a.icon}</div>
    //                 <div class="ach-name">${a.title}</div>
    //             </div>
    //         `).join('');
    //     } catch(e) { console.error("Profile load error"); }
    // }

    async function loadProfile() {
        try {
            const res = await fetch(`/api/profile?userId=${currentUser.id}`);
            const data = await res.json();

            document.getElementById('profile-username').textContent = data.profile.username;
            document.getElementById('profile-team-name').textContent = data.profile.team_name;
            document.getElementById('profile-level').textContent = data.profile.level;
            document.getElementById('profile-streak').textContent = data.profile.streak;
            document.getElementById('profile-avatar').textContent = data.profile.username.charAt(0).toUpperCase();

            const grid = document.getElementById('achievements-grid');

            // === НОВЫЙ КОД: клик по названию команды ===
            const teamNameEl = document.getElementById('profile-team-name');

            if (teamNameEl) {
                // Убираем старый текст "Личный профиль" если команда есть
                if (data.profile.team_name && data.profile.team_name !== 'Личный профиль') {
                    teamNameEl.textContent = data.profile.team_name;

                    // Добавляем обработчик клика
                    teamNameEl.onclick = () => {
                        showTeamRating(data.profile.team_uuid, data.profile.team_name);
                    };
                } else {
                    teamNameEl.textContent = 'Личный профиль';
                    teamNameEl.style.cursor = 'default';
                    teamNameEl.onclick = null;
                }
            }

            // ====================== КНОПКА "СВЯЗАТЬ ПРОФИЛЬ С MAX" ======================
            const connectMaxBtn = document.getElementById('connect-max-btn');
            const maxStatusEl = document.getElementById('connect-max-status');
            const maxConnectBlock = document.getElementById('max-connect-block');

            if (connectMaxBtn && maxConnectBlock && currentUser && currentUser.member_uuid) {
                maxConnectBlock.style.display = 'block';
            
                if (data.profile.max_user_id || currentUser.max_user_id) {
                    // Уже привязан
                    connectMaxBtn.style.display = 'none';
                    maxStatusEl.innerHTML = `✅ Уже привязано к MAX<br><small>ID: ${data.profile.max_user_id || currentUser.max_user_id}</small>`;
                    maxStatusEl.style.color = '#28a745';
                } else {
                    // Кнопка активна — ПРЯМОЙ ПЕРЕХОД
                    connectMaxBtn.style.display = 'block';
                    maxStatusEl.style.display = 'none';
                
                    connectMaxBtn.onclick = () => {
                        const botUsername = 'id027755107459_bot';
                        const deepLink = `https://max.ru/${botUsername}?start=member-uuid_${currentUser.member_uuid}`;
                    
                        // Прямое открытие deep link в MAX
                        window.open(deepLink, '_blank');
                    
                        maxStatusEl.innerHTML = '🔄 Переходим в MAX Messenger...';
                        maxStatusEl.style.color = '#3b82f6';
                    };
                }
            }

            // 1. Генерируем HTML БЕЗ onclick
            grid.innerHTML = data.achievements.map(a => `
                <div class="achievement-item ${a.unlocked ? 'unlocked' : 'locked'}"
                     data-title="${escapeHtml(a.title)}"
                     data-desc="${escapeHtml(a.description)}">
                    <div class="ach-icon-wrapper">${a.icon}</div>
                    <div class="ach-name">${a.title}</div>
                </div>
            `).join('');

            // 2. Навешиваем обработчики уже после того, как элементы появились в DOM
            grid.querySelectorAll('.achievement-item').forEach(item => {
                item.addEventListener('click', () => {
                    const title = item.dataset.title;
                    const desc  = item.dataset.desc;
                    if (title && desc) {
                        showStyledAlert(`${title}: ${desc}`);
                    }
                });
            });

        } catch(e) {
            console.error("Profile load error", e);
        }
    }

    /**
     * Показывает рейтинг только по команде
     */
    async function showTeamRating(teamUuid, teamName) {
        if (!teamUuid) {
            showStyledAlert("У тебя пока нет команды");
            return;
        }

        await navigateTo('rating-screen');

        // Скрываем вкладки
        const tabContainer = document.querySelector('.tabs-container');
        if (tabContainer) tabContainer.style.display = 'none';

        const list = document.getElementById('leaderboard-list');
        const descEl = document.getElementById('leaderboard-description');
        const stickyContainer = document.getElementById('user-position-container');

        // <button id="team-back-btn" 
        //         style="background: none; border: none; font-size: 24px; cursor: pointer; padding: 4px 8px; color: #666;">
        //     ←
        // </button>

        // Новый красивый заголовок с кнопкой Назад
        descEl.innerHTML = `
        <center>
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <div>
                    <strong style="font-size: 18px;">Команда «${teamName}»</strong><br>
                    <small style="color: #666;">Рейтинг участников команды</small>
                </div>
            </div>
        </center>
        `;

        list.innerHTML = '<div style="padding:40px;text-align:center;color:#888;">Загрузка...</div>';

        try {
            const res = await fetch(`/api/rating?type=team&teamUuid=${teamUuid}&userId=${currentUser.id}`);
            const data = await res.json();

            if (!data.leaderboard || data.leaderboard.length === 0) {
                list.innerHTML = `<div style="padding:40px;text-align:center;color:#666;">В команде пока никто не тренировался</div>`;
                return;
            }

            list.innerHTML = data.leaderboard.map(u => {
                const isMe = u.id === currentUser.id;
                const avatarLetter = (u.username && u.username.length > 0) 
                    ? u.username.charAt(0).toUpperCase() 
                    : '?';

                return `
                    <li ${isMe ? 'id="me-in-list" class="leaderboard-item in-list-highlight"' : 'class="leaderboard-item"'}>
                        <div class="rank">${u.rank}</div>
                        <div class="avatar">${avatarLetter}</div>
                        <div class="username">${u.username}</div>
                        <div class="score">${u.score} <span class="score-label">К</span></div>
                    </li>
                `;
            }).join('');

            // Липкая плашка
            if (data.userRank) {
                const u = data.userRank;
                const avatarLetter = (u.username && u.username.length > 0) 
                    ? u.username.charAt(0).toUpperCase() 
                    : '?';

                stickyContainer.innerHTML = `
                    <div class="user-sticky-card">
                        <div class="rank">${u.rank}</div>
                        <div class="avatar">${avatarLetter}</div>
                        <div class="username">${u.username || 'Вы'} (Вы)</div>
                        <div class="score">${u.score} <span class="score-label">К</span></div>
                    </div>
                `;

                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) stickyContainer.classList.remove('visible');
                        else stickyContainer.classList.add('visible');
                    });
                }, { threshold: 0.5, rootMargin: '0px 0px -100px 0px' });

                const myRow = document.getElementById('me-in-list');
                if (myRow) observer.observe(myRow);
            }

        } catch (e) {
            console.error(e);
            list.innerHTML = `<div style="padding:40px;color:#dc3545;text-align:center;">Ошибка загрузки</div>`;
        }

        // === Обработчик кнопки "Назад" ===
        const backBtn = document.getElementById('team-back-btn');
        if (backBtn) {
            backBtn.onclick = () => {
                loadRating('weekly');   // возвращаемся на "Гонка Недели"
            };
        }

        // ====================== ЗОЛОТАЯ КНОПКА «ОБЩИЙ РЕЙТИНГ» (ТОЛЬКО В КОМАНДНОМ РЕЙТИНГЕ) ======================
        // Удаляем старую кнопку, если она осталась
        const oldBtn = document.getElementById('show-general-rating-btn');
        if (oldBtn) {
            oldBtn.parentElement.remove();
        }

        // Добавляем кнопку ТОЛЬКО если мы сейчас в командном рейтинге
        const generalRatingHTML = `
            <div style="margin: 35px 8px 25px 8px; padding: 0 8px;">
                <button id="show-general-rating-btn" 
                        class="promo-action-btn btn-gold">
                    ОБЩИЙ РЕЙТИНГ
                </button>
            </div>
        `;

        list.insertAdjacentHTML('afterend', generalRatingHTML);

        // Обработчик
        const generalBtn = document.getElementById('show-general-rating-btn');
        if (generalBtn) {
            generalBtn.onclick = () => {
                loadRating('weekly');   // переключаемся на общий рейтинг
            };
        }
    }

    // Вспомогательная функция (добавь в начало client.js или где-нибудь выше)
    function escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    // ==========================================
    // 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ UI
    // ==========================================

    function updateBalanceUI() {
        console.log(new Date().toLocaleString(),`[CLIENT] [function updateBalanceUI()] started`);
        // Выводим общий счет (total_score) вместо баланса
        if (balanceEl && currentUser) balanceEl.textContent = `${currentUser.total_score} K`;
        const pretty_balance = JSON.stringify(balanceEl, null, 2);
        const pretty_user = JSON.stringify(currentUser, null, 2);
        console.log(`[CLIENT] updateBalanceUI(balanceEl=${pretty_balance}&currentUser=${pretty_user}')`);
    }

    function updateBoostUI(isActive) {
        console.log(new Date().toLocaleString(),`[CLIENT] [function updateBoostUI(isActive)] started`);
        const boostEl = document.getElementById('boost-status');
        const pretty_boostEl = JSON.stringify(boostEl, null, 2);
        console.log(`[CLIENT] updateBoostUI(boostEl=${pretty_boostEl}')`);
        if (boostEl) boostEl.style.display = isActive ? 'inline-flex' : 'none';
    }

    function updateProgressBar() {
        const list = isRetestPhase ? questionsForRetest : mainQuestions;
        if (progressBar && list.length > 0) {
            progressBar.style.width = `${((questionIndex + 1) / list.length) * 100}%`;
        }
    }

    function showExplanationPopup(text, cb) {
        explanationText.textContent = text;
        explanationOverlay.classList.remove('hidden');
        explanationOkBtn.onclick = () => {
            explanationOverlay.classList.add('hidden');
            if (cb) cb();
        };
    }

    function showErrorToast() {
        errorToast.classList.remove('hidden');
        setTimeout(() => errorToast.classList.add('hidden'), 1500);
    }

/**
 * ЗАЧЕМ НУЖНА: 
 * "Экран триумфа". Подводит итоги тренировки, визуализирует прогресс по XP 
 * и показывает, сколько осталось до глобальной цели (например, 5000 баллов). 
 * Это закрепляет привычку тренироваться через наглядный рост показателей.
 */
    function showSummaryScreen() {
        const summary = document.getElementById('summary-screen');
        const header = document.getElementById('summary-header');
        // Берем только число без знаков. Если вдруг баланс сессии ушел в минус, показываем 0.
        const cleanScore = Math.max(0, sessionScore);
        header.innerHTML = `Тренировка завершена!<br><span style="color:#58cc02">${cleanScore} XP</span>`;
        
        const xpTotal = (currentUser.dailyStats?.xp_earned || 0) + sessionScore;
        document.getElementById('bar-xp').style.width = `${Math.min(100, (xpTotal/DAILY_XP_GOAL)*100)}%`;
        document.getElementById('text-xp').textContent = `${xpTotal} / ${DAILY_XP_GOAL}`;
        
        document.getElementById('bar-questions').style.width = '100%';
        document.getElementById('text-questions').textContent = `${mainQuestions.length} / ${mainQuestions.length}`;
        
        const nextGoal = Math.ceil((currentUser.balance + 1) / 5000) * 5000;
        document.getElementById('bar-monthly').style.width = `${Math.min(100, (currentUser.balance/nextGoal)*100)}%`;
        document.getElementById('text-monthly').textContent = `${currentUser.balance} / ${nextGoal}`;

        // Обновляем статистику "БЕЗ ОШИБОК"
        document.getElementById('bar-perfect').style.width = `${(correctFirstTryCount / 10) * 100}%`;
        document.getElementById('text-perfect').textContent = `${correctFirstTryCount} / 10`;
        
        summary.classList.remove('hidden');
        document.getElementById('summary-ok-btn').onclick = showPromoScreen;
    }


document.getElementById('clear-storage-btn').addEventListener('click', () => {
    showStyledConfirm(
        'Выйти из профиля?',                    // сообщение
        () => {                                 //  что делать при нажатии «Да»
            localStorage.clear();
            window.location.href = '/kpt_bye.html';
        },
        () => {                                 //  что делать при нажатии «Нет» (опционально)
            console.log('Выход отменён');
            // можно ничего не писать, если не нужно
        }
    );
});

 /**
 * ЗАЧЕМ НУЖНА: 
 * Финальный экран после 10 вопросов. Показывает карту рубашкой вверх.
 * При клике карта переворачивается, показывая случайный результат.
 */
function showPromoScreen() {
    // 1. Находим все элементы по ID из твоего HTML
    const summary = document.getElementById('summary-screen');
    const promo = document.getElementById('promo-screen');
    const flipCard = document.getElementById('promo-flip-card');
    const flipBtn = document.getElementById('promo-flip-btn');
    const resultImg = document.getElementById('promo-result-image'); 
    const promoText = document.getElementById('promo-text');
    const closeBtn = document.getElementById('btn-close-app');

    // Скрываем предыдущий экран
    if (summary) summary.classList.add('hidden');

    // 2. СБРОС СОСТОЯНИЯ (подготовка к анимации)
    flipCard.classList.remove('flipped');    // Возвращаем рубашкой вверх
    flipBtn.classList.remove('hidden');       // Показываем кнопку "Перевернуть"
    closeBtn.classList.add('hidden');         // Прячем кнопку "В рейтинг"
    promoText.classList.remove('visible');    // Прячем текст

    // 3. ГЕНЕРАЦИЯ КАРТЫ (лицевая сторона)
    const randomNum = Math.floor(Math.random() * 53) + 1;
    // Загружаем случайную картинку в скрытую пока сторону
    resultImg.src = `img/instramet_final%20${randomNum}.jpeg`;
    
    console.log("Финал: подготовлена карта №", randomNum);

    // 4. ЛОГИКА НАЖАТИЯ НА КНОПКУ
    flipBtn.onclick = function() {
        // Запускаем 3D анимацию (из style.css)
        flipCard.classList.add('flipped');

        // Кнопка "Перевернуть" исчезает сразу
        flipBtn.classList.add('hidden');

        // Через небольшую паузу (когда карта уже повернулась) показываем текст и кнопку выхода
        setTimeout(() => {
            promoText.textContent = "Отличная работа! Твои навыки растут с каждым днем.";
            promoText.classList.add('visible');
            closeBtn.classList.remove('hidden');
        }, 500);
    };

    // Логика кнопки закрытия
    closeBtn.onclick = () => {
        promo.classList.add('hidden');
        navigateTo('rating-screen');
    };

    // Показываем сам экран промо
    promo.classList.remove('hidden');
}

    // Кнопка сброса квалификации (в профиле)
    const resetBtn = document.getElementById('reset-qualification-btn');
    if (resetBtn) {
        resetBtn.onclick = async () => {
            if (confirm("Хочешь заново пройти проверку уровня?")) {
                await fetch('/api/user/reset-qualification', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({userId: currentUser.id}) });
                location.reload();
            }
        };
    }

    // ====================== КНОПКА "ДОПОЛНИТЕЛЬНО" ======================

    const additionalBtn = document.getElementById('additional-btn');
    const additionalMenu = document.createElement('div');
    additionalMenu.id = 'additional-menu';
    additionalMenu.innerHTML = `
        <div class="additional-menu-item" id="delete-profile-item">🗑 Удалить профиль</div>
        <div class="additional-menu-item" id="close-menu-item">Отмена</div>
    `;
    document.body.appendChild(additionalMenu);

    // Показать/скрыть меню
    function toggleAdditionalMenu() {
        if (additionalMenu.style.display === 'block') {
            additionalMenu.style.display = 'none';
        } else {
            additionalMenu.style.display = 'block';
        }
    }

    // Клик по кнопке "Дополнительно"
    if (additionalBtn) {
        additionalBtn.addEventListener('click', toggleAdditionalMenu);
    }

    // Клик по пунктам меню
    document.getElementById('delete-profile-item').addEventListener('click', () => {
        additionalMenu.style.display = 'none';
        window.location.href = 'kpt_drop.html';
    });

    document.getElementById('close-menu-item').addEventListener('click', () => {
        additionalMenu.style.display = 'none';
    });

    // Закрытие меню при клике вне его
    document.addEventListener('click', (e) => {
	console.log('PRN 1497 alexmay click FIRED');
        if (!additionalBtn.contains(e.target) && !additionalMenu.contains(e.target)) {
            additionalMenu.style.display = 'none';
        }
    });

});