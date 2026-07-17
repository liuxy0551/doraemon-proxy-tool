## What is this tool for ？

帮助开发者快速切换代理目标，无需每次都打开哆啦 A 梦代理页面

## 安装

### 源码编译

1. 安装依赖

```
pnpm install
```

2. 编译

```
pnpm build
```

可选：根据版本语义化重新命名文件夹
```
pnpm repack
```

3. 浏览器加载扩展程序选择 doraemon-proxy-tool-xxx 文件夹

### 或者直接下载打包好的扩展程序

-   [Releases](https://github.com/liuxy0551/doraemon-proxy-tool/releases)

&nbsp;&nbsp;
地址栏输入 chrome://extensions/ 进入扩展页面，点击加载已解压的扩展程序(需先开启右上角的开发者模式)，选择刚解压出的文件夹。

<br/>

## 使用

-   将插件固定到地址栏
    <img width="440" alt="image" src="https://user-images.githubusercontent.com/64318393/207221853-2d20e1a3-a9c2-4867-a3a9-6d44db6c14bf.png">

-   点开哆啦 A 梦的小图标，会自动获取到你的代理配置(每次打开都会抓取最新的数据)
-   可以愉快的联调了
