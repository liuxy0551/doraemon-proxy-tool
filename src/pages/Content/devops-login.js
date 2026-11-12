(async function () {
    const CAPTCHA_INPUT_SELECTOR = [
        '#verify_code',
        '#verifyCode',
        '#captcha',
        'input[name="verify_code"]',
        'input[name="verifyCode"]',
        'input[name="captcha"]',
        'input[placeholder*="验证码"]',
        'input[placeholder*="校验码"]',
    ].join(',');
    const LOGIN_INPUT_SELECTOR = [
        '#username',
        '#password',
        CAPTCHA_INPUT_SELECTOR,
    ].join(',');

    function createAutoTriggerController({
        delay,
        countdownDelay,
        onCountdown,
        onTrigger,
        onCancel,
        setTimer = setTimeout,
        clearTimer = clearTimeout,
    }) {
        let delayTimer = null;
        let countdownTimer = null;
        let pending = false;

        function clearPendingTimers() {
            if (delayTimer !== null) clearTimer(delayTimer);
            if (countdownTimer !== null) clearTimer(countdownTimer);
            delayTimer = null;
            countdownTimer = null;
        }

        return {
            schedule() {
                if (pending) return false;

                pending = true;
                delayTimer = setTimer(() => {
                    delayTimer = null;
                    if (!pending) return;

                    onCountdown();
                    countdownTimer = setTimer(() => {
                        countdownTimer = null;
                        if (!pending) return;

                        pending = false;
                        onTrigger();
                    }, countdownDelay);
                }, delay);
                return true;
            },
            cancel() {
                if (!pending) return false;

                pending = false;
                clearPendingTimers();
                onCancel();
                return true;
            },
            isPending() {
                return pending;
            },
        };
    }

    function shouldCancelAutoTrigger(event, captchaImage) {
        if (event.type === 'keydown') return event.key === 'Escape';
        if (event.type === 'input') {
            return Boolean(event.target?.matches?.(LOGIN_INPUT_SELECTOR));
        }
        if (event.type !== 'click') return false;
        if (event.target === captchaImage) return true;

        return Boolean(
            event.target?.closest?.(
                '.c-login__container__form__btn, #doraemon-typing-btn'
            )
        );
    }

    function updateAutoTriggerCancellationToast(countdownToast) {
        if (!countdownToast) return false;
        countdownToast.innerText = '已取消本次自动登录';
        return true;
    }

    function bindAutoTriggerCancellation({
        eventTarget,
        controller,
        getCaptchaImage,
    }) {
        function handleUserTakeover(event) {
            // 只响应明确的登录操作，页面空白区域和无关输入不取消自动触发
            if (!shouldCancelAutoTrigger(event, getCaptchaImage())) return;
            controller.cancel();
        }

        const eventTypes = ['keydown', 'input', 'click'];
        eventTypes.forEach((eventType) => {
            eventTarget.addEventListener(eventType, handleUserTakeover, true);
        });

        return function removeAutoTriggerListeners() {
            eventTypes.forEach((eventType) => {
                eventTarget.removeEventListener(
                    eventType,
                    handleUserTakeover,
                    true
                );
            });
        };
    }

    // CommonJS 导出仅供无 DOM 的 Node 测试使用，避免污染宿主页面可能存在的 module
    if (
        typeof document === 'undefined' &&
        typeof module !== 'undefined' &&
        module.exports
    ) {
        module.exports = {
            createAutoTriggerController,
            shouldCancelAutoTrigger,
            bindAutoTriggerCancellation,
            updateAutoTriggerCancellationToast,
            getDefaultJumpUrl,
            isPortalSubdomainOrigin,
        };
    }

    // Node 测试只加载上方纯函数，浏览器注入逻辑仅在存在 document 时执行
    if (typeof document === 'undefined') return;

    let script = document.currentScript;
    if (!script?.dataset?.quickLogin) return;

    function showToast(message, closeCallback) {
        var toast = document.createElement('div');
        toast.className = 'doraemon-toast';
        toast.innerText = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.className = 'doraemon-toast doraemon-toast--show';
        }, 100);

        setTimeout(() => {
            toast.className = 'doraemon-toast';
            setTimeout(() => {
                document.body.removeChild(toast);
                closeCallback?.();
            }, 500);
        }, 2000);

        return toast;
    }

    function getUrlParams(url = window.location.href) {
        const aQuery = url.split('?');
        const aGET = {};
        if (aQuery.length > 1) {
            const aBuf = aQuery[1].split('&');
            for (let i = 0, iLoop = aBuf.length; i < iLoop; i++) {
                const aTmp = aBuf[i].split('=');
                aGET[aTmp[0]] = aTmp[1];
            }
        }
        return aGET;
    }

    // 判断 target 是否为当前站点的独立 portal 子域（如 xxx.k8s.dtstack.cn -> xxx-portal.k8s.dtstack.cn）
    // 仅在站点名（host 首段）末尾追加 '-portal'，scheme 与端口需一致，避免误放行其它子域
    function isPortalSubdomainOrigin(targetOrigin, baseOrigin) {
        try {
            const target = new URL(targetOrigin);
            const base = new URL(baseOrigin);
            if (
                target.protocol !== base.protocol ||
                target.port !== base.port
            ) {
                return false;
            }
            // 首段加 -portal 后缀，如 shuzhan53-lzlj-update -> shuzhan53-lzlj-update-portal，
            // 其余标签（k8s.dtstack.cn 等）保持不变
            return (
                target.host ===
                base.host.replace(/^([^.]+)/, '$1-portal')
            );
        } catch (error) {
            return false;
        }
    }

    function getDefaultJumpUrl(defaultJumpPath) {
        const fallbackUrl = new URL('/portal', window.location.origin);
        const defaultJumpPathText = String(defaultJumpPath || '').trim();
        if (!defaultJumpPathText) return fallbackUrl;

        // DEFAULT_JUMP_PATH 出现 http:/console 这类少一个斜杠的协议写法时直接判无效
        if (/^https?:\/(?!\/)/i.test(defaultJumpPathText)) return fallbackUrl;

        const currentOrigin = window.location.origin;
        try {
            const defaultJumpUrl = new URL(defaultJumpPathText, currentOrigin);
            // 只允许当前站点内跳转，避免 console/publicService 被错误解析成 host
            if (defaultJumpUrl.origin !== currentOrigin) {
                // 兼容 https://xxx.k8s.dtstack.cn -> https://xxx-portal.k8s.dtstack.cn
                // 这类独立 portal 子域的默认跳转地址，否则会一律回退到当前站点 /portal
                if (!isPortalSubdomainOrigin(defaultJumpUrl, currentOrigin)) {
                    return fallbackUrl;
                }
            }
            return defaultJumpUrl;
        } catch (error) {
            return fallbackUrl;
        }
    }

    async function getPulicKey() {
        if (sessionStorage.getItem('publicKey')) {
            return Promise.resolve(sessionStorage.getItem('publicKey'));
        }
        return fetch('/uic/api/v2/account/login/get-publi-key')
            .then((response) => {
                return response.json();
            })
            .then((res) => {
                if (res.success) {
                    sessionStorage.setItem('publicKey', res.data);
                    return res.data;
                } else {
                    showToast('获取公钥失败');
                    return Promise.reject();
                }
            });
    }

    async function waitPageDidMount() {
        return new Promise((resolve) => {
            if (document.querySelector('.c-login__container__form__btn')) {
                resolve(true);
                return;
            }

            const observer = new MutationObserver((mutationList, observer) => {
                for (const mutation of mutationList) {
                    if (
                        mutation.type === 'childList' &&
                        document.querySelector('.c-login__container__form__btn')
                    ) {
                        resolve(true);
                        observer.disconnect();
                    }
                }
            });
            // 刷新时脚本可能早于 #app 挂载，先监听根节点避免 observe(null) 直接失败
            observer.observe(
                document.querySelector('#app') || document.documentElement,
                {
                    attributes: false,
                    childList: true,
                    subtree: true,
                }
            );
        });
    }

    function createLoginButton() {
        var loginBtn = document.createElement('div');
        loginBtn.className = 'doraemon-hack-btn';
        loginBtn.id = 'doraemon-login-btn';
        loginBtn.innerHTML = `
            <div class="sign">
                <svg t="1724381735188" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="28531" width="200" height="200"><path d="M865.829463 21.72878a149.853659 149.853659 0 0 1 149.853659 149.853659v699.317073a149.853659 149.853659 0 0 1-149.853659 149.853659h-199.804878a49.95122 49.95122 0 1 1 0-99.902439h199.804878c24.97561 0.074927 46.104976-18.382049 49.451708-43.132878l0.499512-6.793366v-699.317073c0.049951-24.97561-18.407024-46.129951-43.157854-49.451708l-6.793366-0.499512h-199.804878a49.95122 49.95122 0 1 1 0-99.902439h199.804878zM454.056585 238.716878l247.258537 247.258537a49.95122 49.95122 0 0 1 0 70.631024l-247.258537 247.258537a49.95122 49.95122 0 1 1-70.631024-70.631025l161.941854-162.041756-478.782439 0.049951a49.95122 49.95122 0 0 1 0-99.902439l478.732487-0.049951-161.841951-161.941854a49.95122 49.95122 0 0 1 70.581073-70.631024z" fill="#333333" p-id="28532"></path></svg>            </div>
            <div class="doraemon-text">快速登录</div>
        `;
        return loginBtn;
    }

    function createTypingButton() {
        var typingBtn = document.createElement('div');
        typingBtn.className = 'doraemon-hack-btn';
        typingBtn.id = 'doraemon-typing-btn';
        typingBtn.innerHTML = `
            <div class="sign">
               <svg t="1735210541544" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8930" width="55" height="55"><path d="M538.653 76.146C786.965 93.509 974.88 303.679 957.938 545.963c-1.152 16.478-15.447 28.901-31.929 27.749-16.246-1.136-28.553-15.04-27.798-31.218l0.042-0.705c14.61-208.953-148.06-390.888-363.773-405.972-215.713-15.084-402.121 142.44-416.733 351.394-14.61 208.953 148.06 390.889 363.773 405.973 33.653 2.353 67.007 0.538 99.504-5.299 16.261-2.92 31.812 7.891 34.734 24.15 2.922 16.257-7.892 31.804-24.153 34.725-37.355 6.709-75.665 8.794-114.258 6.095C229.035 935.491 41.12 725.322 58.062 483.038 75.004 240.753 290.34 58.782 538.652 76.146z m45.273 474.537l357.808 127.172c12.01 4.461 18.009 17.1 13.506 28.254-2.045 5.518-6.227 10.002-11.616 12.471l-136.158 60.41c-10.475 4.434-18.808 12.694-23.256 23.05l-57.763 136.09c-4.451 11.042-17.733 16.259-28.916 12.033l-0.339-0.131c-5.998-2.231-10.5-7.44-12.748-13.386L555.417 578.938a21.565 21.565 0 0 1 0.721-16.935c2.543-5.319 7.152-9.4 12.785-11.32 4.496-2.23 9.75-2.23 15.003 0z m52.632 80.784l71.895 199.32 21.998-51.823c10.21-23.775 29.085-42.757 52.746-53.206l0.812-0.355 51.973-23.058-199.424-70.878zM508 293.637c122.009 0 220.916 98.884 220.916 220.863 0 16.518-13.394 29.909-29.916 29.909-16.286 0-29.532-13.01-29.907-29.203l-0.008-0.706c0-88.943-72.12-161.046-161.085-161.046S346.915 425.557 346.915 514.5c0 88.054 70.685 159.602 158.421 161.025l2.664 0.021c16.522 0 29.916 13.39 29.916 29.909 0 16.518-13.394 29.908-29.916 29.908-122.009 0-220.916-98.883-220.916-220.863 0-121.979 98.907-220.863 220.916-220.863z" fill="#333333" p-id="8931"></path></svg>
            <div class="doraemon-text">一键输入</div>
        `;
        return typingBtn;
    }

    // js触发React事件
    function simulate(inputElement, value) {
        var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        ).set;

        // 使用原生的value setter来设置输入框的值
        nativeInputValueSetter.call(inputElement, value);

        var inputEvent = new Event('input', { bubbles: true });

        // 在输入框元素上分派input事件，这将触发React的onChange处理程序
        inputElement.dispatchEvent(inputEvent);
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function getUsernameInput() {
        const selectors = [
            '#username',
            'input[name="username"]',
            'input[placeholder*="账号"]',
            'input[placeholder*="用户名"]',
            '.c-login__container__form input[type="text"]',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    function getPasswordInput() {
        const selectors = [
            '#password',
            'input[type="password"]',
            'input[name="password"]',
            'input[placeholder*="密码"]',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    function getCaptchaInput() {
        return document.querySelector(CAPTCHA_INPUT_SELECTOR);
    }

    function getCaptchaImage() {
        const selectors = [
            '#v_code',
            'img[src*="verify"]',
            'img[src*="captcha"]',
            'img[src*="code"]',
            'img[alt*="验证码"]',
            '.c-login__container__form img',
            'form img',
        ];
        return document.querySelector(selectors.join(','));
    }

    function getCaptchaKey(imageElement) {
        const src = imageElement?.currentSrc || imageElement?.src;
        if (!src) return '';

        try {
            return (
                new URL(src, window.location.origin).searchParams.get('key') ||
                ''
            );
        } catch (error) {
            return '';
        }
    }

    function getCaptchaImageBase64(imageElement) {
        const src = imageElement?.currentSrc || imageElement?.src;
        if (!src) throw new Error('未找到验证码图片地址');
        if (src.startsWith('data:')) {
            return src.includes(',') ? src.split(',')[1] : src;
        }

        const canvas = document.createElement('canvas');
        canvas.width = imageElement.naturalWidth || imageElement.width;
        canvas.height = imageElement.naturalHeight || imageElement.height;
        const context = canvas.getContext('2d');
        context.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    }

    function requestCaptchaOcr(image) {
        const requestId = `${Date.now()}-${Math.random()}`;
        script.dataset.ocrRequest = JSON.stringify({ requestId, image });

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                script.removeEventListener('captchaRecognized', handleResponse);
                reject(new Error('OCR接口请求超时'));
            }, 10000);

            const handleResponse = () => {
                const response = JSON.parse(script.dataset.ocrResponse || '{}');
                if (response.requestId !== requestId) return;

                clearTimeout(timer);
                script.removeEventListener('captchaRecognized', handleResponse);
                if (response.success) {
                    resolve(String(response.result || '').replace(/\s/g, ''));
                } else {
                    reject(new Error(response.message || 'OCR识别失败'));
                }
            };

            script.addEventListener('captchaRecognized', handleResponse);
            script.dispatchEvent(new CustomEvent('recognizeCaptcha'));
        });
    }

    // 检查页面当前是否展示验证码输入框
    function hasCaptcha() {
        const captchaInput = getCaptchaInput();
        if (!captchaInput) return false;
        if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            const style = window.getComputedStyle(captchaInput);
            if (style.display === 'none' || style.visibility === 'hidden') {
                return false;
            }
        }
        return true;
    }

    async function recognizeCaptchaCode(ocrApiUrl) {
        if (!String(ocrApiUrl || '').trim()) {
            return { code: '1', key: '' };
        }

        let lastError;
        const imageElement = getCaptchaImage();

        for (let retryCount = 0; retryCount <= 2; retryCount++) {
            try {
                const image = getCaptchaImageBase64(imageElement);
                const code = await requestCaptchaOcr(image);
                if (code) {
                    return {
                        code,
                        key: getCaptchaKey(imageElement),
                    };
                }
                throw new Error('OCR识别结果为空');
            } catch (error) {
                lastError = error;
                // 识别失败后点击验证码刷新，再重试两次
                if (retryCount < 2) {
                    imageElement?.click();
                    await sleep(500);
                }
            }
        }

        console.log('验证码识别失败，使用兜底验证码', lastError);
        showToast('验证码识别失败，已使用兜底值 1');
        return {
            code: '1',
            key: getCaptchaKey(imageElement),
        };
    }

    async function execQuickLogin(
        username,
        password,
        jumpUrl,
        tenantId,
        ocrApiUrl,
        captchaExpiredRetryCount = 0
    ) {
        // 登录前优先取输入框当前的值：输入框有值则覆盖配置值，为空则回退配置值
        const usernameInput = getUsernameInput();
        const passwordInput = getPasswordInput();
        if (usernameInput && usernameInput.value) {
            username = usernameInput.value;
        }
        if (passwordInput && passwordInput.value) {
            password = passwordInput.value;
        }
        const loginBtnText = document.querySelector(
            '#doraemon-login-btn .doraemon-text'
        );
        let verifyCode = '';
        let captchaKey = '';

        // 仅在页面展示验证码输入框时才调用 OCR 识别
        if (hasCaptcha()) {
            loginBtnText.innerText = '识别中...';
            const captchaResult = await recognizeCaptchaCode(ocrApiUrl);
            verifyCode = captchaResult.code;
            captchaKey = captchaResult.key;
        }

        loginBtnText.innerText = '登录中...';
        const publicKey = await getPulicKey().catch(() => {
            loginBtnText.innerText = '快速登录';
        });
        if (!publicKey) {
            showToast('公钥获取失败，请稍后再试...');
            return;
        }
        const encryptPwd = `04${sm2.doEncrypt(password, publicKey, 0)}`;
        const params = {
            username,
            password: encryptPwd,
        };
        if (verifyCode) params.verify_code = verifyCode;
        if (captchaKey) params.key = captchaKey;
        if (tenantId) params.tenantId = tenantId;
        const formData = new URLSearchParams();
        Object.keys(params).forEach((key) => {
            formData.append(key, params[key]);
        });
        return fetch('/uic/api/v2/account/login', {
            method: 'POST',
            headers: {
                'X-Custom-Header': 'dtuic',
                'Content-Type':
                    'application/x-www-form-urlencoded;charset=UTF-8',
            },
            body: formData.toString(),
        })
            .then((response) => response.json())
            .then(async (res) => {
                const message = String(res.message || '');
                // 判断是否为验证码相关错误（过期、错误、不正确等）
                const isCaptchaError =
                    res.code === 0 &&
                    /验证码.*(过期|错误|不正确|失效|失败)|captcha.*(expired|error|invalid)/i.test(
                        message
                    );
                const captchaImage = isCaptchaError ? getCaptchaImage() : null;

                // 验证码错误时刷新并重新登录一次，避免持续错误导致无限重试
                if (
                    !res.success &&
                    isCaptchaError &&
                    captchaExpiredRetryCount < 1 &&
                    captchaImage
                ) {
                    loginBtnText.innerText = '刷新验证码...';
                    captchaImage.click();
                    await sleep(500);
                    return execQuickLogin(
                        username,
                        password,
                        jumpUrl,
                        tenantId,
                        ocrApiUrl,
                        captchaExpiredRetryCount + 1
                    );
                }

                if (!res.success) {
                    const failPrefix = hasCaptcha()
                        ? '快速登录失败, 请检查用户名、密码、验证码，错误信息：'
                        : '快速登录失败, 请检查用户名、密码，错误信息：';
                    showToast(failPrefix + res.message);
                    return;
                }
                window.location.href = jumpUrl;
            })
            .finally(() => {
                loginBtnText.innerText = '快速登录';
            });
    }

    // 模拟完整点击序列，确保兼容仅监听 mousedown/pointerdown 的下拉组件
    function triggerClick(el) {
        if (!el) return;
        el.focus?.();
        const eventOptions = { bubbles: true, cancelable: true, view: window };
        try {
            el.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
        } catch (e) {
            // 忽略不支持 PointerEvent 的环境
        }
        el.dispatchEvent(new MouseEvent('mousedown', eventOptions));
        el.dispatchEvent(new MouseEvent('mouseup', eventOptions));
        el.click();
    }

    // 寻找登录方式切换下拉框（不依赖特定第三方名称，纯通用结构定位）
    function findModeTrigger() {
        // 1. 优先通过常见下拉选择器匹配
        const triggerSelectors = [
            '.c-login__container__form .ant-select-selector',
            '.c-login__container__form .ant-select',
            '.c-login__container__form [role="combobox"]',
            '.c-login__container__form [class*="select-selector"]',
            '.c-login__container__form [class*="select"]',
            '.c-login__container .ant-select-selector',
            '.c-login__container .ant-select',
            '.c-login__container [role="combobox"]',
            '.c-login__container [class*="select"]',
            '.ant-select-selector',
            '.ant-select',
            '[role="combobox"]',
        ];
        for (const sel of triggerSelectors) {
            const el = document.querySelector(sel);
            if (el && el.getBoundingClientRect().height > 0) return el;
        }

        // 2. 查找带下拉箭头（down arrow）的输入/选择容器
        const arrowEl = document.querySelector(
            '.ant-select-arrow, [class*="arrow"], [class*="down"], svg[data-icon="down"]'
        );
        if (arrowEl) {
            const container =
                arrowEl.closest('.ant-select-selector') ||
                arrowEl.closest('.ant-select') ||
                arrowEl.closest('[class*="select"]') ||
                arrowEl.parentElement;
            if (container) return container;
        }

        // 3. 通过登录按钮定位：取登录按钮上方的交互兄弟节点
        const btn = document.querySelector('.c-login__container__form__btn');
        if (btn?.parentElement) {
            const siblings = Array.from(btn.parentElement.children);
            const btnIndex = siblings.indexOf(btn);
            for (let i = btnIndex - 1; i >= 0; i--) {
                const sibling = siblings[i];
                // 排除纯标题或提示
                if (
                    sibling.tagName === 'H1' ||
                    sibling.tagName === 'H2' ||
                    sibling.tagName === 'H3' ||
                    sibling.classList.contains('title')
                ) {
                    continue;
                }
                const rect = sibling.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    return sibling;
                }
            }
        }

        return null;
    }

    // 轮询等待并在弹出层中点击固定的 UIC 账号登录选项
    async function waitAndClickUicOption(timeoutMs = 2000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            const allElements = Array.from(document.querySelectorAll('*'));
            for (let i = allElements.length - 1; i >= 0; i--) {
                const el = allElements[i];
                const text = (el.innerText || el.textContent || '').replace(/\s+/g, '');
                // 选项名称为固定的「UIC账号登录」
                if (text === 'UIC账号登录' || (text.includes('UIC') && text.includes('账号登录'))) {
                    let target = el;
                    while (
                        target.firstElementChild &&
                        (target.firstElementChild.innerText || target.firstElementChild.textContent || '').replace(/\s+/g, '') === text
                    ) {
                        target = target.firstElementChild;
                    }
                    const rect = target.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        triggerClick(target);
                        // 同时尝试派发事件至所属的 li/option 容器
                        const optionItem =
                            target.closest('.ant-select-item-option') ||
                            target.closest('li') ||
                            target.closest('[role="option"]');
                        if (optionItem && optionItem !== target) {
                            triggerClick(optionItem);
                        }
                        return true;
                    }
                }
            }
            await sleep(80);
        }
        return false;
    }

    // 自动选中 UIC 账号登录方式：若当前不是 UIC 账号表单，则点开下拉框并选中「UIC账号登录」
    async function ensureUicLoginMode() {
        // 已有账号输入框，说明当前就是 UIC 账号登录模式，无需切换
        if (getUsernameInput()) return;

        // 检查页面是否已经直接露出了 UIC 账号登录选项（如已展开）
        let clicked = await waitAndClickUicOption(100);

        if (!clicked) {
            // 找登录方式下拉框触发区域
            const trigger = findModeTrigger();
            if (trigger) {
                triggerClick(trigger);
                // 兼容内部 selector 或 input 的点击事件
                const inner =
                    trigger.querySelector('.ant-select-selector') ||
                    trigger.querySelector('input') ||
                    trigger.querySelector('.ant-select-arrow');
                if (inner && inner !== trigger) {
                    triggerClick(inner);
                }
                clicked = await waitAndClickUicOption(800);

                // 若尚未弹出，对触发区域进行一次重试点击
                if (!clicked) {
                    triggerClick(trigger);
                    clicked = await waitAndClickUicOption(1500);
                }
            }
        }

        // 等待账号输入框出现（最多等 3 秒）
        await new Promise((resolve) => {
            if (getUsernameInput()) {
                resolve(true);
                return;
            }
            const maxWait = 3000;
            const interval = 100;
            let elapsed = 0;
            const timer = setInterval(() => {
                elapsed += interval;
                if (getUsernameInput() || elapsed >= maxWait) {
                    clearInterval(timer);
                    resolve(true);
                }
            }, interval);
        });
        // 延时等待表单字段和状态稳定渲染
        await sleep(200);
    }

    async function typePassword(username, password, ocrApiUrl) {
        var usernameInput = getUsernameInput();
        var passwordInput = getPasswordInput();

        if (!usernameInput || !passwordInput) {
            showToast('输入失败, 未找到账号或密码输入框');
            return;
        }

        // 用户名、密码已有内容时不覆盖
        if (!usernameInput.value) {
            simulate(usernameInput, username);
        }
        if (!passwordInput.value) {
            simulate(passwordInput, password);
        }

        // 仅在页面展示验证码时才进行识别和填入
        if (hasCaptcha()) {
            const captchaInput = getCaptchaInput();
            if (captchaInput) {
                // 输入框已有验证码时先刷新，避免旧图对应的验证码已失效
                if (captchaInput.value) {
                    const captchaImage = getCaptchaImage();
                    captchaImage?.click();
                    await sleep(500);
                }
                const { code } = await recognizeCaptchaCode(ocrApiUrl);
                simulate(captchaInput, code);
            }
        }
    }

    try {
        const { quickLogin } = script.dataset;
        const loginConfig = JSON.parse(quickLogin || '{}');
        const {
            username,
            password,
            jumpProductPath,
            defaultTenantId,
            ocrApiUrl,
            autoTrigger,
            autoTriggerDelay,
        } = loginConfig;

        var loginBtn = createLoginButton();
        var autoTriggerController = null;
        var removeAutoTriggerListeners = () => {};
        loginBtn.addEventListener('click', async function () {
            // 手动点击时取消自动触发
            autoTriggerController?.cancel();
            if (!username || !password) {
                showToast(
                    '未配置账号或密码，即将为您打开扩展选项页进行配置...',
                    () => {
                        script.dispatchEvent(new CustomEvent('openOptionPage'));
                    }
                );
                return;
            }

            const configUrl = getDefaultJumpUrl(
                window.PARAMCONFIG?.DEFAULT_JUMP_PATH
            );
            const hasCustomJumpProductPath = Boolean(jumpProductPath);
            const productPath = !defaultTenantId
                ? '/publicService'
                : jumpProductPath;
            // 设置页为空时保留 DEFAULT_JUMP_PATH，避免把 /console/#/portal 改成 /console/#
            if (!defaultTenantId || hasCustomJumpProductPath) {
                // 只有显式配置 hash 路由时才写 hash，/batch 这类产品路径应该跳到站点根路径
                if (productPath.startsWith('#')) {
                    configUrl.hash = productPath;
                } else {
                    configUrl.pathname = productPath;
                    configUrl.hash = '';
                }
            }

            const urlParams = getUrlParams();
            let insightRedirectUrl = '';

            if (urlParams.insightRedirectUrl) {
                const decodeUrl = decodeURIComponent(
                    urlParams.insightRedirectUrl
                );
                const tempUrl = new URL(decodeUrl);
                // 排除portal页，因为未登录被强制退出时默认会跳回portal页
                if (!tempUrl.pathname.includes('/portal'))
                    insightRedirectUrl = decodeUrl;
            }

            const jumpUrl =
                insightRedirectUrl && urlParams.tenantId
                    ? decodeURIComponent(urlParams.insightRedirectUrl)
                    : configUrl.toString();

            await ensureUicLoginMode();
            await execQuickLogin(
                username,
                password,
                jumpUrl,
                urlParams.tenantId ?? defaultTenantId,
                ocrApiUrl
            );
        });

        var typingBtn = createTypingButton();
        typingBtn.addEventListener('click', async function () {
            if (!username || !password) {
                showToast(
                    '未配置账号或密码，即将为您打开扩展选项页进行配置...',
                    () => {
                        script.dispatchEvent(new CustomEvent('openOptionPage'));
                    }
                );
                return;
            }
            await ensureUicLoginMode();
            await typePassword(username, password, ocrApiUrl);
        });

        await waitPageDidMount();
        document.body.appendChild(loginBtn);
        document.body.appendChild(typingBtn);

        // 进入登录页面后延迟自动触发快速登录
        if (String(autoTrigger) !== 'false') {
            const delay = Number(autoTriggerDelay ?? 3) * 1000;
            let countdownToast = null;
            autoTriggerController = createAutoTriggerController({
                delay,
                countdownDelay: 2000,
                onCountdown: () => {
                    countdownToast = showToast('即将自动触发快速登录...');
                },
                onTrigger: () => {
                    removeAutoTriggerListeners();
                    loginBtn.click();
                },
                onCancel: () => {
                    removeAutoTriggerListeners();
                    // 倒计时提示尚未出现时静默取消，避免无操作上下文的额外提示
                    updateAutoTriggerCancellationToast(countdownToast);
                },
            });
            removeAutoTriggerListeners = bindAutoTriggerCancellation({
                eventTarget: document,
                controller: autoTriggerController,
                getCaptchaImage,
            });
            autoTriggerController.schedule();
        }
    } catch (error) {
        console.log('注入失败', error);
    }
})();
