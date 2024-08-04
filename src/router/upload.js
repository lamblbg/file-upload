const Router = require('koa-router')
const { uploadSingleFile, uploadMultipleFile, uploadBase64, uploadBinary, uploadLargeFile, mergeChunks, existFile } = require('../controller/upload')
const router = new Router({ prefix: '/upload' });

// 上传单个文件
router.post('/single', uploadSingleFile)

// 上传多个文件
router.post('/multiple', uploadMultipleFile)

// 上传base64
router.post('/base64', uploadBase64)

// 上传二进制文件
router.post('/binary', uploadBinary)

// 大文件分片上传
router.post('/largefile', uploadLargeFile)

// 大文件分片合并
router.post('/merge', mergeChunks)

// 大文件是否存在
router.post('/exist', existFile)

module.exports = router