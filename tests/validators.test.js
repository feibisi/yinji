/**
 * Validators 单元测试
 * 测试 validators.js 中的所有验证函数
 */

let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function assert(condition, message) {
  if (condition) {
    testResults.passed++;
    testResults.tests.push({ status: 'PASS', message: message });
  } else {
    testResults.failed++;
    testResults.tests.push({ status: 'FAIL', message: message });
  }
}

function runValidatorTests() {
  console.log('=== Validator Tests ===\n');

  // Test validatePdfFile - valid PDF
  const validPdfFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
  const validPdfResult = window.Validators.validatePdfFile(validPdfFile);
  assert(validPdfResult.valid === true, 'validatePdfFile: valid PDF file');

  // Test validatePdfFile - invalid type
  const invalidTypeFile = new File(['test'], 'test.txt', { type: 'text/plain' });
  const invalidTypeResult = window.Validators.validatePdfFile(invalidTypeFile);
  assert(invalidTypeResult.valid === false, 'validatePdfFile: invalid file type');

  // Test validatePdfFile - file too large (create 51MB file virtually)
  const largePdfFile = new File([new ArrayBuffer(51 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });
  const largePdfResult = window.Validators.validatePdfFile(largePdfFile);
  assert(largePdfResult.valid === false, 'validatePdfFile: file too large (51MB)');

  // Test validatePdfFile - empty file
  const emptyFile = new File([], 'empty.pdf', { type: 'application/pdf' });
  const emptyResult = window.Validators.validatePdfFile(emptyFile);
  assert(emptyResult.valid === false, 'validatePdfFile: empty file rejected');

  // Test validatePdfFile - no file
  const noFileResult = window.Validators.validatePdfFile(null);
  assert(noFileResult.valid === false, 'validatePdfFile: null file rejected');

  // Test validateImageFile - valid PNG
  const validPngFile = new File(['test'], 'test.png', { type: 'image/png' });
  const validPngResult = window.Validators.validateImageFile(validPngFile);
  assert(validPngResult.valid === true, 'validateImageFile: valid PNG file');

  // Test validateImageFile - valid JPEG
  const validJpegFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
  const validJpegResult = window.Validators.validateImageFile(validJpegFile);
  assert(validJpegResult.valid === true, 'validateImageFile: valid JPEG file');

  // Test validateImageFile - invalid type
  const invalidImageType = new File(['test'], 'test.pdf', { type: 'application/pdf' });
  const invalidImageResult = window.Validators.validateImageFile(invalidImageType);
  assert(invalidImageResult.valid === false, 'validateImageFile: invalid image type');

  // Test validateImageFile - file too large (6MB)
  const largeImageFile = new File([new ArrayBuffer(6 * 1024 * 1024)], 'large.png', { type: 'image/png' });
  const largeImageResult = window.Validators.validateImageFile(largeImageFile);
  assert(largeImageResult.valid === false, 'validateImageFile: image too large (6MB)');

  // Test validatePageCount - valid count
  const validPageResult = window.Validators.validatePageCount(100);
  assert(validPageResult.valid === true, 'validatePageCount: 100 pages valid');

  // Test validatePageCount - too many pages (600)
  const tooManyPagesResult = window.Validators.validatePageCount(600);
  assert(tooManyPagesResult.valid === false, 'validatePageCount: 600 pages exceeds limit');

  // Test validatePageCount - zero pages
  const zeroPagesResult = window.Validators.validatePageCount(0);
  assert(zeroPagesResult.valid === false, 'validatePageCount: 0 pages invalid');

  // Test constants
  assert(window.Validators.FILE_SIZE_LIMITS.PDF === 50 * 1024 * 1024, 'FILE_SIZE_LIMITS.PDF = 50MB');
  assert(window.Validators.FILE_SIZE_LIMITS.IMAGE === 5 * 1024 * 1024, 'FILE_SIZE_LIMITS.IMAGE = 5MB');
  assert(window.Validators.PAGE_LIMITS.MAX_PAGES === 500, 'PAGE_LIMITS.MAX_PAGES = 500');

  printTestResults();
}

function printTestResults() {
  var total = testResults.passed + testResults.failed;
  var percentage = total > 0 ? Math.round((testResults.passed / total) * 100) : 0;

  console.log('\n=== Test Results ===');
  console.log('Total: ' + total + ' | Passed: ' + testResults.passed + ' | Failed: ' + testResults.failed);
  console.log('Pass Rate: ' + percentage + '%\n');

  testResults.tests.forEach(function(test, index) {
    var icon = test.status === 'PASS' ? 'PASS' : 'FAIL';
    console.log('  ' + icon + ': ' + test.message);
  });

  var resultsElement = document.getElementById('test-results');
  if (resultsElement) {
    resultsElement.textContent = 'Total: ' + total + ' | Passed: ' + testResults.passed + ' | Failed: ' + testResults.failed + ' | Pass Rate: ' + percentage + '%';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runValidatorTests);
} else {
  runValidatorTests();
}

window.testResults = testResults;
window.runValidatorTests = runValidatorTests;
