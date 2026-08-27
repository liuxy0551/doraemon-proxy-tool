// 哆啦A梦后端接口地址
export const serverUrl = 'http://172.16.100.225:7001';

// 哆啦A梦访问地址
export const doraemonUrl = 'http://172.16.100.225:7001/page/proxy-server';

export enum POPUP_SIZE_TYPE {
    DEFAULT = 1,
    SMALL,
    LARGE,
    AUTO,
    CUSTOM,
}

export enum POPUP_TAB {
    PROXY = 'proxy',
    ENV = 'env',
}

// ---------- 广告拦截内置默认规则 ----------
// 作为「广告拦截」配置输入框的默认值展示（用户可增删改，保存后即为最终生效列表）

// 请求级拦截规则（DNR urlFilter，|| 前缀匹配任意子域，^ 表示域名/路径边界）
export const DEFAULT_AD_BLOCK_RULES = [
    '||doubleclick.net^',
    '||googlesyndication.com^',
    '||googleadservices.com^',
    '||googletagservices.com^',
    '||wwads.cn^', // 万维广告联盟（含 cdn.wwads.cn 素材）
    '||static.json.cn/d/dt/', // json.cn 广告脚本目录（避免误拦 json.cn 正常静态资源）
];

// 页面广告元素选择器（CSS selector，命中即从 DOM 移除）
export const DEFAULT_AD_BLOCK_SELECTORS = [
    'ins.adsbygoogle',
    'ins[data-adsbygoogle-status]',
    'ins[data-vignette-loaded]',
    'div[data-anchor-status]',
    'iframe[id^="aswift_"]',
    'iframe[src*="doubleclick"]',
    'iframe[src*="googlesyndication"]',
    '.wwads-cn', // 万维广告联盟容器
    '[class*="wwads"]', // 万维广告联盟子元素兜底
];
