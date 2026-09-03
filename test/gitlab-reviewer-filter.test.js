const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

let isAiReviewerAuthor;
let getAiReviewScore;
let extractScore;

try {
    const modulePath = process.env.DORAEMON_GITLAB_REVIEWER_MODULE
        ? path.resolve(__dirname, process.env.DORAEMON_GITLAB_REVIEWER_MODULE)
        : '../src/pages/Content/gitlab-reviewer-core.js';
    ({ isAiReviewerAuthor, getAiReviewScore, extractScore } = require(modulePath));
} catch (error) {
    isAiReviewerAuthor = undefined;
    getAiReviewScore = undefined;
    extractScore = undefined;
}

function assertExported(fn, name) {
    assert.equal(typeof fn, 'function', `需要导出 ${name}`);
}

test('导出 AI 评审过滤相关纯函数', () => {
    assertExported(isAiReviewerAuthor, 'isAiReviewerAuthor');
    assertExported(getAiReviewScore, 'getAiReviewScore');
    assertExported(extractScore, 'extractScore');
});

test('识别各类 AI 评审账号（含项目级 bot 用户名）', () => {
    assert.equal(
        isAiReviewerAuthor({
            name: 'Front-Gitlab-AI-CodeReviewer',
            username: 'group_10_bot_33a8ceb162e44e0cf49bb168b87ed7da',
        }),
        true
    );
    assert.equal(
        isAiReviewerAuthor({
            name: 'code-review-ai-2026',
            username: 'project_1232_bot_76b0ba647f0f78849365f8ab8e12e264',
        }),
        true
    );
    assert.equal(
        isAiReviewerAuthor({
            name: 'code-reviewer-ai',
            username: 'project_1232_bot_b7f78b993702e00a6772d4274eb1168d',
        }),
        true
    );
    // 显示名不含 ai/bot 但用户名是 bot 账号时也应命中
    assert.equal(isAiReviewerAuthor({ name: 'Some Reviewer', username: 'group_10_bot_abc' }), true);
});

test('不把普通人类作者当作 AI 评审', () => {
    assert.equal(isAiReviewerAuthor({ name: 'liuyi', username: 'liuyi' }), false);
    assert.equal(isAiReviewerAuthor({ name: 'xuxiaoqi', username: 'xuxiaoqi' }), false);
    assert.equal(isAiReviewerAuthor(null), false);
    assert.equal(isAiReviewerAuthor({}), false);
});

test('从 AI 评审评论中提取总分', () => {
    assert.equal(
        getAiReviewScore({
            author: { name: 'Front-Gitlab-AI-CodeReviewer' },
            body: '...评审内容...\n\n总分:90分\n',
        }),
        90
    );
    assert.equal(
        getAiReviewScore({
            author: { name: 'code-review-ai-2026' },
            body: '总分:93分',
        }),
        93
    );
    assert.equal(
        getAiReviewScore({
            author: { name: 'code-review-ai-2026' },
            body: '总分：88分',
        }),
        88
    );
});

test('无评分或非 AI 作者的评论不进入审查列表', () => {
    // AI 的总结类评论没有总分，不计入
    assert.equal(
        getAiReviewScore({
            author: { name: 'code-reviewer-ai' },
            body: '提交范围 在 xxx 和 yyy 之间 总结 文件名 总结 Tips 本 AI 自动忽略解冲突分支',
        }),
        null
    );
    // 人类手写总分也不计入
    assert.equal(
        getAiReviewScore({ author: { name: 'liuyi', username: 'liuyi' }, body: '总分:95分' }),
        null
    );
    assert.equal(getAiReviewScore(null), null);
});

test('extractScore 兼容半角/全角冒号', () => {
    assert.equal(extractScore('总分:90分'), 90);
    assert.equal(extractScore('总分：90分'), 90);
    assert.equal(extractScore('没有评分'), null);
});

test('gitlab-reviewer.js 复用共享核心逻辑而非自带副本', () => {
    const core = require('../src/pages/Content/gitlab-reviewer-core.js');
    const standalone = require('../src/pages/Content/gitlab-reviewer.js');
    assert.equal(standalone.extractScore, core.extractScore);
    assert.equal(standalone.isAiReviewerAuthor, core.isAiReviewerAuthor);
    assert.equal(standalone.getAiReviewScore, core.getAiReviewScore);
});

test('生效入口 Content/index.js 使用共享核心且不含硬编码白名单', () => {
    const fs = require('node:fs');
    const source = fs.readFileSync(
        path.resolve(__dirname, '../src/pages/Content/index.js'),
        'utf8'
    );
    assert.ok(
        source.includes('gitlab-reviewer-core'),
        'Content/index.js 应从 gitlab-reviewer-core 引入过滤逻辑'
    );
    assert.ok(
        !source.includes('group_10_bot_33a8ceb'),
        'Content/index.js 不应再硬编码 bot username 白名单'
    );
});
