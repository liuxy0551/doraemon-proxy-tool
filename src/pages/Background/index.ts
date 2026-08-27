import api from '@/api';
import {
    POPUP_SIZE_TYPE,
    POPUP_TAB,
    DEFAULT_AD_BLOCK_RULES,
    DEFAULT_AD_BLOCK_SELECTORS,
} from '@/const';
import { isMatchedHost, isIpAddress } from '@/utils/hostMatcher';

const getLocalIp = async () => {
    const res = await api.getLocalIp();
    if (res.success) {
        const ip = res.data?.localIp || '';
        await chrome.storage.local.set({ ip });
    }
};

const getProxyServers = async () => {
    const { ip } = await chrome.storage.local.get('ip');
    const res = await api.getProxyServers({ userIP: ip });
    if (res.success) {
        const serverList = res.data || [];
        await chrome.storage.local.set({
            proxyServers: serverList,
        });
    }
};

const getAllEnvList = async () => {
    const res = await api.getEnvList();
    if (res.success) {
        const envList = res.data || [];
        await chrome.storage.local.set({
            allEnvList: envList,
        });
    }
};

const mergeConfigs = (oldConfig, newConfig) => {
    for (let key in newConfig) {
        if (newConfig.hasOwnProperty(key)) {
            if (
                !oldConfig.hasOwnProperty(key) ||
                oldConfig[key] === undefined
            ) {
                // 缺失的字段补默认值（数组深拷贝，避免与原默认配置共享引用）
                oldConfig[key] = Array.isArray(newConfig[key])
                    ? [...newConfig[key]]
                    : newConfig[key];
            } else if (key === 'adBlockRules' || key === 'adBlockSelectors') {
                // 广告拦截规则：缺失字段已在上方分支补内置默认。
                // 此处仅当旧列表非空且与默认完全无交集（旧版「仅自定义」语义）时合并补内置；
                // 空数组（用户显式清空）或已含内置的自定义列表保持原样，避免清空后被重置。
                const oldList = Array.isArray(oldConfig[key])
                    ? oldConfig[key]
                    : [];
                const newList = Array.isArray(newConfig[key])
                    ? newConfig[key]
                    : [];
                if (
                    oldList.length > 0 &&
                    oldList.every((item) => !newList.includes(item))
                ) {
                    oldConfig[key] = [...new Set([...newList, ...oldList])];
                }
            } else if (
                typeof oldConfig[key] === 'object' &&
                typeof newConfig[key] === 'object' &&
                !Array.isArray(oldConfig[key]) &&
                !Array.isArray(newConfig[key])
            ) {
                mergeConfigs(oldConfig[key], newConfig[key]);
            }
        }
    }
    return oldConfig;
};

const getDevopsUrl = async (urlStr?: string) => {
    if (!urlStr) return '';
    const {
        config: { matchUrls },
    } = (await chrome.storage.local.get('config')) || {};
    const url = new URL(urlStr);

    if (!isMatchedHost(matchUrls, url.hostname)) return '';

    // IP 地址不支持 devops 翻转（dev. 前缀对 IP 无效）
    if (isIpAddress(url.hostname)) return '';

    if (
        ['dev', 'local'].some((prefix) => url.hostname.startsWith(prefix)) ||
        (url.port !== '80' && url.port !== '')
    ) {
        url.hostname = url.hostname.replace(/dev.|local./, '');
        url.port = '80';
    } else {
        url.hostname = 'dev.' + url.hostname;
        url.port = '8080';
    }

    return url.toString();
};

const handleContextMenuClick = async (info, tab?: chrome.tabs.Tab) => {
    if (!tab) return;

    const url = await getDevopsUrl(tab.url);
    if (!url) return;

    if (info.menuItemId === 'devops_new_tab') {
        chrome.tabs.create({
            url,
            index: tab.index + 1,
        });
    } else if (info.menuItemId === 'devops_current_tab') {
        await chrome.tabs.remove(tab.id!);
        chrome.tabs.create({
            url,
            index: tab.index,
        });
    }
};

const recognizeCaptcha = async (ocrApiUrl: string, image: string) => {
    if (!ocrApiUrl) {
        throw new Error('未配置OCR接口地址');
    }

    const ocrUrl = new URL('/ocr', ocrApiUrl);
    const res = await fetch(ocrUrl.toString(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image,
            probability: false,
        }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`OCR接口请求失败: ${res.status} ${body}`);
    }

    const data = await res.json();
    const result = String(data?.result || '').trim();
    if (!result) {
        throw new Error('OCR接口未返回识别结果');
    }
    return result;
};

const registerContectMenus = () => {
    chrome.contextMenus.create({
        id: 'devops',
        title: '环境翻转',
        contexts: ['page'],
    });
    chrome.contextMenus.create({
        id: 'devops_new_tab',
        parentId: 'devops',
        title: '新标签页打开',
        contexts: ['page'],
    });
    chrome.contextMenus.create({
        id: 'devops_current_tab',
        parentId: 'devops',
        title: '当前页打开',
        contexts: ['page'],
    });
};

// ---------- 广告拦截：declarativeNetRequest 动态规则 ----------
// 拦截规则全量存于配置 config.adBlockRules（内置规则已在初始配置中预填），
// 此处仅负责把配置解析为 DNR 规则并同步。

// 本扩展广告规则 id 基数（统一区间，方便全量移除；同时兼容清理旧版本 200000~ 区间）
const AD_BLOCK_RULE_ID_BASE = 200000;

// 旧版本使用的内置规则固定 id（升级后需一并清理，避免残留）
const LEGACY_AD_BLOCK_RULE_IDS = [100, 101, 102, 103, 104, 105];

