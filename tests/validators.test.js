function createResults() {
  return {
    passed: 0,
    failed: 0,
    tests: [],
  };
}

function assert(results, condition, message) {
  if (condition) {
    results.passed += 1;
    results.tests.push({ status: 'PASS', message });
    return;
  }

  results.failed += 1;
  results.tests.push({ status: 'FAIL', message });
}

export function runValidatorTests() {
  const results = createResults();

  const validPdfFile = new File(['test'], 'test.pdf', {
    type: 'application/pdf',
  });
  const validPdfResult = window.Validators.validatePdfFile(validPdfFile);
  assert(results, validPdfResult.valid === true, 'validatePdfFile: valid PDF file');

  const invalidTypeFile = new File(['test'], 'test.txt', { type: 'text/plain' });
  const invalidTypeResult = window.Validators.validatePdfFile(invalidTypeFile);
  assert(results, invalidTypeResult.valid === false, 'validatePdfFile: invalid file type');

  const largePdfFile = new File([new ArrayBuffer(51 * 1024 * 1024)], 'large.pdf', {
    type: 'application/pdf',
  });
  const largePdfResult = window.Validators.validatePdfFile(largePdfFile);
  assert(results, largePdfResult.valid === false, 'validatePdfFile: file too large (51MB)');

  const emptyFile = new File([], 'empty.pdf', { type: 'application/pdf' });
  const emptyResult = window.Validators.validatePdfFile(emptyFile);
  assert(results, emptyResult.valid === false, 'validatePdfFile: empty file rejected');

  const noFileResult = window.Validators.validatePdfFile(null);
  assert(results, noFileResult.valid === false, 'validatePdfFile: null file rejected');

  const validPngFile = new File(['test'], 'test.png', { type: 'image/png' });
  const validPngResult = window.Validators.validateImageFile(validPngFile);
  assert(results, validPngResult.valid === true, 'validateImageFile: valid PNG file');

  const validJpegFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
  const validJpegResult = window.Validators.validateImageFile(validJpegFile);
  assert(results, validJpegResult.valid === true, 'validateImageFile: valid JPEG file');

  const invalidImageType = new File(['test'], 'test.pdf', {
    type: 'application/pdf',
  });
  const invalidImageResult = window.Validators.validateImageFile(invalidImageType);
  assert(results, invalidImageResult.valid === false, 'validateImageFile: invalid image type');

  const largeImageFile = new File([new ArrayBuffer(6 * 1024 * 1024)], 'large.png', {
    type: 'image/png',
  });
  const largeImageResult = window.Validators.validateImageFile(largeImageFile);
  assert(results, largeImageResult.valid === false, 'validateImageFile: image too large (6MB)');

  const validPageResult = window.Validators.validatePageCount(100);
  assert(results, validPageResult.valid === true, 'validatePageCount: 100 pages valid');

  const tooManyPagesResult = window.Validators.validatePageCount(600);
  assert(results, tooManyPagesResult.valid === false, 'validatePageCount: 600 pages exceeds limit');

  const zeroPagesResult = window.Validators.validatePageCount(0);
  assert(results, zeroPagesResult.valid === false, 'validatePageCount: 0 pages invalid');

  assert(
    results,
    window.Validators.FILE_SIZE_LIMITS.PDF === 50 * 1024 * 1024,
    'FILE_SIZE_LIMITS.PDF = 50MB'
  );
  assert(
    results,
    window.Validators.FILE_SIZE_LIMITS.IMAGE === 5 * 1024 * 1024,
    'FILE_SIZE_LIMITS.IMAGE = 5MB'
  );
  assert(
    results,
    window.Validators.PAGE_LIMITS.MAX_PAGES === 500,
    'PAGE_LIMITS.MAX_PAGES = 500'
  );

  return results;
}

window.runValidatorTests = runValidatorTests;
