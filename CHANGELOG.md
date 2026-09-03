# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.9.2](https://github.com/liuxy0551/doraemon-proxy-tool/compare/v1.9.1...v1.9.2) (2026-09-03)


### Bug Fixes

* keep filled username/password and refresh captcha before re-typing in one-click input ([cebafac](https://github.com/liuxy0551/doraemon-proxy-tool/commit/cebafacad8ca5efd37bec07d1236ece6f1222607))
* recognize all ai reviewer scores ([224c206](https://github.com/liuxy0551/doraemon-proxy-tool/commit/224c20627e00f571ba03af0693beee832c6309c2))
* tighten default matchUrls regex to avoid unintended host matches ([e3a867b](https://github.com/liuxy0551/doraemon-proxy-tool/commit/e3a867bb11fd482e25d7bf3e0da330c12e7d64c8))

### [1.9.1](https://github.com/liuxy0551/doraemon-proxy-tool/compare/v1.9.0...v1.9.1) (2026-08-28)


### Bug Fixes

* hide GitLab AI review panel when no review records exist ([67a7a27](https://github.com/liuxy0551/doraemon-proxy-tool/commit/67a7a27c95126f73ec8d05eb27f05f82a57b9d85))

## [1.9.0](https://github.com/liuxy0551/doraemon-proxy-tool/compare/v1.8.2...v1.9.0) (2026-08-27)


### Features

* add ad blocking support ([cc35c88](https://github.com/liuxy0551/doraemon-proxy-tool/commit/cc35c88dfbccb29450eb9838550c1730220b67d7))


### Bug Fixes

* extend auto login countdown delay ([727c328](https://github.com/liuxy0551/doraemon-proxy-tool/commit/727c32826d8134bcc62df9d83d5fe4034369b771))

### [1.8.2](https://github.com/liuxy0551/doraemon-proxy-tool/compare/v1.8.1...v1.8.2) (2026-08-19)


### Bug Fixes

* restore GitLab panel position by viewport percentage ([cad2eef](https://github.com/liuxy0551/doraemon-proxy-tool/commit/cad2eef897244a3f087924bb6829f9dd3425369c))

### [1.8.1](https://github.com/liuxy0551/doraemon-proxy-tool/compare/v1.8.0...v1.8.1) (2026-08-14)


### Features

* make latest score clickable in GitLab CodeReview panel ([f3e5cfe](https://github.com/liuxy0551/doraemon-proxy-tool/commit/f3e5cfe3ae173d23447e30ff5374343f1d5b9c15))


### Bug Fixes

* correct GitLab CodeReview panel on MR sub-tabs ([d10c9ff](https://github.com/liuxy0551/doraemon-proxy-tool/commit/d10c9ff7e8dd13a084fee2c95a8ef231e7389813))

## [1.8.0](https://github.com/liuxy0551/doraemon-proxy-tool/compare/v1.7.1...v1.8.0) (2026-08-11)


### Features

* cancel quick login on interaction ([2deb135](https://github.com/liuxy0551/doraemon-proxy-tool/commit/2deb13530b0dba2d47b40dd575d95531d0172819))
* persist GitLab CodeReview panel position across refreshes ([8e5e0c0](https://github.com/liuxy0551/doraemon-proxy-tool/commit/8e5e0c0c54ccd0f76b90eac66a87446e6fab5d0b))
* persist GitLab CodeReview panel position across refreshes ([b480744](https://github.com/liuxy0551/doraemon-proxy-tool/commit/b48074435273a33de3d6a3d7617150dbe81e227f))


### Bug Fixes

* broaden captcha error detection to cover expired/incorrect/invalid cases ([3219837](https://github.com/liuxy0551/doraemon-proxy-tool/commit/3219837891c1f44d294ce601b10a39f4f42df797))
* preserve port in devops link rewriting ([889af48](https://github.com/liuxy0551/doraemon-proxy-tool/commit/889af488e92c8f2074fce051fe73d68ac98c3553))

### [1.7.1](https://github.com/liuxy0551/doraemon-proxy-tool/compare/v1.7.0...v1.7.1) (2026-07-27)


### Features

* add configurable auto-trigger for quick login ([6fea8f3](https://github.com/liuxy0551/doraemon-proxy-tool/commit/6fea8f33a23c70c5871e84fe94c3105acd405fc6))


### Bug Fixes

* retry quick login on captcha expiration ([cac0995](https://github.com/liuxy0551/doraemon-proxy-tool/commit/cac0995066e9824e5c6ad1004012001d68ec0706))
* safely parse default jump URL in login ([85ac24b](https://github.com/liuxy0551/doraemon-proxy-tool/commit/85ac24b601d1d4a0eae9d467523a68b0a72e7d3f))

## [1.7.0](https://github.com/liuxy0551/doraemon-proxy-tool/compare/v1.6.0...v1.7.0) (2026-07-20)


### Features

* support captcha OCR recognition for quick login ([9529726](https://github.com/liuxy0551/doraemon-proxy-tool/commit/952972640adf6de8298ce53f6714c3114d8578d6))


### Bug Fixes

* improve quick login release build ([b42fb95](https://github.com/liuxy0551/doraemon-proxy-tool/commit/b42fb958de9105ca0c892653b5678cedbbada221))
* update quick login redirect defaults ([0ad37b7](https://github.com/liuxy0551/doraemon-proxy-tool/commit/0ad37b7f323bf5cb75ef61f9ed3458d0fd86bb7d))
* update setting trigger element ([708bb4e](https://github.com/liuxy0551/doraemon-proxy-tool/commit/708bb4e4e2fd67d9b9d739dce87b32ae5dab9794))

## [1.6.0](https://github.com/liuxy0551/doraemon-proxy-tool/compare/v1.5.0...v1.6.0) (2024-12-26)


### Features

* support auto typing username and password ([fa4c65b](https://github.com/liuxy0551/doraemon-proxy-tool/commit/fa4c65b91dfb2cbe9f80823a4e41d11b18480674))

## [1.5.0](https://github.com/liuxy0551/doraemon-proxy-tool/compare/v1.4.1...v1.5.0) (2024-12-16)


### Features

* calculate open rule count on chrome start ([36cd156](https://github.com/liuxy0551/doraemon-proxy-tool/commit/36cd156feaec270649406500d71aadda2a91b14d))
* support env and improve ui ([2853545](https://github.com/liuxy0551/doraemon-proxy-tool/commit/2853545ce2fd0401ceadc2e55455b97c40d791a3))

### [1.2.1](https://github.com/liuxy0551/doraemon-proxy-tool/compare/v1.2.0...v1.2.1) (2024-06-17)

### Features

-   add github link ([46341a2](https://github.com/liuxy0551/doraemon-proxy-tool/commit/46341a259c49c995b4d694eca05255bb2c8485c1))

### Bug Fixes

-   update dev port judgement ([4b98c44](https://github.com/liuxy0551/doraemon-proxy-tool/commit/4b98c441e2cd6ba527abcc2cd6fd7a01b05990c1))

## [1.2.0](https://github.com/liuxy0551/doraemon-proxy-tool/compare/v1.1.1...v1.2.0) (2024-06-13)

### Features

-   integrate devops ([5c82707](https://github.com/liuxy0551/doraemon-proxy-tool/commit/5c8270712aa3918e63bba7ef38bdcee58d09bedf))
-   support auto update proxy config when ip changed ([c460a02](https://github.com/liuxy0551/doraemon-proxy-tool/commit/c460a02ca77e7b7b34fc8896554515318f04169f))
-   support quck jump to proxy target address ([bf0b175](https://github.com/liuxy0551/doraemon-proxy-tool/commit/bf0b175323297bda6f5ab32c8d84af55f1822406))

### Bug Fixes

-   get ip from localstorage ([47f32a5](https://github.com/liuxy0551/doraemon-proxy-tool/commit/47f32a54d28e399009f6099e11671e62713bb2fb))
