/**
 * 判断主机名是否匹配用户配置的 URL 规则
 * @param {string} matchUrls - 正则模式字符串
 * @param {string} hostname - 当前主机名
 * @returns {boolean}
 */
export function isMatchedHost(matchUrls, hostname) {
    const pattern = matchUrls?.trim?.() || '';
    if (!pattern) return false;

    // 拒绝嵌套量词和带分支的量词表达式，避免灾难性回溯
    if (
        hostname.length > 256 ||
        pattern.length > 200 ||
        /\([^)]*(?:[*+?]|\{\d)[^)]*\)(?:[*+?]|\{\d)|\([^)]*\|[^)]*\)(?:[*+?]|\{\d)/.test(
            pattern
        )
    )
        return false;

    try {
        if (new RegExp(pattern).test(hostname)) return true;
        // 兼容设置页中输入了双转义反斜杠的正则，如 172\\.16\\.
        const normalizedPattern = pattern.replace(/\\\\/g, '\\');
        return normalizedPattern !== pattern
            ? new RegExp(normalizedPattern).test(hostname)
            : false;
    } catch (error) {
        return false;
    }
}

/**
 * 判断主机名是否为 IP 地址
 * @param {string} hostname
 * @returns {boolean}
 */
export function isIpAddress(hostname) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}
