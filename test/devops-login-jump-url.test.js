const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

let getDefaultJumpUrl;
let isPortalSubdomainOrigin;

try {
    const modulePath = process.env.DORAEMON_DEVOPS_LOGIN_MODULE
        ? path.resolve(__dirname, process.env.DORAEMON_DEVOPS_LOGIN_MODULE)
        : '../src/pages/Content/devops-login.js';
    ({ getDefaultJumpUrl, isPortalSubdomainOrigin } = require(modulePath));
} catch (error) {
    getDefaultJumpUrl = undefined;
    isPortalSubdomainOrigin = undefined;
}

function assertAvailable() {
    assert.equal(typeof getDefaultJumpUrl, 'function', '需要导出 getDefaultJumpUrl');
    assert.equal(typeof isPortalSubdomainOrigin, 'function', '需要导出 isPortalSubdomainOrigin');
}

// getDefaultJumpUrl 读取 window.location.origin，测试时注入假 window
function runGetDefaultJumpUrl(currentOrigin, defaultJumpPath) {
    const originBackup = global.window;
    global.window = { location: { origin: currentOrigin } };
    try {
        return getDefaultJumpUrl(defaultJumpPath);
    } finally {
        if (originBackup === undefined) {
            delete global.window;
        } else {
            global.window = originBackup;
        }
    }
}

test('导出跳转地址相关纯函数', () => {
    assertAvailable();
});

test('isPortalSubdomainOrigin：识别当前站点的 -portal 子域', () => {
    assert.equal(
        isPortalSubdomainOrigin(
            'http://shuzhan53-lzlj-update-portal.k8s.dtstack.cn/publicService/#/uic/products',
            'http://shuzhan53-lzlj-update.k8s.dtstack.cn'
        ),
        true
    );
});

test('isPortalSubdomainOrigin：非 -portal 后缀的子域不匹配', () => {
    assert.equal(
        isPortalSubdomainOrigin(
            'http://shuzhan53-lzlj-update-console.k8s.dtstack.cn',
            'http://shuzhan53-lzlj-update.k8s.dtstack.cn'
        ),
        false
    );
});

test('isPortalSubdomainOrigin：scheme 不同不匹配', () => {
    assert.equal(
        isPortalSubdomainOrigin(
            'https://shuzhan53-lzlj-update-portal.k8s.dtstack.cn',
            'http://shuzhan53-lzlj-update.k8s.dtstack.cn'
        ),
        false
    );
});

test('isPortalSubdomainOrigin：端口不同不匹配', () => {
    assert.equal(
        isPortalSubdomainOrigin(
            'http://shuzhan53-lzlj-update-portal.k8s.dtstack.cn:8443',
            'http://shuzhan53-lzlj-update.k8s.dtstack.cn'
        ),
        false
    );
});

test('getDefaultJumpUrl：同源地址正常返回且不追加 -portal 处理', () => {
    const currentOrigin = 'http://shuzhan63-online-dev.k8s.dtstack.cn';
    const url = runGetDefaultJumpUrl(
        currentOrigin,
        'http://shuzhan63-online-dev.k8s.dtstack.cn/publicService/#/uic/products'
    );
    assert.equal(url.origin, currentOrigin);
    assert.equal(url.pathname, '/publicService/');
    assert.equal(url.hash, '#/uic/products');
});

test('getDefaultJumpUrl：-portal 子域的默认跳转地址不再回退', () => {
    // 当前站点 xxx.k8s.dtstack.cn，DEFAULT_JUMP_PATH 指向 xxx-portal.k8s.dtstack.cn
    // 改造前会因 origin 不一致回退到当前站点 /portal，改造后应保留 -portal 子域
    const currentOrigin = 'http://shuzhan53-lzlj-update.k8s.dtstack.cn';
    const url = runGetDefaultJumpUrl(
        currentOrigin,
        'http://shuzhan53-lzlj-update-portal.k8s.dtstack.cn/publicService/#/uic/products'
    );
    assert.equal(
        url.origin,
        'http://shuzhan53-lzlj-update-portal.k8s.dtstack.cn'
    );
    assert.equal(url.pathname, '/publicService/');
});

test('getDefaultJumpUrl：非 -portal 子域仍回退到当前站点 /portal', () => {
    const url = runGetDefaultJumpUrl(
        'http://shuzhan53-lzlj-update.k8s.dtstack.cn',
        'http://shuzhan53-lzlj-update-console.k8s.dtstack.cn/publicService'
    );
    assert.equal(
        url.origin,
        'http://shuzhan53-lzlj-update.k8s.dtstack.cn'
    );
    assert.equal(url.pathname, '/portal');
});

test('getDefaultJumpUrl：空地址回退到 /portal', () => {
    const url = runGetDefaultJumpUrl('http://example.k8s.dtstack.cn', '');
    assert.equal(url.pathname, '/portal');
});

test('getDefaultJumpUrl：缺斜杠协议写法判无效回退 /portal', () => {
    const url = runGetDefaultJumpUrl('http://example.k8s.dtstack.cn', 'http:/console');
    assert.equal(url.pathname, '/portal');
});