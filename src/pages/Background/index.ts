import api from '@/api';
import { POPUP_SIZE_TYPE, POPUP_TAB } from '@/const';

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
                oldConfig[key] = newConfig[key];
            } else if (
                typeof oldConfig[key] === 'object' &&
                typeof newConfig[key] === 'object'
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

    if (!matchUrls || !new RegExp(matchUrls).test(url.hostname)) return '';

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
            '(.dtstack.cn$)', // 代码注入匹配规则
        quickLogin: {
            enabled: true,
            username: '',
            password: '',
            jumpProductPath: '/portal',
            defaultTenantId: '1',
        },
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
});

// 插件安装时初始化
chrome.runtime.onInstalled.addListener(async () => {
    const { config = {} } = await chrome.storage.local.get('config');
    const mergedConfig = mergeConfigs(config, initStorage.config);
    await chrome.storage.local.set({
        ...initStorage,
        config: mergedConfig,
    });
    registerContectMenus();
    getAllEnvList();
    await getLocalIp();
    await getProxyServers();
});

chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'openOptionPage') {
        chrome.runtime.openOptionsPage();
    }
});
