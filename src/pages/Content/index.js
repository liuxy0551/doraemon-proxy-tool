import { isMatchedHost } from '@/utils/hostMatcher';
import { DEFAULT_AD_BLOCK_SELECTORS } from '@/const';
import { extractScore, isAiReviewerAuthor } from './gitlab-reviewer-core';

chrome.storage.local.get({ config: {}, allEnvList: [] }, function ({ config, allEnvList }) {
    function isSameHostname(urlStr) {
        if (!urlStr) return false;
        try {
            return new URL(urlStr).hostname === location.hostname;
        } catch (error) {
            return false;
        }
    }

    /*
     * 广告拦截：全局生效（不限于注入匹配地址）。
     * Google 的 vignette/锚定等广告元素会带内联 !important 样式（如 display:block !important），
     * 优先级高于样式表，单纯 CSS 隐藏无效，因此从 DOM 直接移除，并用 MutationObserver
     * 持续清除动态插入的广告。
     * 无全局开关：选择器全量存于配置 config.adBlockSelectors（内置默认已预填），
     * 非空即隐藏/移除，清空即完全不拦。
     */
    let adBlockSelectors = [...DEFAULT_AD_BLOCK_SELECTORS];

    // 移除指定根节点下的广告元素（含节点自身）。逐个选择器独立执行，
    // 不合法的选择器仅跳过该条，不影响其他规则。
    const removeAdNodes = (root) => {
        adBlockSelectors.forEach((selector) => {
            try {
                if (root.matches && root.matches(selector)) {
                    root.remove();
                    return;
                }
                root.querySelectorAll?.(selector).forEach((node) =>
                    node.remove()
                );
            } catch (e) {
                // 忽略非法/不支持的 CSS 选择器
            }
        });
    };

    let adBlockObserver = null;
    let adBlockStyleEl = null;

    const syncAdBlock = (selectors) => {
        adBlockSelectors =
            selectors === undefined || selectors === null
                ? [...DEFAULT_AD_BLOCK_SELECTORS]
                : (selectors || [])
                      .map((s) => String(s).trim())
                      .filter(Boolean);
        const hasSelectors = adBlockSelectors.length > 0;
        // CSS 隐藏层由配置选择器动态驱动：输入框清空后不再注入任何隐藏规则
        const cssText = adBlockSelectors
            .map((sel) => `${sel} { display: none !important; }`)
            .join('\n');
        if (hasSelectors) {
            if (!adBlockStyleEl) {
                adBlockStyleEl = document.createElement('style');
                adBlockStyleEl.id = 'doraemon-adblock-style';
                document.documentElement.appendChild(adBlockStyleEl);
            }
            adBlockStyleEl.textContent = cssText;
        } else if (adBlockStyleEl) {
            adBlockStyleEl.remove();
            adBlockStyleEl = null;
        }
        if (hasSelectors) {
            // 先清一遍已存在的广告节点
            removeAdNodes(document);
            // 再持续监听动态插入的广告节点
            if (!adBlockObserver) {
                adBlockObserver = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType !== Node.ELEMENT_NODE) return;
                            removeAdNodes(node);
                        });
                    });
                });
                adBlockObserver.observe(document.documentElement, {
                    childList: true,
                    subtree: true,
                });
            }
        } else if (adBlockObserver) {
            adBlockObserver.disconnect();
            adBlockObserver = null;
        }
    };
    syncAdBlock(config?.adBlockSelectors);
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        if (changes.config?.newValue) {
            syncAdBlock(changes.config.newValue.adBlockSelectors);
        }
    });

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
    // 面板与视口边缘保留的最小间距（默认右上角定位 right 也是 16px，保持一致）
    var panelEdgeOffset = 16;
    // 面板固有尺寸，用于中心线百分比与像素坐标互相换算（与 content.styles.css 保持一致）
    var panelDefaultWidth = 280;
    var panelDefaultHeight = 400;
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

    // 面板中心相对视口中心的百分比（正值偏右/下，负值偏左/上，0 表示居中）
    function panelCenterPercent(panel, left, top) {
        return {
            x: ((left + panel.offsetWidth / 2 - window.innerWidth / 2) / (window.innerWidth / 2)) * 100,
            y: ((top + panel.offsetHeight / 2 - window.innerHeight / 2) / (window.innerHeight / 2)) * 100,
        };
    }

    // 从中心线百分比换算回像素坐标（恢复时面板尚未创建，用默认尺寸估算，渲染后由 applyPanelPosition 校正）
    function panelPositionFromCenterPercent(percentX, percentY) {
        return {
            left: window.innerWidth / 2 + (percentX / 100) * (window.innerWidth / 2) - panelDefaultWidth / 2,
            top: window.innerHeight / 2 + (percentY / 100) * (window.innerHeight / 2) - panelDefaultHeight / 2,
        };
    }

    function savePanelPosition() {
        var panel = document.getElementById(panelId);
        if (!panel) return;
        var percent = panelCenterPercent(panel, panelPosition.left, panelPosition.top);
        var data = {};
        data[positionStorageKey] = {
            v: 2,
            centerXPercent: percent.x,
            centerYPercent: percent.y,
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
        // 基于当前视口尺寸做边界约束（保留 panelEdgeOffset 间距），并回写 panelPosition。
        // 大屏保存的位置（绝对 left/top）在小屏上可能越界不可见，这里统一拉回可视范围。
        var maxLeft = Math.max(window.innerWidth - panel.offsetWidth - panelEdgeOffset, 0);
        var maxTop = Math.max(window.innerHeight - panel.offsetHeight - panelEdgeOffset, 0);

        if (panelPosition.left === null) {
            panel.style.left = '';
            panel.style.right = panelPosition.right + 'px';
        } else {
            panelPosition.left = Math.min(Math.max(panelPosition.left, panelEdgeOffset), maxLeft);
            panel.style.left = panelPosition.left + 'px';
            panel.style.right = 'auto';
        }

        panelPosition.top = Math.min(Math.max(panelPosition.top, panelEdgeOffset), maxTop);
        panel.style.top = panelPosition.top + 'px';
    }

    function clampPanelPosition(panel, nextLeft, nextTop) {
        // 拖拽时同样保留边缘间距，不允许完全贴边
        var maxLeft = Math.max(window.innerWidth - panel.offsetWidth - panelEdgeOffset, 0);
        var maxTop = Math.max(window.innerHeight - panel.offsetHeight - panelEdgeOffset, 0);
        return {
            left: Math.min(Math.max(nextLeft, panelEdgeOffset), maxLeft),
            top: Math.min(Math.max(nextTop, panelEdgeOffset), maxTop),
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
        // 内容填充后面板高度才最终确定，重新应用一次位置避免 top 越界
        applyPanelPosition(panel);
        bindScrollTopButtonEvents(panel);
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
            var latestAnchor = baseUrl + '#note_' + notes[0].id;
            latestScoreHtml =
                '<a class="doraemon-gitlab-latest-score" href="' + latestAnchor + '" target="_self" title="跳转到最新审查评论">' +
                    '<span class="doraemon-gitlab-score-label">最新评分</span>' +
                    '<span class="doraemon-gitlab-score-value ' + scoreClass(latestScore) + '">' + latestScore + '分</span>' +
                '</a>';
        }

        setPanelContent(latestScoreHtml + reviewListHtml);
        updateScrollTopButtonVisibility(ensurePanel());
    }

    function fetchDiscussions() {
        // 先加载保存的面板位置，再发起请求（避免面板先显示默认位置再跳转）
        chrome.storage.local.get(positionStorageKey, function (result) {
            var saved = result[positionStorageKey];
            if (saved) {
                if (saved.centerXPercent !== undefined && saved.centerYPercent !== undefined) {
                    // 新格式：中心线百分比（跨屏保持相对位置）
                    var pixel = panelPositionFromCenterPercent(
                        saved.centerXPercent,
                        saved.centerYPercent
                    );
                    panelPosition.left = pixel.left;
                    panelPosition.right = null;
                    panelPosition.top = pixel.top;
                } else {
                    // 旧格式：绝对像素，兼容迁移前的存储
                    if (saved.left !== null && saved.left !== undefined) {
                        panelPosition.left = saved.left;
                        panelPosition.right = null;
                    } else if (saved.right !== undefined) {
                        panelPosition.right = saved.right;
                        panelPosition.left = null;
                    }
                    if (saved.top !== undefined) {
                        panelPosition.top = saved.top;
                    }
                }
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

        // 不预创建 loading 面板：无 AI Review 记录（历史 MR）时全程不展示浮框，
        // 避免"先出现再隐藏"的闪烁，确认有记录后才由 renderFloatingPanel 创建面板
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
                        var noteBody = typeof note.body === 'string' ? note.body : '';
                        // AI/bot 账号 + 正文含"总分"才计入，避免依赖会随项目变化的 bot username 白名单
                        if (!isAiReviewerAuthor(note.author)) continue;
                        // GitLab discussions.json 的原始 body 和页面渲染文本不完全一致，这里做多字段兜底
                        var score = extractScoreFromNote(note);
                        if (score === null) continue;
                        reviewerNotes.push({
                            id: note.id,
                            score: score,
                            createdAt: note.created_at,
                            body: noteBody,
                        });
                    }
                }

                cachedNotes = reviewerNotes;
                if (reviewerNotes.length === 0) {
                    // 历史 MR 没有 AI Review 记录，不展示浮框
                    return;
                }
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
        // 只有存在 AI Review 记录时才恢复面板；空记录（历史 MR）不展示
        if (cachedNotes && cachedNotes.length > 0) {
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
