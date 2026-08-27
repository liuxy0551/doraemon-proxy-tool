const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');

// 源文件夹路径
const sourceFolder = path.join(__dirname, '../build');

// 目标文件夹路径
const targetFolder = path.join(__dirname, '../doraemon-proxy-tool');

// 打包后的目标文件
const zipFilePath = path.join(__dirname, '../doraemon-proxy-tool.zip');

async function copyAndRenameFolder() {
    try {
        await fs.remove(targetFolder);

        // 拷贝文件夹
        await fs.copy(sourceFolder, targetFolder);
        console.log(`文件夹已重命名为: ${path.basename(targetFolder)}`);
    } catch (error) {
        console.error('拷贝文件夹失败:', error);
        throw error;
    }
}

// 2. 将文件夹打包成 .zip 文件
async function compressFolderToZip() {
    try {
        // 确保旧的压缩包不存在
        if (fs.existsSync(zipFilePath)) {
            await fs.unlink(zipFilePath);
        }

        // 创建输出流
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver('zip', {
            zlib: { level: 9 }, // 设置压缩级别
        });

        // 捕获错误
        archive.on('error', (err) => {
            throw err;
        });

        // 连接输出流
        archive.pipe(output);

        // 添加文件夹到压缩包
        archive.directory(targetFolder, false);

        // 结束压缩
        await archive.finalize();
        console.log(`文件夹已成功打包为: ${path.basename(zipFilePath)}`);
    } catch (error) {
        console.error('打包失败:', error);
        throw error;
    }
}

(async () => {
    try {
        await copyAndRenameFolder();
        await compressFolderToZip();
    } catch (error) {
        console.error('操作失败:', error);
    }
})();
