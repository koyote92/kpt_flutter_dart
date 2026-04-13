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
    console.log(new Date().toLocaleString(),`[CLIENT] [DOMContentLoaded] started`);
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

    const DAILY_XP_GOAL = 150;

    // --- ЭЛЕМЕНТЫ ИНТЕРФЕЙСА ---
    const questionTextEl = document.querySelector('.question-text');
    const answerButtons = document.querySelectorAll('.answer-button');
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

        const token = localStorage.getItem('auth_token');

        if (token) {
            console.log('[CLIENT] Найден токен в localStorage, проверяем...');

            try {
                const res = await fetch('/api/me', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (res.ok) {
                    const user = await res.json();
                    currentUser = user;
                    console.log('[CLIENT] Авторизация по токену успешна, пользователь:', user);

                    if (user.phone_no) {
                        // Номер уже есть → сразу в приложение
                        updateBalanceUI();
                        updateBoostUI(user.isBoostActive || false);

                        if (user.is_onboarded === 0) {
                            showOnboardingIntro();
                        } else {
                            initStartCard();
                            await loadQuestions();
                        }
                        return; // ← НЕ показываем форму
                    } else {
                        console.log('[CLIENT] У пользователя нет phone_no, показываем форму');
                    }
                } else {
                    console.warn('[CLIENT] Токен недействителен, статус:', res.status);
                    localStorage.removeItem('auth_token');
                }
            } catch (err) {
                console.error('[CLIENT] Ошибка проверки токена:', err);
                localStorage.removeItem('auth_token');
            }
        } else {
            console.log('[CLIENT] Токена нет, показываем форму авторизации');
        }

        // Если дошли сюда — показываем форму
        let tgId = null;
        const tg = window.Telegram?.WebApp;
        if (tg && tg.initDataUnsafe?.user?.id) {
            tgId = tg.initDataUnsafe.user.id;
            console.log(`[CLIENT] TG context detected, tg_id: ${tgId}`);
            tg.ready();
            tg.expand();
        }

        showPhoneAuthForm(tgId);
    }

    // k92
    function showPhoneAuthForm(tgId) {
        console.log(`[CLIENT] showPhoneAuthForm(tgId=${tgId ?? 'null'})`);

        const isFromBrowser = tgId === null;

        console.log(`[CLIENT] showPhoneAuthForm(isFromBrowser=${isFromBrowser}')`);

        const authScreen = document.createElement('div');
        authScreen.id = 'auth-screen';
        authScreen.className = 'screen';

        authScreen.innerHTML = `
            <div class="container">
                <h2>Ввод номера телефона</h2>
                <form id="phone-form">
                    ${
                        isFromBrowser
                            ? `
                    <input 
                        type="text" 
                        id="username" 
                        placeholder="Ваше имя" 
                        value="Игрок" 
                        maxlength="64"
                        autocomplete="off"
                        pattern="[А-Яа-яA-Za-zЁё -]{1,64}"
                        title="Только буквы, пробелы и дефисы"
                    >
                    <div id="username-error" class="error" style="color:#ef4444; font-size:14px; min-height:20px; margin-bottom:8px;"></div>
                    `
                            : ''
                    }
                    <input 
                        type="tel" 
                        id="phone" 
                        value="+79" 
                        placeholder="+79xxxxxxxxx" 
                        required
                        maxlength="12"
                        pattern="\\+79[0-9]{9}"
                        inputmode="numeric"
                    >
                    <div id="phone-error" class="error"></div>
                    <button type="submit">Получить код в SMS</button>
                </form>

                <form id="code-form" style="display: none;">
                    <h2>Ввод кода из SMS</h2>
                    <input type="tel" id="code" placeholder="Введите код" required maxlength="4" inputmode="numeric">
                    <div id="code-error" class="error"></div>
                    <button type="submit">Проверить код</button>
                </form>
            </div>
        `;

        document.body.appendChild(authScreen);

        // Стили (оставил твои последние, которые работают)
        const style = document.createElement('style');
        style.textContent = `
            #auth-screen {
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.45);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                box-sizing: border-box;
            }
            #auth-screen .container {
                background: white;
                border-radius: 24px;
                padding: 40px 28px;
                width: 100%;
                max-width: 400px;
                box-shadow: 0 20px 50px rgba(0,0,0,0.2);
                text-align: center;
            }
            #auth-screen h2 {
                margin: 0 0 28px;
                font-size: 24px;
                font-weight: 700;
                color: #111827;
            }
            #auth-screen input {
                width: 100%;
                padding: 16px 18px;
                margin: 12px 0;
                border: 1.5px solid #d1d5db;
                border-radius: 14px;
                font-size: 17px;
                box-sizing: border-box;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            #auth-screen input:focus {
                outline: none;
                border-color: #6366f1;
                box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
            }
            #auth-screen button {
                width: 100%;
                padding: 16px;
                margin-top: 12px;
                background: #6366f1;
                color: white;
                font-size: 17px;
                font-weight: 600;
                border: none;
                border-radius: 14px;
                cursor: pointer;
                transition: background 0.2s, transform 0.2s;
            }
            #auth-screen button:hover {
                background: #4f46e5;
                transform: translateY(-1px);
            }
            .error {
                color: #ef4444;
                font-size: 14px;
                margin-top: 6px;
                min-height: 20px;
            }
        `;
        document.head.appendChild(style);

        // Элементы DOM
        const phoneInput    = document.getElementById('phone');
        const codeInput     = document.getElementById('code');
        const usernameInput = document.getElementById('username'); // null, если из Telegram
        const phoneForm     = document.getElementById('phone-form');
        const codeForm      = document.getElementById('code-form');
        const phoneError    = document.getElementById('phone-error');
        const codeError     = document.getElementById('code-error');
        const usernameError = document.getElementById('username-error');

        // Переменная для имени — объявлена здесь, видна в обоих обработчиках
        let userDisplayName = 'Игрок';

        // Ограничение цифр для телефона и кода
        function restrictToDigits(e) {
            const key = e.key;
            if (!/^\d$/.test(key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(key)) {
                e.preventDefault();
            }
        }

        phoneInput?.addEventListener('keydown', restrictToDigits);
        codeInput?.addEventListener('keydown', restrictToDigits);

        phoneInput?.addEventListener('input', function() {
            if (!this.value.startsWith('+79')) this.value = '+79';
            this.value = this.value.slice(0, 12);
        });

        // Обработка поля имени (только если оно есть)
        if (usernameInput) {
            usernameInput.addEventListener('input', function() {
                this.value = this.value.replace(/[^А-Яа-яA-Za-zЁё -]/g, '');
                if (this.value.length > 64) this.value = this.value.slice(0, 64);
            });

            usernameInput.addEventListener('blur', function() {
                if (!this.value.trim()) this.value = 'Игрок';
            });
        }

        // Отправка номера телефона
        phoneForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const phone = phoneInput.value.trim();

            if (phone.length !== 12 || !/^\+79\d{9}$/.test(phone)) {
                phoneError.textContent = 'Номер должен быть +79xxxxxxxxx';
                return;
            }

            // Обновляем имя ПЕРЕД отправкой (если поле существует)
            if (usernameInput) {
                const inputVal = usernameInput.value.trim();
                userDisplayName = inputVal && inputVal.length > 0 ? inputVal : 'Игрок';
                if (userDisplayName.length > 64) userDisplayName = userDisplayName.slice(0, 64);
            }

            phoneError.textContent = 'Отправка кода...';

            try {
                const res = await fetch('/api/send-sms', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        phone_no: phone, 
                        tg_id: tgId ?? null
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Ошибка сервера');
                }

                phoneError.textContent = '';
                phoneForm.style.display = 'none';
                codeForm.style.display = 'block';
            } catch (err) {
                phoneError.textContent = err.message || 'Ошибка отправки. Попробуйте позже.';
            }
        });

        // Отправка кода → передаём имя
        codeForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const code = codeInput.value.trim();
            const phone = phoneInput.value.trim();

            if (code.length !== 4) {
                codeError.textContent = 'Код должен состоять из 4 цифр';
                return;
            }

            codeError.textContent = 'Проверка...';

            try {
                console.log('[CLIENT] Отправляем в /api/verify-code:', {
                    phone_no: phone,
                    code,
                    tg_id: tgId ?? null,
                    username: userDisplayName
                });

                const res = await fetch('/api/verify-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        phone_no: phone, 
                        code, 
                        tg_id: tgId ?? null,
                        username: userDisplayName
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Неверный код');
                }

                const data = await res.json();
                currentUser = data;
                // Сохраняем токен
                if (data.token) {
                    localStorage.setItem('auth_token', data.token);
                }
                console.table(currentUser);

                authScreen.remove();

                // Прячем стартовый экран (он больше не должен торчать)
                if (startScreen) {
                    startScreen.classList.add('hidden');   // или startScreen.style.display = 'none';
                    console.log('[CLIENT] start-screen спрятан после авторизации');
                }

                updateBalanceUI();
                updateBoostUI(currentUser.isBoostActive || false);

                if (currentUser.is_onboarded === 0) {
                    showOnboardingIntro();
                } else {
                    initStartCard();
                    await loadQuestions();
                }

            } catch (err) {
                codeError.textContent = err.message || 'Неверный код или ошибка сервера';
            }
        });
    }

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
    //             <a href="https://auth.0422.ru/" style="color:#007aff;text-decoration:none;margin-top:20px;padding:10px 20px;border:1px solid #007aff;border-radius:10px;">ВОЙТИ ПО ТЕЛЕФОНУ</a>
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
        isOnboardingMode = true;
        const nav = document.querySelector('.bottom-nav');
        pretty_nav = JSON.stringify(nav, null, 2);
        console.log(`[CLIENT] showOnboardingIntro nav=${nav}`)
        if (nav) nav.style.display = 'none';

        questionTextEl.innerHTML = `<div style="font-weight:800; font-size: 20px;">Добро пожаловать, ${currentUser.username}!</div>
        <p style="margin-top:15px;">Чтобы подобрать для тебя идеальную программу, пройди квалификационный тест из 15 кейсов.</p>`;
        
        answerButtons.forEach(btn => btn.style.display = 'none');
        
        const startTestBtn = document.createElement('button');
        startTestBtn.className = 'answer-button';
        startTestBtn.style.textAlign = 'center';
        startTestBtn.style.background = '#58cc02';
        startTestBtn.style.color = 'white';
        startTestBtn.style.borderColor = '#46a302';
        startTestBtn.textContent = 'Начать проверку знаний';
        
        startTestBtn.onclick = async () => {
            startTestBtn.remove();
            answerButtons.forEach(btn => btn.style.display = 'block');
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
        console.log('   → Текущий questionIndex:', questionIndex);
        console.log('   → isRetestPhase:', isRetestPhase);
        console.log('   → mainQuestions.length:', mainQuestions.length);
        console.log('   → questionsForRetest.length:', questionsForRetest.length);

        attempts = 0;
        console.log('   → attempts сброшены до 0');

        const list = isRetestPhase ? questionsForRetest : mainQuestions;
        console.log('   → Выбран список вопросов:', isRetestPhase ? 'questionsForRetest' : 'mainQuestions');
        console.log('   → Длина текущего списка:', list.length);

        if (questionIndex >= list.length) {
            console.log('   → Вопросы закончились (questionIndex >= list.length)');
            console.log('      → Переходим к ретесту или summary');
            if (!isRetestPhase && questionsForRetest.length > 0) {
                console.log('      → Запускаем startRetestPhase()');
                startRetestPhase();
            } else {
                console.log('      → Запускаем showSummaryScreen()');
                showSummaryScreen();
            }
            return;
        }

        const q = list[questionIndex];
        console.log('   → Текущий вопрос (индекс ' + questionIndex + '):', q);
        console.log('      → ID вопроса:', q.ID || q.id || 'нет ID');
        console.log('      → Текст ситуации:', q.case || 'нет текста');

        // Устанавливаем текст вопроса
        if (questionTextEl) {
            const questionText = isRetestPhase 
                ? `РАБОТА НАД ОШИБКАМИ:\n${q.case || 'нет текста'}`
                : (q.case || 'нет текста');

            questionTextEl.textContent = questionText;
            console.log('   → Текст вопроса установлен в .question-text:', questionText);
        } else {
            console.error('   → Элемент .question-text НЕ НАЙДЕН в DOM!');
        }

        // Подготавливаем варианты ответов
        let options = [];
        if (q.options_json) {
            console.log('   → Используем options_json');
            try {
                options = typeof q.options_json === 'string' 
                    ? JSON.parse(q.options_json) 
                    : q.options_json;
                console.log('      → options_json распарсен:', options);
            } catch (e) {
                console.error('   → Ошибка парсинга options_json:', e);
                options = [];
            }
        } else {
            console.log('   → Собираем варианты из колонок Вариант A/B/C/D');
            options = [
                q['option_a'], 
                q['option_b'], 
                q['option_c'], 
                q['option_d']
            ];
            console.log('      → Варианты из колонок:', options);
        }

        const keys = ['A', 'B', 'C', 'D'];
        console.log('   → Всего вариантов ответов:', options.length);

        // Отрисовка кнопок
        console.log('   → answerButtons найдено:', answerButtons.length);
        answerButtons.forEach((btn, i) => {
            const optionText = options[i];

            console.log(`      → Кнопка ${i} (${keys[i]}):`);
            console.log(`         → optionText:`, optionText);

            if (optionText && optionText !== 'null' && optionText !== null && optionText !== '') {
                btn.innerHTML = `<span style="font-weight:bold; color:#007aff;">${keys[i]})</span> ${optionText}`;
                btn.dataset.key = keys[i];
                btn.dataset.index = i;
                btn.className = 'answer-button';
                btn.disabled = false;
                btn.style.display = 'block';
                console.log(`         → Кнопка ${i} показана, текст: ${optionText}`);
            } else {
                btn.style.display = 'none';
                console.log(`         → Кнопка ${i} скрыта (нет текста)`);
            }
        });

        updateProgressBar();
        console.log('[CLIENT] displayQuestion() → ЗАВЕРШЕНО');
    }

    answerButtons.forEach(btn => {
        btn.onclick = async () => {
            if (btn.disabled) return;
            const key = btn.dataset.key;

            if (isOnboardingMode) {
                const q = mainQuestions[questionIndex];
                // Сохраняем ИНДЕКС (0, 1, 2...), так как сервер ждет именно его для подсчета баллов
                onboardingAnswers[q.id] = btn.dataset.index; 
                questionIndex++;
                
                if (questionIndex >= mainQuestions.length) {
                    finishOnboarding();
                } else {
                    displayQuestion();
                }
                return;
            }

            if (isRetestPhase) await handleRetestAnswer(key, btn);
            else await handleMainAnswer(key, btn);
        };
    });
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
            
            const res = await submitToDB(q.ID, key, attempts);
            currentUser.balance = res.newBalance;
            currentUser.total_score = res.newTotalScore; // <--- ДОБАВЬ ЭТУ СТРОКУ
            updateBalanceUI();
            
            setTimeout(() => showExplanationPopup(res.explanation, () => {
                questionIndex++;
                displayQuestion();
            }), 500);
        } else {
            btn.classList.add('incorrect');
            btn.disabled = true;
            if (attempts < 2) {
                showErrorToast();
            } else {
                questionsForRetest.push(q);
                answerButtons.forEach(b => {
                    if (b.dataset.key === q['correct_answer']) b.classList.add('correct');
                    b.disabled = true;
                });
                const res = await submitToDB(q.ID, key, attempts);
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
        answerButtons.forEach(b => b.disabled = true);

        if (isCorrect) {
            btn.classList.add('correct');
        } else {
            btn.classList.add('incorrect');
            answerButtons.forEach(b => { if (b.dataset.key === q['correct_answer']) b.classList.add('correct'); });
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

    navButtons.forEach(btn => btn.onclick = () => navigateTo(btn.dataset.target));

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
        const stickyContainer = document.getElementById('user-position-container');
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

    async function loadProfile() {
        try {
            const res = await fetch(`/api/profile?userId=${currentUser.id}`);
            const data = await res.json();
            document.getElementById('profile-username').textContent = data.profile.username;
            document.getElementById('profile-level').textContent = data.profile.level;
            document.getElementById('profile-streak').textContent = data.profile.streak;
            document.getElementById('profile-avatar').textContent = data.profile.username.charAt(0).toUpperCase();

            const grid = document.getElementById('achievements-grid');
            grid.innerHTML = data.achievements.map(a => `
                <div class="achievement-item ${a.unlocked ? 'unlocked' : 'locked'}" onclick="alert('${a.title}: ${a.description}')">
                    <div class="ach-icon-wrapper">${a.icon}</div>
                    <div class="ach-name">${a.title}</div>
                </div>
            `).join('');
        } catch(e) { console.error("Profile load error"); }
    }

    // ==========================================
    // 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ UI
    // ==========================================

    function updateBalanceUI() {
        console.log(new Date().toLocaleString(),`[CLIENT] [function updateBalanceUI()] started`);
        // Выводим общий счет (total_score) вместо баланса
        const pretty_balance = JSON.stringify(balanceEl, null, 2);
        const pretty_user = JSON.stringify(currentUser, null, 2);
        if (balanceEl && currentUser) balanceEl.textContent = `${currentUser.total_score} K`;
        console.log(`[CLIENT] updateBalanceUI(balanceEl=${pretty_balance}&currentUser=${pretty_user}&')`);
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
});