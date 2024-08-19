const path = require('path')
const fs = require('fs')
const multer = require('@koa/multer')
const SERVER = 'http://127.0.0.1:3001'

module.exports = class Upload {
    static publicPath = path.join(__dirname, '../public/')

    static userRootDirPath = undefined // 用户根目录，不修改，客户端传过来
    static chunkDirPath = '/chunk' // 分片存放路径，一般不需要修改
    static largeFileDirPath = '/album' // 文件的存放路径，可以修改
    static fileNewName = '' // 返回的url地址要用到
    static fieldName = 'album' // 文件上传字段名，一般修改
    static userName = '' // 用户名，不修改，由客户端传过来

    static storage = multer.diskStorage({
        destination: function (req, file, cb) {
            // 每个请求进来先保存用户名  
            Upload.userName = req.body.user
            // 保存用户根目录
            Upload.userRootDirPath = path.join(Upload.publicPath, Upload.userName)
            if (!fs.existsSync(Upload.userRootDirPath))
                fs.mkdirSync(Upload.userRootDirPath, { recursive: true });
            cb(null, Upload.userRootDirPath)
        },
        filename: function (req, file, cb) {
            let { fileHash, chunkHash } = req.body

            // 如果是大文件的分片
            if (fileHash && chunkHash) {
                let chunkDirPath = path.join(Upload.userRootDirPath, Upload.chunkDirPath, fileHash)
                if (!fs.existsSync(chunkDirPath))
                    fs.mkdirSync(chunkDirPath, { recursive: true });
                cb(null, path.join(Upload.chunkDirPath, fileHash, chunkHash))
            }
            // 普通文件
            else {
                let singleFileDirPath = path.join(Upload.userRootDirPath, file.fieldname)
                if (!fs.existsSync(singleFileDirPath))
                    fs.mkdirSync(singleFileDirPath, { recursive: true });
                const oldFileName = file.originalname.match(/(.+)\.[^.]+$/)[1]
                const ext = file.originalname.match(/(\.[^.]+)$/)[1]
                Upload.fileNewName = oldFileName + Math.random().toString().slice(5) + ext
                cb(null, path.join(file.fieldname, Upload.fileNewName))
            }
        }
    })
    static limits = {
        fileSize: 1024 * 1024 * 15, // 文件大小15MB
        files: 9 // 限制文件数量为9个
    }
    static upload = multer({ storage: Upload.storage, limits: Upload.limits })

    static checkLackFields(sourceObj = {}, referenceArr = []) {
        let lackField = ''
        Object.setPrototypeOf(sourceObj, Object)
        referenceArr.forEach(item => {
            if (!sourceObj.hasOwnProperty(item)) {
                lackField += item + ','
            }
        })
        if (lackField.length) {
            lackField = lackField.slice(0, lackField.length - 1)
            return { code: 1, message: `请求未包含${lackField}字段` }
        }
    }

    static async uploadSingleFile(ctx, next) {
        let field = Upload.fieldName
        let error = await Upload.upload.single(field)(ctx, next).then().catch(err => err)
        if (error) {
            return ctx.body = {
                code: 1,
                message: error.message
            }
        }

        return ctx.body = { code: 0, message: '上传成功', data: `${SERVER}/${Upload.userName}/${Upload.fieldName}/${Upload.fileNewName}` }
    }

    static async uploadMultipleFile(ctx, next) {
        let fields = [
            {
                name: 'pictures',
                maxCount: 9
            }
        ]
        let error = await Upload.upload.fields(fields)(ctx, next).then().catch(err => err)
        if (error) {
            return ctx.body = {
                code: 1,
                message: error.message
            }
        }

        return ctx.body = { code: 0, message: '上传成功', data: `${SERVER}/${Upload.userName}/${fields[0].name}/${Upload.fileNewName}` }
    }

    static async uploadBase64(ctx, next) {
        const { ext, avatar } = ctx.request.body
        const base64Data = avatar.replace(/^data:image\/\w+;base64,/, "")
        const dataBuffer = Buffer.from(base64Data, 'base64')
        const targetPath = path.join(Upload.publicPath, Upload.fieldName)
        if (!fs.existsSync(targetPath))
            fs.mkdirSync(targetPath, { recursive: true });
        fs.writeFileSync(path.join(targetPath, Date.now() + ext), dataBuffer)

        return ctx.body = { code: 0, message: '上传成功', data: `${SERVER}/${Upload.userName}/${Upload.fieldName}/${Upload.fileNewName}` }
    }

    static async uploadBinary(ctx, next) {
        const ext = ctx.get('x-ext')
        let buffer = [];
        ctx.req.on('data', (chunk) => {
            buffer.push(chunk);
        });
        ctx.req.on('end', () => {
            buffer = Buffer.concat(buffer);
            const targetPath = path.join(Upload.publicPath, Upload.fieldName)
            if (!fs.existsSync(targetPath))
                fs.mkdirSync(targetPath, { recursive: true });
            const filePath = path.join(targetPath, Date.now() + ext)
            fs.writeFileSync(filePath, buffer);
        })
        return ctx.body = { code: 0, message: '上传成功', data: `${SERVER}/${Upload.userName}/${Upload.fieldName}/${Upload.fileNewName}` }
    }

    static async uploadLargeFile(ctx, next) {
        let fields = [
            {
                name: 'fileHash',
                maxCount: 1
            },
            {
                name: 'chunkHash',
                maxCount: 1
            },
            {
                name: 'chunk',
                maxCount: 1
            }
        ]
        let error = await Upload.upload.fields(fields)(ctx, next).then().catch(err => err)
        if (error) {
            return ctx.body = {
                code: 1,
                message: error.message
            }
        }

        return ctx.body = { code: 0, message: '文件分片上传成功' }
    }

    static async mergeChunks(ctx, next) {
        const { fileHash, ext, user } = ctx.request.body
        Upload.userRootDirPath = path.join(Upload.publicPath, user)
        let accessPath = `${SERVER}/${user + Upload.largeFileDirPath}/${fileHash + ext}`
        // 已存在不合并
        const largeFile = path.join(Upload.largeFileDirPath, fileHash + ext)
        if (fs.existsSync(largeFile))
            return ctx.body = { code: 0, message: '合并成功', data: accessPath }
        // 检查分片是否存在
        const chunkDirPath = path.join(Upload.userRootDirPath, Upload.chunkDirPath, fileHash)
        if (!fs.existsSync(chunkDirPath))
            return ctx.body = { code: 1, message: '未找到该文件的分片信息，请重新上传' }

        // 检查存放目录是否存在
        const targetPath = path.join(Upload.userRootDirPath, Upload.largeFileDirPath)
        if (!fs.existsSync(targetPath))
            fs.mkdirSync(targetPath)

        // 合并
        const ws = fs.createWriteStream(path.join(targetPath, fileHash + ext))
        const allChunksNames = fs.readdirSync(chunkDirPath)
        let currentChunk = 0;

        function readNextPart() {
            if (currentChunk >= allChunksNames.length)
                return ws.end()
            const rs = fs.createReadStream(path.join(chunkDirPath, allChunksNames[currentChunk]))

            rs.on('data', chunk => ws.write(chunk))
            rs.on('end', () => {
                currentChunk++;
                readNextPart();
            });
        }

        readNextPart()

        return ctx.body = { code: 0, message: '合并成功', data: accessPath }
    }

    static async existFile(ctx, next) {
        const { user, fileHash, ext } = ctx.request.body
        const chunkDirPath = path.join(Upload.publicPath, user, Upload.chunkDirPath, fileHash)
        const largeFilePath = path.join(Upload.publicPath, user, Upload.largeFileDirPath, fileHash + ext)

        if (fs.existsSync(largeFilePath)) {
            return ctx.body = { code: 0, message: '文件已存在，不需上传' }
        }
        else {
            if (!fs.existsSync(chunkDirPath)) {
                fs.mkdirSync(chunkDirPath, { recursive: true })
            }
            const existChunksNames = fs.readdirSync(chunkDirPath)
            return ctx.body = {
                code: 1,
                message: '文件不存在，请查看已上传的切片，并上传未上传的切片',
                data: { existChunks: existChunksNames }
            }
        }

    }
} 