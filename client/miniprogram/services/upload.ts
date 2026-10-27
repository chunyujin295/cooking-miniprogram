import { BASE_URL } from '../config/env'
import { session } from '../store/session'

export interface UploadedImage {
  key: string
  url: string
}

/** 选图（可多选）→ 客户端压缩 → 逐张上传，purpose 决定存储目录 */
export function chooseAndUploadImages(
  count = 9,
  purpose: 'recipe' | 'avatar' = 'recipe',
): Promise<UploadedImage[]> {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      success(res) {
        const uploads = res.tempFiles.map((file) =>
          compressAndUploadImage(file.tempFilePath, purpose),
        )
        Promise.all(uploads).then(resolve, reject)
      },
      fail(err) {
        reject(new Error(err.errMsg || '未选择图片'))
      },
    })
  })
}

export function compressAndUploadImage(
  filePath: string,
  purpose: 'recipe' | 'avatar' = 'recipe',
): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: filePath,
      quality: 70,
      success(compressed) {
        uploadOne(compressed.tempFilePath, purpose).then(resolve, reject)
      },
      fail() {
        uploadOne(filePath, purpose).then(resolve, reject)
      },
    })
  })
}

function uploadOne(filePath: string, purpose: 'recipe' | 'avatar'): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${BASE_URL}/media/upload`,
      filePath,
      name: 'file',
      formData: { purpose },
      header: {
        Authorization: `Bearer ${session.getToken()}`,
      },
      success(uploadRes) {
        try {
          const body = JSON.parse(uploadRes.data) as {
            code: number
            message: string
            data: UploadedImage | null
          }
          if (body.code !== 0 || !body.data) {
            reject(new Error(body.message || '上传失败'))
            return
          }
          resolve(body.data)
        } catch {
          reject(new Error('上传返回格式错误'))
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '上传失败'))
      },
    })
  })
}
