import React, { useEffect, useState } from 'react';
import {
    Button,
    ConfigProvider,
    Divider,
    Form,
    Input,
    InputNumber,
    Radio,
    Switch,
    Tooltip,
} from 'antd';
import { useForm } from 'antd/es/form/Form';
import { cloneDeep } from 'lodash';
import { POPUP_SIZE_TYPE } from '@/const';
import { GithubOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { getThemeAlgorithm } from '@/utils';
import './Options.scss';

interface IProps {}
const formItemLayout = {
    labelCol: { span: 5 },
    wrapperCol: { span: 19 },
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
                                'https://github.com/JackWang032/doraemon-proxy-tool',
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
                        style={{ width: '60%', minWidth: 650 }}
                        onValuesChange={handleFormChange}
                        preserve={false}
                    >
                        <div className="option-item">
                            <div className="option-title">IP设置</div>
                            <Form.Item
                                name="ip"
                                label="当前ip地址"
                                initialValue={ip}
                            >
                                <Input
                                    style={{ width: 250 }}
                                    disabled={config.ipGetMode === 'auto'}
                                />
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
                        </div>
                        <div className="option-item">
                            <div className="option-title">外观</div>
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
                        </div>
                        <div className="option-item">
                            <div className="option-title">集成登录</div>
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
                                label="devops注入(前端专用)"
                                tooltip="开启后会重写本地开发环境（域名dev.或local.开头）的config文件，接管跳转地址至线上环境"
                                initialValue={config.devopsInjectEnabled}
                                valuePropName="checked"
                            >
                                <Switch />
                            </Form.Item>
                            <Form.Item
                                name={['quickLogin', 'enabled']}
                                label="快速登录"
                                tooltip="优先会取环境配置中的账号密码，请保证环境中的验证码校验已关闭"
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
                                                    'username',
                                                ]}
                                                label="登录账号"
                                                initialValue={
                                                    config.quickLogin?.username
                                                }
                                            >
                                                <Input
                                                    placeholder="请输入用户名"
                                                    style={{ width: 316 }}
                                                />
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
                                                    style={{ width: 316 }}
                                                />
                                            </Form.Item>
                                            <Form.Item
                                                name={[
                                                    'quickLogin',
                                                    'jumpProductPath',
                                                ]}
                                                label="登录后跳转地址"
                                                initialValue={
                                                    config.quickLogin
                                                        ?.jumpProductPath
                                                }
                                            >
                                                <Input
                                                    placeholder="请输入登录后跳转地址"
                                                    style={{ width: 316 }}
                                                />
                                            </Form.Item>
                                            <Form.Item
                                                name={[
                                                    'quickLogin',
                                                    'defaultTenantId',
                                                ]}
                                                label="默认进入租户id"
                                                initialValue={
                                                    config.quickLogin
                                                        ?.defaultTenantId
                                                }
                                            >
                                                <Input
                                                    placeholder="请输入默认进入的租户id"
                                                    style={{ width: 316 }}
                                                />
                                            </Form.Item>
                                        </>
                                    )
                                }
                            </Form.Item>
                        </div>
                    </Form>
                )}
            </div>
        </ConfigProvider>
    );
};

export default Options;
