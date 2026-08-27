import React, { useEffect, useState } from 'react';
import {
    Button,
    Card,
    Checkbox,
    ConfigProvider,
    Divider,
    Form,
    Input,
    InputNumber,
    message,
    Modal,
    Radio,
    Switch,
    Tooltip,
} from 'antd';
import { useForm } from 'antd/es/form/Form';
import { cloneDeep } from 'lodash';
import {
    POPUP_SIZE_TYPE,
    DEFAULT_AD_BLOCK_RULES,
    DEFAULT_AD_BLOCK_SELECTORS,
} from '@/const';
import { GithubOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { getThemeAlgorithm } from '@/utils';
import './Options.scss';

interface IProps {}
const formItemLayout = {
    labelCol: { span: 5 },
    wrapperCol: { span: 19 },
};

// 多行文本域 <-> string[] 互相转换（广告拦截的自定义规则/选择器按行存储）
const fromTextAreaValue = (e: any): string[] =>
    String(e?.target?.value || '')
        .split('\n')
        .map((s: string) => s.trim())
        .filter(Boolean);
const toTextAreaValue = (value: any): string =>
    Array.isArray(value) ? value.join('\n') : '';

// 配置缺失时才回退内置默认（用户显式保存的空数组会被保留）
const resolveListValue = (value: any, fallback: any[]): any[] =>
    value === undefined || value === null ? fallback : value;

// ---------- 广告元素 DOM 解析 ----------

// 根据根元素特征生成 CSS 选择器建议（id 或 class 组合）
const suggestSelector = (el: Element | null): string => {
    if (!el) return '';
    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute('id');
    if (id) return `${tag}#${id}`;
    const classes = Array.from(el.classList || [])
        .filter((c) => !/^\d/.test(c) && !/^(clearfix|d-flex|col-\d+)$/.test(c))
        .slice(0, 3);
    if (classes.length) return `${tag}.${classes.join('.')}`;
    return '';
};

// 解析粘贴的 DOM HTML，提取外部资源域名与元素选择器建议
const analyzeDomHtml = (
    html: string
): { hosts: string[]; selector: string } => {
    const hosts: string[] = [];
    const seen = new Set<string>();
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    const collectUrl = (urlStr: string) => {
        if (!urlStr) return;
        try {
            const url = new URL(urlStr, location.href);
            if (!/^https?:$/.test(url.protocol)) return;
            if (seen.has(url.hostname)) return;
            seen.add(url.hostname);
            hosts.push(url.hostname);
        } catch (e) {
            // 忽略无法解析的地址
        }
    };
    doc
        .querySelectorAll(
            'script[src], iframe[src], img[src], video[src], source[src], link[href], a[href]'
        )
        .forEach((el) => {
            const urlStr = el.getAttribute('src') || el.getAttribute('href') || '';
            collectUrl(urlStr);
        });
    return { hosts, selector: suggestSelector(doc.body?.firstElementChild) };
};

const Options: React.FC<IProps> = () => {
    const [ip, setIp] = useState<string>('');
    const [config, setConfig] = useState<IConfig>();
    const [form] = useForm();
    const sizeType = Form.useWatch(['size', 'type'], form);

    const handleFormChange = (changedValues: any) => {
        if (changedValues.ip) {
            setIp(changedValues.ip);
            chrome.storage.local.set({ ip: changedValues.ip });
        }
        const newConfig = cloneDeep(config) || ({} as IConfig);
        if (changedValues.ipGetMode) {
            newConfig.ipGetMode = changedValues.ipGetMode;
        }
        if (changedValues.size) {
            const sizeType = changedValues.size.type;
            const isChangeToCustomSize = sizeType === POPUP_SIZE_TYPE.CUSTOM;
            if (isChangeToCustomSize) {
                newConfig.size.width = 300;
                newConfig.size.height = 400;
            }
            newConfig.size = Object.assign(
                newConfig.size,
                changedValues.size,
                !isChangeToCustomSize && sizeType !== undefined
                    ? { width: null, height: null }
                    : {}
            );
        }
        if (changedValues.theme) {
            newConfig.theme = changedValues.theme;
        }
        if ('devopsInjectEnabled' in changedValues) {
            newConfig.devopsInjectEnabled = changedValues.devopsInjectEnabled;
        }
        if ('gitlabReviewEnabled' in changedValues) {
            newConfig.gitlabReviewEnabled = changedValues.gitlabReviewEnabled;
        }
        if ('adBlockRules' in changedValues) {
            newConfig.adBlockRules = changedValues.adBlockRules || [];
        }
        if ('adBlockSelectors' in changedValues) {
            newConfig.adBlockSelectors = changedValues.adBlockSelectors || [];
        }
        if ('quickLogin' in changedValues) {
            newConfig.quickLogin = Object.assign(
                {},
                newConfig.quickLogin,
                changedValues.quickLogin
            );
        }
        if ('matchUrls' in changedValues) {
            newConfig.matchUrls = changedValues.matchUrls;
        }
        setConfig(newConfig);
        chrome.storage.local.set({ config: newConfig });
    };

    // 恢复广告拦截内置默认规则（清空输入框后用于一键找回）
    const handleResetAdBlockDefaults = () => {
        const newConfig = cloneDeep(config) || ({} as IConfig);
        newConfig.adBlockRules = [...DEFAULT_AD_BLOCK_RULES];
        newConfig.adBlockSelectors = [...DEFAULT_AD_BLOCK_SELECTORS];
        form.setFieldsValue({
            adBlockRules: newConfig.adBlockRules,
            adBlockSelectors: newConfig.adBlockSelectors,
        });
        setConfig(newConfig);
        chrome.storage.local.set({ config: newConfig });
        message.success('已恢复默认广告拦截规则');
    };

    // ---------- 广告元素 DOM 解析弹窗 ----------
    const [domParseOpen, setDomParseOpen] = useState(false);
    const [domHtml, setDomHtml] = useState('');
    const [discoveredHosts, setDiscoveredHosts] = useState<string[]>([]);
    const [checkedHosts, setCheckedHosts] = useState<string[]>([]);
    const [suggestedSelector, setSuggestedSelector] = useState('');

    // 打开解析弹窗（可带入已粘贴的 HTML）
    const openDomParse = (html = '') => {
        setDomHtml(html);
        setDomParseOpen(true);
    };

    // DOM HTML 内容变化时重新解析，刷新域名勾选与选择器建议
    useEffect(() => {
        if (!domParseOpen) return;
        const { hosts, selector } = analyzeDomHtml(domHtml);
        setDiscoveredHosts(hosts);
        setCheckedHosts(hosts);
        setSuggestedSelector(selector);
    }, [domHtml, domParseOpen]);

    // 在规则/选择器输入框粘贴 HTML 时转入解析弹窗，避免污染输入框
    const handleAdBlockTextAreaPaste = (e: React.ClipboardEvent) => {
        const text = e.clipboardData?.getData('text/plain') || '';
        if (text && /<\s*[a-zA-Z][^>]*>/.test(text)) {
            e.preventDefault();
            openDomParse(text);
        }
    };

    // 确认：把勾选的域名与选择器写入配置并保存
    const confirmDomParse = () => {
        const newConfig = cloneDeep(config) || ({} as IConfig);
        const rules = new Set<string>(newConfig.adBlockRules || []);
        checkedHosts.forEach((host) => {
            if (host) rules.add(`||${host}^`);
        });
        newConfig.adBlockRules = [...rules];
        const selector = (suggestedSelector || '').trim();
        if (selector) {
            const selectors = new Set<string>(
                newConfig.adBlockSelectors || []
            );
            selectors.add(selector);
            newConfig.adBlockSelectors = [...selectors];
        }
        form.setFieldsValue({
            adBlockRules: newConfig.adBlockRules,
            adBlockSelectors: newConfig.adBlockSelectors,
        });
        setConfig(newConfig);
        chrome.storage.local.set({ config: newConfig });
        setDomParseOpen(false);
        message.success('已添加广告拦截规则');
    };

    useEffect(() => {
        chrome.storage.local
            .get({ ip: '', config: {} })
            .then(({ ip, config }) => {
                setIp(ip);
                setConfig(config);
            });
    }, []);

    useEffect(() => {
        if (!config?.theme) return;
        if (!['auto', 'compact'].includes(config?.theme)) {
            document.body.className = config.theme;
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.className = 'dark';
        }
    }, [config?.theme]);

    return (
        <ConfigProvider theme={{ algorithm: getThemeAlgorithm(config?.theme) }}>
            <div className="container">
                <header>
                    <div className="title">系统设置</div>
                    <Button
                        type="link"
                        onClick={() =>
                            window.open(
                                'https://github.com/liuxy0551/doraemon-proxy-tool',
                                '_blank'
                            )
                        }
                    >
                        <GithubOutlined style={{ fontSize: 20 }} />
                    </Button>
                </header>
                <Divider />
                {config && (
                    <Form
                        form={form}
                        {...formItemLayout}
                        className="options-form"
                        onValuesChange={handleFormChange}
                        preserve={false}
                    >
                        <Card title="IP设置" className="option-card option-card--ip">
                            <Form.Item
                                name="ip"
                                label="当前ip地址"
                                initialValue={ip}
                            >
                                <Input disabled={config.ipGetMode === 'auto'} />
                            </Form.Item>
                            <Form.Item
                                name="ipGetMode"
                                label="ip获取方式"
                                initialValue={config.ipGetMode}
                            >
                                <Radio.Group>
                                    <Radio value="auto">
                                        自动获取
                                        <Tooltip
                                            color="blue"
                                            title="每次启动浏览器时获取"
                                        >
                                            <InfoCircleOutlined
                                                style={{ marginLeft: 5 }}
                                            />
                                        </Tooltip>
                                    </Radio>
                                    <br />
                                    <Radio value="fixed">
                                        固定IP
                                        <Tooltip
                                            color="blue"
                                            title="将当前ip设为固定ip"
                                        >
                                            <InfoCircleOutlined
                                                style={{ marginLeft: 5 }}
                                            />
                                        </Tooltip>
                                    </Radio>
                                </Radio.Group>
                            </Form.Item>
                        </Card>
                        <Card title="外观" className="option-card option-card--appearance">
                            <Form.Item
                                name={['size', 'type']}
                                label="Popup大小"
                                initialValue={config.size?.type}
                            >
                                <Radio.Group>
                                    <Radio value={POPUP_SIZE_TYPE.SMALL}>
                                        小
                                    </Radio>
                                    <Radio value={POPUP_SIZE_TYPE.DEFAULT}>
                                        默认
                                    </Radio>
                                    <Radio value={POPUP_SIZE_TYPE.LARGE}>
                                        大
                                    </Radio>
                                    <Radio value={POPUP_SIZE_TYPE.AUTO}>
                                        自适应
                                    </Radio>
                                    <Radio value={POPUP_SIZE_TYPE.CUSTOM}>
                                        <div className="custom-size">
                                            <span>自定义</span>
                                            {sizeType ===
                                                POPUP_SIZE_TYPE.CUSTOM && (
                                                <div className="form-item--inline">
                                                    <Form.Item
                                                        name={['size', 'width']}
                                                        label="宽"
                                                        initialValue={
                                                            config.size
                                                                ?.width || 300
                                                        }
                                                    >
                                                        <InputNumber min={0} />
                                                    </Form.Item>
                                                    <Form.Item
                                                        name={[
                                                            'size',
                                                            'height',
                                                        ]}
                                                        label="高"
                                                        initialValue={
                                                            config.size
                                                                ?.height || 400
                                                        }
                                                    >
                                                        <InputNumber min={0} />
                                                    </Form.Item>
                                                </div>
                                            )}
                                        </div>
                                    </Radio>
                                </Radio.Group>
                            </Form.Item>
                            <Form.Item
                                name="theme"
                                label="主题"
                                initialValue={config.theme}
                            >
                                <Radio.Group>
                                    <Radio value="dark">暗色</Radio>
                                    <Radio value="light">亮色</Radio>
                                    <Radio value="compact">紧凑型</Radio>
                                    <Radio value="auto">跟随系统</Radio>
                                </Radio.Group>
                            </Form.Item>
                        </Card>
                        <Card title="集成登录" className="option-card option-card--login">
                            <Form.Item
                                name="matchUrls"
                                label="注入匹配地址"
                                tooltip="只对指定地址生效, 支持正则表达式, 并且同步生效环境管理中添加的访问URL"
                                initialValue={config.matchUrls}
                            >
                                <Input placeholder="请输入需要注入的数栈地址" />
                            </Form.Item>
                            <Form.Item
                                name="devopsInjectEnabled"
                                label="OMP注入(前端专用)"
                                tooltip="开启后会重写本地开发环境（域名dev.或local.开头）的config文件，接管跳转地址至线上环境"
                                initialValue={config.devopsInjectEnabled}
                                valuePropName="checked"
                            >
                                <Switch />
                            </Form.Item>
                            <Form.Item
                                name={['quickLogin', 'enabled']}
                                label="快速登录"
                                tooltip="优先会取环境配置中的账号密码，验证码会调用 OCR 接口识别"
                                initialValue={config.quickLogin?.enabled}
                                valuePropName="checked"
                            >
                                <Switch />
                            </Form.Item>
                            <Form.Item
                                noStyle
                                dependencies={[['quickLogin', 'enabled']]}
                            >
                                {() =>
                                    form.getFieldValue([
                                        'quickLogin',
                                        'enabled',
                                    ]) && (
                                        <>
                                            <Form.Item
                                                name={[
                                                    'quickLogin',
                                                    'autoTrigger',
                                                ]}
                                                label="自动触发快速登录"
                                                tooltip="进入登录页面后自动触发快速登录"
                                                initialValue={
                                                    config.quickLogin
                                                        ?.autoTrigger !== false
                                                }
                                                valuePropName="checked"
                                            >
                                                <Switch />
                                            </Form.Item>
                                            <Form.Item
                                                noStyle
                                                dependencies={[
                                                    ['quickLogin', 'autoTrigger'],
                                                ]}
                                            >
                                                {() =>
                                                    form.getFieldValue([
                                                        'quickLogin',
                                                        'autoTrigger',
                                                    ]) && (
                                                        <Form.Item
                                                            name={[
                                                                'quickLogin',
                                                                'autoTriggerDelay',
                                                            ]}
                                                            label="触发延迟(秒)"
                                                            tooltip="进入登录页面后延迟多少秒自动触发快速登录"
                                                            initialValue={
                                                                config.quickLogin
                                                                    ?.autoTriggerDelay ??
                                                                3
                                                            }
                                                        >
                                                            <InputNumber
                                                                min={1}
                                                                max={60}
                                                                precision={0}
                                                                style={{
                                                                    width: 120,
                                                                }}
                                                                addonAfter="秒"
                                                            />
                                                        </Form.Item>
                                                    )
                                                }
                                            </Form.Item>
                                            <Form.Item
                                                name={[
                                                    'quickLogin',
                                                    'username',
                                                ]}
                                                label="登录账号"
                                                initialValue={
                                                    config.quickLogin?.username
                                                }
                                            >
                                                <Input placeholder="请输入用户名" />
                                            </Form.Item>
                                            <Form.Item
                                                name={[
                                                    'quickLogin',
                                                    'password',
                                                ]}
                                                label="登录密码"
                                                initialValue={
                                                    config.quickLogin?.password
                                                }
                                            >
                                                <Input
                                                    placeholder="请输入密码"
                                                    type="password"
                                                />
                                            </Form.Item>
                                            <Form.Item
                                                name={[
                                                    'quickLogin',
                                                    'jumpProductPath',
                                                ]}
                                                label="登录后跳转地址"
                                                tooltip="相对地址，如：/batch"
                                                initialValue={
                                                    config.quickLogin
                                                        ?.jumpProductPath
                                                }
                                            >
                                                <Input placeholder="请输入登录后跳转地址" />
                                            </Form.Item>
                                            <Form.Item
                                                name={[
                                                    'quickLogin',
                                                    'defaultTenantId',
                                                ]}
                                                label="默认进入租户id"
                                                tooltip="DT_demo 租户id 为 1"
                                                initialValue={
                                                    config.quickLogin
                                                        ?.defaultTenantId
                                                }
                                            >
                                                <Input placeholder="请输入默认进入的租户id" />
                                            </Form.Item>
                                            <Form.Item
                                                name={[
                                                    'quickLogin',
                                                    'ocrApiUrl',
                                                ]}
                                                label="验证码OCR接口地址"
                                                initialValue={
                                                    config.quickLogin?.ocrApiUrl
                                                }
                                            >
                                                <Input placeholder="请输入验证码 OCR 接口地址" />
                                            </Form.Item>
                                        </>
                                    )
                                }
                            </Form.Item>
                        </Card>
                        <Card title="GitLab CodeReview" className="option-card option-card--gitlab">
                            <Form.Item
                                name="gitlabReviewEnabled"
                                label="AI CodeReview 悬浮面板"
                                labelCol={{ span: 6 }}
                                wrapperCol={{ span: 18 }}
                                tooltip="在 GitLab MR 页面右上角展示 Front-Gitlab-AI-CodeReviewer 的评论列表和评分"
                                initialValue={config.gitlabReviewEnabled !== false}
                                valuePropName="checked"
                            >
                                <Switch />
                            </Form.Item>
                        </Card>
                        <Card title="广告拦截" className="option-card option-card--adblock">
                            <Form.Item
                                name="adBlockRules"
                                label="拦截规则"
                                tooltip={
                                    <span>
                                        无全局开关，请求级拦截与否完全由下方输入框内容决定
                                        <br />
                                        每行一条、完整生效。内置默认已预填，可增删改
                                        <br />
                                        纯域名自动匹配任意子域，也可写完整 DNR urlFilter，例如：
                                        <code>example.com</code> / <code>*://*.ads.io/*</code> /{' '}
                                        <code>||advert.com^</code>
                                        <br />
                                        清空表示不进行请求级拦截，想找回初始规则可点标题旁「恢复默认」
                                    </span>
                                }
                                initialValue={resolveListValue(
                                    config.adBlockRules,
                                    DEFAULT_AD_BLOCK_RULES
                                )}
                                getValueFromEvent={fromTextAreaValue}
                                getValueProps={(value) => ({
                                    value: toTextAreaValue(value),
                                })}
                            >
                                <Input.TextArea
                                    rows={8}
                                    onPaste={handleAdBlockTextAreaPaste}
                                    placeholder={'每行一条，如：example.com 或 ||wwads.cn^'}
                                />
                            </Form.Item>
                            <Form.Item
                                name="adBlockSelectors"
                                label="广告元素选择器"
                                tooltip={
                                    <span>
                                        每行一条、完整生效。内置默认已预填，可增删改
                                        <br />
                                        CSS 选择器命中即从页面移除，例如：
                                        <code>.ad-banner</code> 或 <code>#ads-wrap</code>
                                        <br />
                                        清空表示不从页面移除元素
                                    </span>
                                }
                                initialValue={resolveListValue(
                                    config.adBlockSelectors,
                                    DEFAULT_AD_BLOCK_SELECTORS
                                )}
                                getValueFromEvent={fromTextAreaValue}
                                getValueProps={(value) => ({
                                    value: toTextAreaValue(value),
                                })}
                            >
                                <Input.TextArea
                                    rows={8}
                                    onPaste={handleAdBlockTextAreaPaste}
                                    placeholder={'每行一条，如：.ad-banner 或 #ads-wrap'}
                                />
                            </Form.Item>
                            <div className="ad-block-actions">
                                <Button
                                    type="link"
                                    size="small"
                                    onClick={() => openDomParse()}
                                >
                                    DOM解析
                                </Button>
                                <Button
                                    type="link"
                                    size="small"
                                    onClick={handleResetAdBlockDefaults}
                                >
                                    恢复默认
                                </Button>
                            </div>
                        </Card>
                    </Form>
                )}

                <Modal
                    title="从广告元素 DOM 解析拦截规则"
                    open={domParseOpen}
                    onCancel={() => setDomParseOpen(false)}
                    onOk={confirmDomParse}
                    okText="添加到规则"
                    cancelText="取消"
                    width={560}
                >
                    <div
                        style={{
                            marginBottom: 8,
                            color: '#888',
                            fontSize: 12,
                        }}
                    >
                        在 F12 元素面板右键广告元素 → Copy → Copy outerHTML，粘贴到下面：
                    </div>
                    <Input.TextArea
                        rows={5}
                        value={domHtml}
                        onChange={(e) => setDomHtml(e.target.value)}
                        placeholder={'粘贴广告元素的 HTML，如 <div class="wwads-cn">'}
                    />
                    {discoveredHosts.length > 0 && (
                        <>
                            <div
                                style={{
                                    margin: '12px 0 6px',
                                    color: '#555',
                                    fontSize: 13,
                                }}
                            >
                                识别到的外部域名（勾选后生成请求拦截规则）
                            </div>
                            <Checkbox.Group
                                options={discoveredHosts.map((host) => ({
                                    label: host,
                                    value: host,
                                }))}
                                value={checkedHosts}
                                onChange={(values) =>
                                    setCheckedHosts(values as string[])
                                }
                            />
                        </>
                    )}
                    {suggestedSelector && (
                        <>
                            <div
                                style={{
                                    margin: '12px 0 6px',
                                    color: '#555',
                                    fontSize: 13,
                                }}
                            >
                                自动生成的选择器（可编辑，留空则不添加）
                            </div>
                            <Input
                                value={suggestedSelector}
                                onChange={(e) =>
                                    setSuggestedSelector(e.target.value)
                                }
                                placeholder="CSS 选择器，如 .wwads-cn"
                            />
                        </>
                    )}
                    {!discoveredHosts.length && !suggestedSelector && (
                        <div style={{ marginTop: 12, color: '#999' }}>
                            未识别到外部资源域名与元素特征，可手动在下方输入选择器
                        </div>
                    )}
                </Modal>
            </div>
        </ConfigProvider>
    );
};

export default Options;
