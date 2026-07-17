chrome.storage.local.get({ config: {}, allEnvList: [] }, function ({ config, allEnvList }) {
    function isSameHostname(urlStr) {
        if (!urlStr) return false;
        try {
            return new URL(urlStr).hostname === location.hostname;
        } catch (error) {
            return false;
        }
    }

    if (
        (!config?.matchUrls ||
            !new RegExp(config?.matchUrls).test(location.hostname)) &&
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
        document.documentElement.appendChild(loginScript);
    }
});
