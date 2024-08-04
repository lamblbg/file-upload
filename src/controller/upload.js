const path = require('path')
const fs = require('fs')
const multer = require('@koa/multer')

module.exports = class Upload {
    static publicPath = path.join(__dirname, '../public/')
    static chunksDirPath = path.join(Upload.publicPath, '/chunks')
    static largeFileDirPath = path.join(Upload.publicPath, '/large-file')

    static storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, Upload.publicPath)
        },
        filename: function (req, file, cb) {
            let { fileHash, chunkHash } = req.body
            // 如果是大文件的分片
            if (fileHash) {
                let chunksDirPath = path.join(Upload.publicPath, 'chunks/', fileHash)
                if (!fs.existsSync(chunksDirPath)) {
                    fs.mkdirSync(chunksDirPath, { recursive: true });
                }
                cb(null, path.join('chunks/', fileHash, chunkHash))
            }
            // 普通文件
            else {
                const oldName = file.originalname.match(/(.+)\.[^.]+$/)[1]
                const extName = file.originalname.match(/(\.[^.]+)$/)[1]
                const newName = oldName + Math.random().toString().slice(5) + extName
                cb(null, file.fieldname + '/' + newName)
            }

        }
    })
    static limits = {
        fileSize: 1024 * 1024 * 15, // 文件大小15MB
        files: 9 // 限制文件数量为9个
    }
    static upload = multer({ storage: this.storage, limits: this.limits })

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
        return { code: 0 }
    }

    static async uploadSingleFile(ctx, next) {
        let field = 'avatar'
        let error = await Upload.upload.single(field)(ctx, next).then().catch(err => err)
        if (error) {
            ctx.body = {
                code: 1,
                message: error.message
            }
        }

        let sourceOjb = { [ctx.request.file?.fieldname]: 1 }
        let referenceArr = [field]
        const { code, message } = await Upload.checkLackFields(sourceOjb, referenceArr)
        if (code != 0) {
            return ctx.body = { code, message }
        }

        return ctx.body = { code: 0, message: '上传成功' }
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

        let sourceOjb = ctx.request.files
        let referenceArr = fields.map(field => field.name)
        const { code, message } = await Upload.checkLackFields(sourceOjb, referenceArr)
        if (code != 0) {
            return ctx.body = { code, message }
        }

        return ctx.body = { code: 0, message: '上传成功' }
    }

    static async uploadBase64(ctx, next) {
        const { ext, avatar } = ctx.request.body
        const base64Data = avatar.replace(/^data:image\/\w+;base64,/, "")
        const dataBuffer = Buffer.from(base64Data, 'base64')
        fs.writeFileSync(path.join(Upload.publicPath, '/avatar', Date.now() + ext), dataBuffer)

        return ctx.body = { code: 0, message: '上传成功' }
    }

    static async uploadBinary(ctx, next) {
        const ext = ctx.get('x-ext')
        let buffer = [];
        ctx.req.on('data', (chunk) => {
            buffer.push(chunk);
        });
        ctx.req.on('end', () => {
            buffer = Buffer.concat(buffer);
            const filePath = path.join(Upload.publicPath, '/avatar', Date.now() + ext)
            fs.writeFileSync(filePath, buffer);
        })
        return ctx.body = { code: 0, message: '上传成功' }
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

        return ctx.body = { code: 0, message: '上传成功' }
    }

    static async mergeChunks(ctx, next) {
        const { fileHash, ext } = ctx.request.body

        // 已存在不合并
        const largeFilePath = path.join(Upload.largeFileDirPath, fileHash + ext)
        if (fs.existsSync(largeFilePath)) {
            return ctx.body = { code: 0, message: '合并成功' }
        }

        // 检查分片是否存在
        const chunkDirPath = path.join(Upload.chunksDirPath, fileHash)
        if (!fs.existsSync(chunkDirPath)) {
            return ctx.body = { code: 1, message: '未找到该文件的分片信息，请重新上传' }
        }

        // 检查存放目录是否存在
        const targetPath = path.join(Upload.publicPath, '/large-file')
        if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath)
        }

        // 合并
        const ws = fs.createWriteStream(path.join(targetPath, fileHash + ext))
        const allChunksNames = fs.readdirSync(chunkDirPath)
        let currentChunk = 0;

        function readNextPart() {
            if (currentChunk >= allChunksNames.length) {
                ws.end()
                return
            }
            const rs = fs.createReadStream(path.join(chunkDirPath, allChunksNames[currentChunk]))

            rs.on('data', chunk => ws.write(chunk))
            rs.on('end', () => {
                currentChunk++;
                readNextPart();
            });
        }

        readNextPart()

        return ctx.body = { code: 0, message: '合并成功' }
    }

    static async existFile(ctx, next) {
        const { fileHash, ext } = ctx.request.body
        const chunkDirPath = path.join(Upload.chunksDirPath, fileHash)
        const largeFilePath = path.join(Upload.largeFileDirPath, fileHash + ext)

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