import { isMatchedHost } from '@/utils/hostMatcher';

chrome.storage.local.get({ config: {}, allEnvList: [] }, function ({ config, allEnvList }) {
    function isSameHostname(urlStr) {
        if (!urlStr) return false;
        try {
            return new URL(urlStr).hostname === location.hostname;
        } catch (error) {
            return false;
        }
    }

    // 检测 GitLab MR 页面，添加 AI CodeReview 悬浮面板（内容脚本直接操作 DOM）
    if (
        config?.gitlabReviewEnabled !== false &&
        location.hostname.indexOf('gitlab.') !== -1 &&
        /\/-\/merge_requests\/\d+/.test(location.pathname)
    ) {
        injectGitlabReviewer(config);
    }

    if (
        !isMatchedHost(config?.matchUrls, location.hostname) &&
        !allEnvList?.some((env) => isSameHostname(env.url))
    )
        return false;

    if (config?.devopsInjectEnabled) {
        console.log(
            'Doraemon插件Works! ' + new Date().toLocaleString()
        );
        var hackElement = document.createElement('script');
        hackElement.src = chrome.runtime.getURL('devops.js');
        document.documentElement.appendChild(hackElement);
    }

    function isUic() {
        const { hostname, pathname } = window.location;
        const devopsEnvRegex = /base(\d+)\.devops\.dtstack\.cn/;

        // devops环境考虑存在低版本，其他环境默认都为60以上版本
        if (devopsEnvRegex.test(hostname)) {
            const match = hostname.match(devopsEnvRegex);
            const version = match && match[1];
            if (!version) return false;
            if (Number(version) >= 60) {
                return ['/', '/uic/'].includes(pathname);
            } else {
                return hostname.startsWith('uicfront');
            }
        } else {
            return ['/', '/uic/'].includes(pathname);
        }
    }

    if (config?.quickLogin?.enabled && isUic()) {
        var sm2Script = document.createElement('script');
        sm2Script.src = chrome.runtime.getURL('sm2.js');
        document.documentElement.appendChild(sm2Script);

        var loginScript = document.createElement('script');
        loginScript.src = chrome.runtime.getURL('devops-login.js');

        const loginConfig = {
            ...config.quickLogin,
        }

        const envInfo = allEnvList.find(env => isSameHostname(env.url));

        // 优先取env配置
        if (envInfo && envInfo.uicUsername) {
            loginConfig.username = envInfo.uicUsername;
            loginConfig.password= envInfo.uicPasswd;
        }

        loginScript.dataset.quickLogin = JSON.stringify(loginConfig);
        loginScript.defer = true;

        // 只有Background中才能访问openOptionPage API
        loginScript.addEventListener('openOptionPage', () => {
            chrome.runtime.sendMessage({ action: 'openOptionPage' });
        });
        loginScript.addEventListener('recognizeCaptcha', async () => {
            const request = JSON.parse(loginScript.dataset.ocrRequest || '{}');
            try {
                const image = request.image;
                if (!image) throw new Error('未读取到验证码图片');
                chrome.runtime.sendMessage(
                    {
                        action: 'recognizeCaptcha',
                        ocrApiUrl: loginConfig.ocrApiUrl,
                        image,
                    },
                    (response) => {
                        const errorMessage = chrome.runtime.lastError?.message;
                        loginScript.dataset.ocrResponse = JSON.stringify({
                            requestId: request.requestId,
                            ...(response || {
                                success: false,
                                message: errorMessage || 'OCR请求失败',
                            }),
                        });
                        loginScript.dispatchEvent(new CustomEvent('captchaRecognized'));
                    }
                );
            } catch (error) {
                loginScript.dataset.ocrResponse = JSON.stringify({
                    requestId: request.requestId,
                    success: false,
                    message: error?.message || '验证码图片读取失败',
                });
                loginScript.dispatchEvent(new CustomEvent('captchaRecognized'));
            }
        });
        document.documentElement.appendChild(loginScript);
    }
});

/**
 * GitLab MR 页面 AI CodeReview 悬浮面板
 * 内容脚本直接调用，不依赖页面级脚本注入
 */
function extractBaseMrPath(pathname) {
    var match = pathname.match(/^(.*?\/-\/merge_requests\/\d+)/);
    return match ? match[1] : pathname;
}

