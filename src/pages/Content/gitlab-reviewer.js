(function () {
    'use strict';

    // 仅在 GitLab MR 页面执行
    var mrMatch = window.location.pathname.match(/\/-\/merge_requests\/(\d+)/);
    if (!mrMatch) return;

    var mrId = mrMatch[1];
    var discussionsUrl = window.location.pathname + '/discussions.json?per_page=100';

    /**
     * 格式化时间为短格式
     */
    function formatTime(dateStr) {
        var d = new Date(dateStr);
        var month = d.getMonth() + 1;
        var day = d.getDate();
        var hours = String(d.getHours()).padStart(2, '0');
        var minutes = String(d.getMinutes()).padStart(2, '0');
        return month + '/' + day + ' ' + hours + ':' + minutes;
    }

    /**
     * 获取评分颜色类名
     */
    function scoreClass(score) {
        if (score === null) return '';
        if (score >= 85) return 'score-good';
        if (score >= 70) return 'score-ok';
        return 'score-bad';
    }

    /**
     * 从 Note 正文中提取总分
     */
    function extractScore(body) {
        var match = body.match(/总分[：:](\d+)分/);
        return match ? parseInt(match[1], 10) : null;
    }

    /**
     * 创建并显示悬浮面板
     */
    function renderFloatingPanel(notes) {
        if (document.getElementById('doraemon-gitlab-panel')) return;

        // 按时间排序（最新的在前）
        notes.sort(function (a, b) {
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        var latestScore = notes.length > 0 ? notes[0].score : null;

        // 构建历史列表 HTML
        var reviewListHtml = '';
        if (notes.length > 0) {
            var items = '';
            for (var i = 0; i < notes.length; i++) {
                var note = notes[i];
                var sc = note.score !== null ? note.score : '—';
                var scCls = scoreClass(note.score);
                items +=
                    '<div class="doraemon-gitlab-review-item">' +
                        '<span class="doraemon-gitlab-review-index">#' + (notes.length - i) + '</span>' +
                        '<span class="doraemon-gitlab-review-score ' + scCls + '">' + sc + '分</span>' +
                        '<span class="doraemon-gitlab-review-time">' + formatTime(note.createdAt) + '</span>' +
                    '</div>';
            }
            reviewListHtml =
                '<h4 class="doraemon-gitlab-review-title">审查历史 (' + notes.length + '次)</h4>' +
                '<div class="doraemon-gitlab-review-list">' + items + '</div>';
        } else {
            reviewListHtml = '<div class="doraemon-gitlab-empty">暂无审查记录</div>';
        }

        // 最新评分区域
        var latestScoreHtml = '';
        if (latestScore !== null) {
            latestScoreHtml =
                '<div class="doraemon-gitlab-latest-score">' +
                    '<span class="doraemon-gitlab-score-label">最新评分</span>' +
                    '<span class="doraemon-gitlab-score-value ' + scoreClass(latestScore) + '">' + latestScore + '分</span>' +
                '</div>';
        }

        // 创建面板
        var panel = document.createElement('div');
        panel.id = 'doraemon-gitlab-panel';
        panel.className = 'doraemon-gitlab-panel';
        panel.innerHTML =
            '<div class="doraemon-gitlab-header">' +
                '<span class="doraemon-gitlab-header-title">Doraemon AI CodeReview</span>' +
                '<button class="doraemon-gitlab-close" title="关闭">&times;</button>' +
            '</div>' +
            '<div class="doraemon-gitlab-body">' +
                latestScoreHtml +
                reviewListHtml +
            '</div>';

        // 关闭按钮事件
        panel.querySelector('.doraemon-gitlab-close').addEventListener('click', function () {
            panel.remove();
        });

        document.body.appendChild(panel);
    }

    /**
     * 获取讨论数据并解析 Front-Gitlab-AI-CodeReviewer 评论
     */
    function fetchDiscussions() {
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

                // 遍历 discussions 和 notes
                for (var d = 0; d < data.length; d++) {
                    var discussion = data[d];
                    var notes = discussion.notes || [];
                    for (var n = 0; n < notes.length; n++) {
                        var note = notes[n];
                        // 检查是否是 Front-Gitlab-AI-CodeReviewer 的评论
                        if (
                            note.author &&
                            (note.author.name === 'Front-Gitlab-AI-CodeReviewer' ||
                             note.author.username === 'group_10_bot_33a8ceb162e44e0cf49bb168b87ed7da')
                        ) {
                            var score = extractScore(note.body);
                            reviewerNotes.push({
                                id: note.id,
                                score: score,
                                createdAt: note.created_at,
                                body: note.body,
                            });
                        }
                    }
                }

                renderFloatingPanel(reviewerNotes);
            })
            .catch(function (err) {
                console.error('Doraemon: 获取 GitLab 讨论失败', err);
            });
    }

    // 页面加载完成后获取讨论数据
    if (document.readyState === 'complete') {
        fetchDiscussions();
    } else {
        window.addEventListener('load', fetchDiscussions);
    }
})();