// 配置缺失时才使用内置默认（用户显式保存的空数组/自定义列表会被尊重）
const resolveAdBlockRules = (config?: Partial<IConfig>): string[] =>
    config?.adBlockRules === undefined || config?.adBlockRules === null
        ? DEFAULT_AD_BLOCK_RULES
        : config.adBlockRules;

// 解析拦截规则：纯域名自动转成 "||domain^"，其余按完整 urlFilter 原样使用
const parseAdBlockRules = (
    allRules: string[] = []
): chrome.declarativeNetRequest.Rule[] => {
    const seen = new Set<string>();
    const rules: chrome.declarativeNetRequest.Rule[] = [];
    allRules.forEach((rawRule, index) => {
        const ruleStr = String(rawRule || '').trim();
        if (!ruleStr) return;
        const isPlainDomain =
            /^[a-z0-9.\-]+$/i.test(ruleStr) && ruleStr.includes('.');
        const urlFilter = isPlainDomain ? `||${ruleStr}^` : ruleStr;
        if (seen.has(urlFilter)) return;
        seen.add(urlFilter);
        rules.push({
            id: AD_BLOCK_RULE_ID_BASE + index,
            priority: 1,
            action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
            condition: {
                urlFilter,
                resourceTypes: Object.values(
                    chrome.declarativeNetRequest.ResourceType
                )
            },
        });
    });
    return rules;
};

// 按配置同步动态拦截规则（幂等：先移除本扩展的历史规则，再按当前规则添加）
const syncAdBlockRules = async (rules: string[]) => {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const myRuleIds = existing
        .filter((rule) => rule.id >= AD_BLOCK_RULE_ID_BASE)
        .map((rule) => rule.id);
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [...myRuleIds, ...LEGACY_AD_BLOCK_RULE_IDS],
        addRules: parseAdBlockRules(rules),
    });
};

export const initStorage: IStorageCache = {
    // 接口缓存
    proxyServers: [],
    envList: [],
    allEnvList: [],
    ip: '',
    // 配置缓存
    config: {
        ipGetMode: 'auto', // ip获取方式 auto 自动获取， fixed 固定ip
        size: { type: POPUP_SIZE_TYPE.DEFAULT, width: null, height: null }, // popup大小 small, default, large, auto, custom
        theme: 'auto', // light, dark, auto
        devopsInjectEnabled: true, // 是否开启devops开发环境代码注入
        matchUrls:
            '(.dtstack.cn$|172\\.16\\.)', // 代码注入匹配规则
        quickLogin: {
            enabled: true,
            autoTrigger: true,
            autoTriggerDelay: 3,
            username: '',
            password: '',
            jumpProductPath: '/portal',
            defaultTenantId: '1',
            ocrApiUrl: 'http://172.16.100.225:8000',
        },
        gitlabReviewEnabled: true,
        // 广告拦截无全局开关：请求级拦截与元素隐藏分别由下方两条输入框内容决定（非空即拦截，清空即不拦）
        adBlockRules: [
            ...DEFAULT_AD_BLOCK_RULES,
        ], // 广告拦截规则（内置默认，可在设置页增删改）
        adBlockSelectors: [
            ...DEFAULT_AD_BLOCK_SELECTORS,
        ], // 广告元素选择器（内置默认，可在设置页增删改）
    },
    // 记录用户上次操作的状态
    clientUserState: {
        activeTab: POPUP_TAB.PROXY,
        selectedTags: [],
        activePanelKey: undefined,
        envScrollTop: 0,
        proxyScrollTop: 0,
    },
};

// 每次浏览器启动时
chrome.runtime.onStartup.addListener(async () => {
    let ruleOpenCount = 0;
    const { proxyServers } = await chrome.storage.local.get({
        proxyServers: [],
    });
    proxyServers.forEach((server) => {
        server.rules.forEach((rule) => {
            if (rule.status === 1) ruleOpenCount++;
        });
    });
    chrome.action.setBadgeText({ text: '' + ruleOpenCount });
    getAllEnvList();
    // 浏览器重启后动态规则持久保留，但配置可能已变，重新对齐开关状态
    const { config } = await chrome.storage.local.get('config');
    syncAdBlockRules(resolveAdBlockRules(config)).catch(console.error);
});

// 插件安装时初始化
chrome.runtime.onInstalled.addListener(async () => {
    const { config = {} } = await chrome.storage.local.get('config');
    const mergedConfig = mergeConfigs(config, initStorage.config);
    // 广告拦截已无全局开关（拦截与否由输入框内容决定），清理旧版本残留的开关字段
    delete (mergedConfig as any).adBlockEnabled;
    await chrome.storage.local.set({
        ...initStorage,
        config: mergedConfig,
    });
    registerContectMenus();
    getAllEnvList();
    await getLocalIp();
    await getProxyServers();
    // 按安装时的合并配置对齐广告拦截规则
    syncAdBlockRules(resolveAdBlockRules(mergedConfig)).catch(console.error);
});

chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

// 配置变化时实时同步广告拦截规则（Options/Popup 修改 config 后立即生效）
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const newConfig = changes.config?.newValue;
    if (newConfig) {
        syncAdBlockRules(resolveAdBlockRules(newConfig)).catch(console.error);
    }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'openOptionPage') {
        chrome.runtime.openOptionsPage();
    }

    if (request.action === 'recognizeCaptcha') {
        recognizeCaptcha(request.ocrApiUrl, request.image)
            .then((result) => sendResponse({ success: true, result }))
            .catch((error) => {
                sendResponse({
                    success: false,
                    message: error?.message || 'OCR识别失败',
                });
            });
        return true;
    }
});