function injectGitlabReviewer(config) {
    var baseMrPath = extractBaseMrPath(location.pathname);
    var discussionsUrl = location.origin + baseMrPath + '/discussions.json?per_page=100';
    var panelId = 'doraemon-gitlab-panel';
    var panelLogoUrl = chrome.runtime.getURL('icon-16.png');
    var showScrollTopButton = true;
    var scrollTopThreshold = 240;
    var cachedNotes = null;
    var panelPosition = {
        top: 60,
        right: 16,
        left: null,
    };
    var dragState = {
        active: false,
        offsetX: 0,
        offsetY: 0,
    };
    // 持久化存储键，全局统一位置（所有 MR 共用）
    var positionStorageKey = 'gitlabPanelPosition';

    function savePanelPosition() {
        var data = {};
        data[positionStorageKey] = {
            left: panelPosition.left,
            right: panelPosition.right,
            top: panelPosition.top,
        };
        chrome.storage.local.set(data);
    }

    function formatTime(dateStr) {
        var d = new Date(dateStr);
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
            String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0');
    }

    function scoreClass(score) {
        if (score === null) return '';
        if (score >= 85) return 'score-good';
        if (score >= 70) return 'score-ok';
        return 'score-bad';
    }

    function extractScore(body) {
        if (typeof body !== 'string') return null;
        var match = body.match(/总分(?:为)?\s*[：:]?\s*(\d+)\s*分/);
        if (!match) {
            match = body.match(/总分\s*[\|\t ]+\s*(\d+)\s*分/);
        }
        return match ? parseInt(match[1], 10) : null;
    }

    function extractTextFromHtml(html) {
        if (typeof html !== 'string' || !html) return '';
        var temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent || temp.innerText || '';
    }

    function extractRenderedNoteText(noteId) {
        if (!noteId) return '';
        var noteRoot = document.getElementById('note_' + noteId);
        if (!noteRoot) return '';
        var noteText = noteRoot.querySelector('.note-text');
        if (!noteText) return '';
        return noteText.textContent || noteText.innerText || '';
    }

    function extractScoreFromNote(note) {
        var candidates = [
            note?.body,
            note?.note_html,
            note?.body_html,
            note?.rendered_body,
            extractTextFromHtml(note?.note_html),
            extractTextFromHtml(note?.body_html),
            extractTextFromHtml(note?.rendered_body),
            extractRenderedNoteText(note?.id),
        ];

        for (var i = 0; i < candidates.length; i++) {
            var score = extractScore(candidates[i]);
            if (score !== null) return score;
        }

        return null;
    }

    function getMountNode() {
        return document.body || document.documentElement;
    }

    function renderScrollTopButton() {
        if (!showScrollTopButton) return '';
        return (
            '<button class="doraemon-gitlab-scroll-top" type="button" title="回到顶部" aria-label="回到顶部">' +
                '<span class="doraemon-gitlab-scroll-top-icon" aria-hidden="true">' +
                    '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">' +
                        '<path d="M896 96H128c-17.066667 0-32 14.933333-32 32S110.933333 160 128 160h768c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32zM535.466667 296.533333c-12.8-12.8-32-12.8-44.8 0l-213.333334 213.333334c-12.8 12.8-12.8 32 0 44.8s32 12.8 44.8 0l157.866667-157.866667V853.333333c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V396.8l157.866667 157.866667c6.4 6.4 14.933333 8.533333 23.466666 8.533333s17.066667-2.133333 23.466667-8.533333c12.8-12.8 12.8-32 0-44.8l-213.333333-213.333334z" fill="#666666"></path>' +
                    '</svg>' +
                '</span>' +
            '</button>'
        );
    }

    function ensurePanel() {
        var panel = document.getElementById(panelId);
        if (panel) return panel;

        panel = document.createElement('div');
        panel.id = panelId;
        panel.className = 'doraemon-gitlab-panel';
        panel.innerHTML =
            '<div class="doraemon-gitlab-header">' +
                '<span class="doraemon-gitlab-header-title">' +
                    '<img class="doraemon-gitlab-header-logo" src="' + panelLogoUrl + '" alt="Doraemon logo" />' +
                    '<span>AI CodeReview 列表</span>' +
                '</span>' +
                '<button class="doraemon-gitlab-close" title="关闭">&times;</button>' +
            '</div>' +
            '<div class="doraemon-gitlab-body"></div>';

        panel.querySelector('.doraemon-gitlab-close').addEventListener('click', function () {
            panel.remove();
        });

        getMountNode().appendChild(panel);
        applyPanelPosition(panel);
        bindDragEvents(panel);
        bindScrollTopButtonEvents(panel);
        return panel;
    }

    function applyPanelPosition(panel) {
        if (panelPosition.left === null) {
            panel.style.left = '';
            panel.style.right = panelPosition.right + 'px';
        } else {
            panel.style.left = panelPosition.left + 'px';
            panel.style.right = 'auto';
        }
        panel.style.top = panelPosition.top + 'px';
    }

    function clampPanelPosition(panel, nextLeft, nextTop) {
        var maxLeft = Math.max(window.innerWidth - panel.offsetWidth, 0);
        var maxTop = Math.max(window.innerHeight - panel.offsetHeight, 0);
        return {
            left: Math.min(Math.max(nextLeft, 0), maxLeft),
            top: Math.min(Math.max(nextTop, 0), maxTop),
        };
    }

    function bindDragEvents(panel) {
        var header = panel.querySelector('.doraemon-gitlab-header');
        if (!header) return;

        function stopDragging() {
            dragState.active = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', stopDragging);
            savePanelPosition();
        }

        function handleMouseMove(event) {
            if (!dragState.active) return;
            var nextLeft = event.clientX - dragState.offsetX;
            var nextTop = event.clientY - dragState.offsetY;
            var nextPosition = clampPanelPosition(panel, nextLeft, nextTop);
            panelPosition.left = nextPosition.left;
            panelPosition.top = nextPosition.top;
            applyPanelPosition(panel);
        }

        header.addEventListener('mousedown', function (event) {
            // 点击关闭按钮时保持原交互，不进入拖拽
            if (event.target.closest('.doraemon-gitlab-close')) return;

            var rect = panel.getBoundingClientRect();
            dragState.active = true;
            dragState.offsetX = event.clientX - rect.left;
            dragState.offsetY = event.clientY - rect.top;
            panelPosition.left = rect.left;
            panelPosition.top = rect.top;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', stopDragging);
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', stopDragging);
        });
    }

    function updateScrollTopButtonVisibility(panel) {
        var scrollTopButton = panel.querySelector('.doraemon-gitlab-scroll-top');
        if (!scrollTopButton) return;
        scrollTopButton.classList.toggle(
            'is-visible',
            showScrollTopButton && window.scrollY > scrollTopThreshold
        );
    }

    function bindScrollTopButtonEvents(panel) {
        var scrollTopButton = panel.querySelector('.doraemon-gitlab-scroll-top');
        if (!scrollTopButton || scrollTopButton.dataset.bound === 'true') return;

        scrollTopButton.dataset.bound = 'true';
        scrollTopButton.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            scrollPageToTop();
        });

        // 页面滚动到一定距离后才显示，避免默认干扰当前信息
        var handleWindowScroll = function () {
            updateScrollTopButtonVisibility(panel);
        };
        window.addEventListener('scroll', handleWindowScroll, { passive: true });
        updateScrollTopButtonVisibility(panel);
    }

    function scrollElementToTop(element) {
        if (!element) return;
        if (typeof element.scrollTo === 'function') {
            element.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        }
        element.scrollTop = 0;
    }

    function scrollPageToTop() {
        var rootCandidates = [
            window,
            document.scrollingElement,
            document.documentElement,
            document.body,
            document.querySelector('.layout-page'),
            document.querySelector('.content-wrapper'),
            document.querySelector('.page-content'),
            document.querySelector('[data-testid="page-content"]'),
            document.querySelector('main'),
        ];

        // GitLab 页面在不同布局下可能不是 window 在滚动，这里对常见根容器逐个兜底
        for (var i = 0; i < rootCandidates.length; i++) {
            var target = rootCandidates[i];
            if (!target) continue;
            if (target === window) {
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth',
                });
                continue;
            }
            scrollElementToTop(target);
        }
    }

    function setPanelContent(html) {
        var panel = ensurePanel();
        var body = panel.querySelector('.doraemon-gitlab-body');
        body.innerHTML = html;
        bindScrollTopButtonEvents(panel);
    }

    function renderLoadingPanel() {
        setPanelContent(
            '<div class="doraemon-gitlab-status">正在读取 AI Review 记录...</div>'
        );
    }

    function renderErrorPanel(message) {
        setPanelContent(
            '<div class="doraemon-gitlab-status doraemon-gitlab-status-error">' +
                '读取失败：' + message +
            '</div>'
        );
    }

    function renderFloatingPanel(notes) {
        ensurePanel();

        notes.sort(function (a, b) {
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        var latestScore = notes.length > 0 ? notes[0].score : null;
        var baseUrl = location.origin + baseMrPath;

        var reviewListHtml = '';
        if (notes.length > 0) {
            var items = '';
            for (var i = 0; i < notes.length; i++) {
                var note = notes[i];
                var sc = note.score !== null ? note.score + '分' : '未识别';
                var scCls = scoreClass(note.score);
                var anchor = baseUrl + '#note_' + note.id;
                items +=
                    '<a class="doraemon-gitlab-review-item" href="' + anchor + '" target="_self">' +
                        '<span class="doraemon-gitlab-review-index">#' + (notes.length - i) + '</span>' +
                        '<span class="doraemon-gitlab-review-score ' + scCls + '">' + sc + '</span>' +
                        '<span class="doraemon-gitlab-review-time">' + formatTime(note.createdAt) + '</span>' +
                    '</a>';
            }
            reviewListHtml =
                '<div class="doraemon-gitlab-review-section">' +
                    '<div class="doraemon-gitlab-review-title-row">' +
                        '<h4 class="doraemon-gitlab-review-title">审查历史 (' + notes.length + '次)</h4>' +
                        renderScrollTopButton() +
                    '</div>' +
                    '<div class="doraemon-gitlab-review-list">' + items + '</div>' +
                '</div>';
        } else {
            reviewListHtml = '<div class="doraemon-gitlab-empty">暂无审查记录</div>';
        }

        var latestScoreHtml = '';
        if (latestScore !== null) {
            latestScoreHtml =
                '<div class="doraemon-gitlab-latest-score">' +
                    '<span class="doraemon-gitlab-score-label">最新评分</span>' +
                    '<span class="doraemon-gitlab-score-value ' + scoreClass(latestScore) + '">' + latestScore + '分</span>' +
                '</div>';
        }

        setPanelContent(latestScoreHtml + reviewListHtml);
        updateScrollTopButtonVisibility(ensurePanel());
    }

    function fetchDiscussions() {
        // 先加载保存的面板位置，再发起请求（避免面板先显示默认位置再跳转）
        chrome.storage.local.get(positionStorageKey, function (result) {
            var saved = result[positionStorageKey];
            if (saved) {
                if (saved.left !== null && saved.left !== undefined) {
                    panelPosition.left = saved.left;
                    panelPosition.right = null;
                } else if (saved.right !== undefined) {
                    panelPosition.right = saved.right;
                    panelPosition.left = null;
                }
                panelPosition.top = saved.top;
            }

            doFetchDiscussions();
        });
    }

    function doFetchDiscussions() {
        var csrfToken = '';
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) {
            csrfToken = meta.getAttribute('content');
        }

        var headers = {
            'X-Requested-With': 'XMLHttpRequest',
        };
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        renderLoadingPanel();

        fetch(discussionsUrl, {
            credentials: 'same-origin',
            headers: headers,
        })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function (data) {
                var reviewerNotes = [];

                for (var d = 0; d < data.length; d++) {
                    var discussion = data[d];
                    var notes = discussion.notes || [];
                    for (var n = 0; n < notes.length; n++) {
                        var note = notes[n];
                        if (
                            note.author &&
                            (note.author.name === 'Front-Gitlab-AI-CodeReviewer' ||
                             note.author.username === 'group_10_bot_33a8ceb162e44e0cf49bb168b87ed7da')
                        ) {
                            var noteBody = typeof note.body === 'string' ? note.body : '';
                            // GitLab discussions.json 的原始 body 和页面渲染文本不完全一致，这里做多字段兜底
                            var score = extractScoreFromNote(note);
                            reviewerNotes.push({
                                id: note.id,
                                score: score,
                                createdAt: note.created_at,
                                body: noteBody,
                            });
                        }
                    }
                }

                cachedNotes = reviewerNotes;
                renderFloatingPanel(reviewerNotes);
            })
            .catch(function (err) {
                console.error('Doraemon: 获取 GitLab 讨论失败', err);
                renderErrorPanel(err?.message || '未知错误');
            });
    }

    function restorePanelIfNeeded() {
        if (document.getElementById(panelId)) return;
        if (!/\/-\/merge_requests\/\d+/.test(location.pathname)) return;
        if (cachedNotes) {
            renderFloatingPanel(cachedNotes);
        }
    }

    // GitLab 使用 Turbo/SPA 导航时不会触发整页刷新，监听导航事件恢复被销毁的面板
    window.addEventListener('popstate', restorePanelIfNeeded);
    document.addEventListener('turbo:load', restorePanelIfNeeded);
    document.addEventListener('turbolinks:load', restorePanelIfNeeded);
    document.addEventListener('pjax:end', restorePanelIfNeeded);

    // 页面加载完成后获取讨论数据
    if (document.readyState === 'complete') {
        fetchDiscussions();
    } else {
        window.addEventListener('load', fetchDiscussions);
    }
}
