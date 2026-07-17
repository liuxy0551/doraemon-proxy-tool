interface IProxyServer {
    serverId: number;
    serverName: string;
    serverAddress: string;
    rules: any[];
}

interface IEnvInfo {
    id: number;
    uicUsername: string;
    uicPasswd: string;
    envName: string;
    remark: string;
    hostIp: string;
    tags: { id: number; tagName: string }[];
    url: string;
}

interface ITagInfo {
    id: number;
    tagColor: string;
    tagDesc: string;
    tagName: string;
}

interface IFetchResponse<T = any> {
    success: boolean;
    data: T;
}

interface IConfig {
    ipGetMode: 'auto' | 'fixed';
    size: { type: any; width: number | null; height: number | null };
    theme: 'auto' | 'dark' | 'light' | 'compact';
    devopsInjectEnabled: boolean;
    matchUrls: string;
    quickLogin: {
        enabled: boolean;
        username: string;
        password: string;
        jumpProductPath: string;
        defaultTenantId: string;
        ocrApiUrl: string;
    };
}

interface IStorageCache {
    proxyServers: IProxyServer[];
    config: IConfig;
    envList: IEnvInfo[];
    allEnvList: IEnvInfo[];
    ip: string;
    /** Should only used to inititalize state */
    clientUserState: {
        activeTab: POPUP_TAB;
        selectedTags: number[];
        activePanelKey: string | undefined;
        envScrollTop: number;
        proxyScrollTop: number;
    };
}

declare var window: any;
