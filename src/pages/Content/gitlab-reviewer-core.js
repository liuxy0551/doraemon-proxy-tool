/**
 * GitLab AI CodeReview 面板的纯逻辑（评分提取 + AI 作者识别）。
 * 由 Content/index.js（webpack contentScript 入口）和 gitlab-reviewer.js 共用，
 * 保持两处行为一致。
 */
(function (root, factory) {
    var api = factory();
    // Node 测试与 webpack 打包走 CommonJS 导出；同时注册全局，
    // 供独立加载的 gitlab-reviewer.js 在浏览器中使用
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.GitlabReviewerCore = api;
    }
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    /**
     * 从评论正文中提取总分，兼容半角/全角冒号
     */
    function extractScore(body) {
        if (typeof body !== 'string') return null;
        var match = body.match(/总分(?:为)?\s*[：:]?\s*(\d+)\s*分/);
        if (!match) {
            match = body.match(/总分\s*[\|\t ]+\s*(\d+)\s*分/);
        }
        return match ? parseInt(match[1], 10) : null;
    }

    /**
     * 判断作者是否为 AI/bot 评审账号：
     * 项目级 bot 的 username 是随机 hash（如 project_1232_bot_xxx），无法枚举，
     * 用显示名/用户名中的 ai、bot 关键词兜底
     */
    function isAiReviewerAuthor(author) {
        if (!author) return false;
        var hint = (author.name || '') + ' ' + (author.username || '');
        return /ai|bot/i.test(hint);
    }

    /**
     * 判断一条评论是否计入 AI CodeReview 面板：
     * AI/bot 账号 + 正文含"总分"才纳入，两者缺一不可
     */
    function getAiReviewScore(note) {
        if (!note || !isAiReviewerAuthor(note.author)) return null;
        return extractScore(typeof note.body === 'string' ? note.body : '');
    }

    return { extractScore, isAiReviewerAuthor, getAiReviewScore };
});
