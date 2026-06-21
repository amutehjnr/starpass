'use strict';

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Allowed MIME types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/mov', 'video/avi', 'video/webm'];

const createStorage = (folder, resourceType = 'image', transformation = []) => {
  return new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder: `starpass/${folder}`,
      resource_type: resourceType,
      allowed_formats: resourceType === 'image' ? ['jpg', 'jpeg', 'png', 'webp'] : ['mp4', 'mov', 'avi', 'webm'],
      transformation: resourceType === 'image' ? transformation : [],
      public_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }),
  });
};

const fileFilter = (allowedTypes) => (req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`), false);
  }
};

// Multer upload instances
const uploadAvatar = multer({
  storage: createStorage('avatars', 'image', [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter(ALLOWED_IMAGE_TYPES),
});

const uploadEventBanner = multer({
  storage: createStorage('events/banners', 'image', [{ width: 1200, height: 630, crop: 'fill' }]),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter(ALLOWED_IMAGE_TYPES),
});

const uploadGallery = multer({
  storage: createStorage('gallery', 'image', [{ width: 1200, quality: 'auto' }]),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter(ALLOWED_IMAGE_TYPES),
});

const uploadGiftCard = multer({
  storage: createStorage('giftcards', 'image', [{ quality: 'auto' }]),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter(ALLOWED_IMAGE_TYPES),
});

const uploadVerificationDoc = multer({
  storage: createStorage('verification-docs', 'image', [{ quality: 'auto' }]),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: fileFilter(ALLOWED_IMAGE_TYPES),
});

const uploadVideo = multer({
  storage: createStorage('videos', 'video'),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: fileFilter(ALLOWED_VIDEO_TYPES),
});

const deleteFile = async (publicId, resourceType = 'image') => {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error('Cloudinary delete error:', err);
  }
};

module.exports = {
  cloudinary,
  uploadAvatar,
  uploadEventBanner,
  uploadGallery,
  uploadGiftCard,
  uploadVideo,
  deleteFile,
  uploadVerificationDoc,
};
