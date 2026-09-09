/**
 * File validation utilities for PDF Stamper
 * Provides validation functions for file size, type, and content
 */

// ==================== Constants ====================

const FILE_SIZE_LIMITS = {
  PDF: 50 * 1024 * 1024,    // 50MB
  DOCUMENT_IMAGE: 20 * 1024 * 1024, // 20MB
  IMAGE: 5 * 1024 * 1024,   // 5MB
};

const PAGE_LIMITS = {
  MAX_PAGES: 500,
};

const ALLOWED_TYPES = {
  PDF: ['application/pdf'],
  DOCUMENT_IMAGE: ['image/png', 'image/jpeg', 'image/jpg'],
  IMAGE: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'],
};

function isPdfLikeFile(file) {
  return Boolean(
    file &&
    (
      ALLOWED_TYPES.PDF.includes(file.type) ||
      /\.pdf$/i.test(file.name || '')
    )
  );
}

function isDocumentImageFile(file) {
  return Boolean(
    file &&
    (
      ALLOWED_TYPES.DOCUMENT_IMAGE.includes(file.type) ||
      /\.(png|jpe?g)$/i.test(file.name || '')
    )
  );
}

// ==================== Validation Functions ====================

/**
 * Validate PDF file
 * @param {File} file - PDF file to validate
 * @returns {{valid: boolean, error: string|null}}
 */
function validatePdfFile(file) {
  // Check if file exists
  if (!file) {
    return { valid: false, error: '请选择一个文件' };
  }

  // Check file type
  if (!isPdfLikeFile(file)) {
    return { valid: false, error: '请选择有效的 PDF 文件' };
  }

  // Check file size
  if (file.size > FILE_SIZE_LIMITS.PDF) {
    const sizeMB = Math.round(file.size / 1024 / 1024);
    return {
      valid: false,
      error: `PDF 文件过大（${sizeMB}MB），请选择小于 50MB 的文件`
    };
  }

  // Check if file is empty
  if (file.size === 0) {
    return { valid: false, error: 'PDF 文件为空' };
  }

  return { valid: true, error: null };
}

function validateDocumentFile(file) {
  if (!file) {
    return { valid: false, error: '请选择一个文件' };
  }

  if (isPdfLikeFile(file)) {
    return validatePdfFile(file);
  }

  if (!isDocumentImageFile(file)) {
    return { valid: false, error: '请选择 PDF、PNG 或 JPG 文件' };
  }

  if (file.size > FILE_SIZE_LIMITS.DOCUMENT_IMAGE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    return {
      valid: false,
      error: `图片文件过大（${sizeMB}MB），请选择小于 20MB 的 PNG 或 JPG 文件`
    };
  }

  if (file.size === 0) {
    return { valid: false, error: '图片文件为空' };
  }

  return { valid: true, error: null };
}

/**
 * Validate image file (for stamps)
 * @param {File} file - Image file to validate
 * @returns {{valid: boolean, error: string|null}}
 */
function validateImageFile(file) {
  // Check if file exists
  if (!file) {
    return { valid: false, error: '请选择一个图片文件' };
  }

  // Check file type
  if (!ALLOWED_TYPES.IMAGE.includes(file.type)) {
    return {
      valid: false,
      error: '请选择有效的图片文件（PNG、JPG、GIF、WebP）'
    };
  }

  // Check file size
  if (file.size > FILE_SIZE_LIMITS.IMAGE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    return {
      valid: false,
      error: `图片文件过大（${sizeMB}MB），请选择小于 5MB 的文件`
    };
  }

  // Check if file is empty
  if (file.size === 0) {
    return { valid: false, error: '图片文件为空' };
  }

  return { valid: true, error: null };
}

/**
 * Validate PDF page count
 * @param {number} pageCount - Number of pages in PDF
 * @returns {{valid: boolean, error: string|null}}
 */
function validatePageCount(pageCount) {
  if (pageCount > PAGE_LIMITS.MAX_PAGES) {
    return {
      valid: false,
      error: `PDF 页数过多（${pageCount} 页），最多支持 ${PAGE_LIMITS.MAX_PAGES} 页`
    };
  }

  if (pageCount < 1) {
    return { valid: false, error: 'PDF 文件无效或损坏' };
  }

  return { valid: true, error: null };
}

/**
 * Validate image dimensions (optional check)
 * @param {HTMLImageElement} image - Image element to validate
 * @returns {{valid: boolean, error: string|null}}
 */
function validateImageDimensions(image) {
  const MAX_DIMENSION = 4096; // 4K resolution limit

  if (image.naturalWidth > MAX_DIMENSION || image.naturalHeight > MAX_DIMENSION) {
    return {
      valid: false,
      error: `图片尺寸过大（${image.naturalWidth}x${image.naturalHeight}），最大支持 ${MAX_DIMENSION}x${MAX_DIMENSION}`
    };
  }

  if (image.naturalWidth === 0 || image.naturalHeight === 0) {
    return { valid: false, error: '图片加载失败或损坏' };
  }

  return { valid: true, error: null };
}

// ==================== Exports ====================

// Export for use in main.js
window.Validators = {
  validatePdfFile,
  validateDocumentFile,
  validateImageFile,
  validatePageCount,
  validateImageDimensions,
  FILE_SIZE_LIMITS,
  PAGE_LIMITS,
  ALLOWED_TYPES,
};
