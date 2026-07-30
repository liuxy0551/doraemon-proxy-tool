// window.APP_CONF

(function () {
    const CONFIG_PATH = 'public/config/config.js';
    const DEV_PREFIXS = ['dev.', 'local.'];
    const { host, pathname, protocol } = window.location;

    // 是否是devops开发环境
    function getIsDev(url) {
        return (
            DEV_PREFIXS.some((prefix) => url.hostname.startsWith(prefix)) ||
            // 172.16 网段地址为内网地址，不带 dev/local 前缀
            /^172\.16\./.test(url.hostname)
        );
    }

    if (!getIsDev(window.location)) return;

    // rewrite config.js - 使用 host 保留端口
    const onlineEnvHost = host.replace(/^(dev\.|local\.)/, '');
    const onlineUrl =
        protocol + '//' + onlineEnvHost + pathname + CONFIG_PATH;
    var configScript = document.createElement('script');
    configScript.src = onlineUrl;
    configScript.onload = function () {
        // 线上环境中可能会使用`location.origin`变量, 需要进行替换
        if (!window.APP_CONF) return;
        const rewriteUrl = new URL(onlineUrl);
        const devOrigin = window.location.origin;
        const onlineOrigin = rewriteUrl.origin;

        const keys = Object.keys(window.APP_CONF);
        keys.forEach((key) => {
            const value = window.APP_CONF[key];
            if (typeof value === 'string' && value.startsWith(devOrigin)) {
                window.APP_CONF[key] = value.replace(devOrigin, onlineOrigin);
            }
        });
    };
    document.documentElement.appendChild(configScript);

    function isValidUrl(string) {
        try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:'
                ? true
                : false;
        } catch (_) {
            return false;
        }
    }

    function getRewrteLinkAddress(address) {
        if (!isValidUrl(address)) return address;
        const url = new URL(address);
        const isDev = getIsDev(url);
        if (!isDev) return address;

        // 跳转到其他产品
        if (pathname !== url.pathname) {
            const rewriteAddr =
                url.protocol +
                '//' +
                onlineEnvHost +
                url.pathname +
                url.hash +
                url.search;
            return rewriteAddr;
        } else {
            return address;
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.body.addEventListener('click', function (event) {
            var target = event.target?.closest('a');

            if (target && target.href !== '') {
                const rewriteLinkAddress = getRewrteLinkAddress(target.href);
                if (target.href !== rewriteLinkAddress) {
                    event.preventDefault();
                    console.log(
                        `Rewrite link from ${target.href} to ${rewriteLinkAddress}`
                    );
                    if (target.target === '_blank') {
                        window.open(rewriteLinkAddress, '_blank', 'noopener');
                    } else {
                        window.location.href = rewriteLinkAddress;
                    }
                }
            }
        });
    });
})();
