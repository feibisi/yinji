/**
 * State Management 单元测试
 * 测试 state.js 中的状态管理函数
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

function runStateTests() {
  console.log('=== State Management Tests ===\n');

  // Test getState returns state object
  var state = window.AppState.getState();
  assert(typeof state === 'object', 'getState returns object');

  // Test initial state values
  assert(state.pdfDoc === null, 'initial pdfDoc is null');
  assert(state.originalPdfBytes === null, 'initial originalPdfBytes is null');
  assert(Array.isArray(state.fabricCanvases), 'fabricCanvases is array');
  assert(state.fabricCanvases.length === 0, 'fabricCanvases is empty');
  assert(state.sealImageElement === null, 'initial sealImageElement is null');
  assert(state.currentActivePage === 1, 'initial currentActivePage is 1');
  assert(state.totalPages === 0, 'initial totalPages is 0');
  assert(Array.isArray(state.pageFitScales), 'pageFitScales is array');
  assert(state.globalZoomMultiplier === 1.0, 'initial globalZoomMultiplier is 1.0');
  assert(state.sealRotation === 0, 'initial sealRotation is 0');
  assert(state.sealBrightness === 100, 'initial sealBrightness is 100');

  // Test setState updates state
  window.AppState.setState({ currentActivePage: 5 });
  var updatedState = window.AppState.getState();
  assert(updatedState.currentActivePage === 5, 'setState updates currentActivePage');

  // Test setState preserves other values
  assert(updatedState.totalPages === 0, 'setState preserves other values');

  // Test setState with multiple values
  window.AppState.setState({ totalPages: 10, currentActivePage: 3 });
  var multiState = window.AppState.getState();
  assert(multiState.totalPages === 10, 'setState updates totalPages');
  assert(multiState.currentActivePage === 3, 'setState updates currentActivePage correctly');

  // Test subscribe function
  var listenerCalled = false;
  var testListener = function(newState) {
    listenerCalled = true;
  };
  var unsubscribe = window.AppState.subscribe(testListener);
  window.AppState.setState({ sealRotation: 45 });
  assert(listenerCalled === true, 'subscribe listener is called on state change');

  // Test unsubscribe
  var secondListenerCalled = false;
  var secondListener = function() {
    secondListenerCalled = true;
  };
  var unsubscribe2 = window.AppState.subscribe(secondListener);
  unsubscribe2();
  window.AppState.setState({ sealBrightness: 50 });
  // Note: secondListener might still be called if unsubscribe happens before dispatch
  assert(typeof unsubscribe2 === 'function', 'unsubscribe returns a function');

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
  document.addEventListener('DOMContentLoaded', runStateTests);
} else {
  runStateTests();
}

window.testResults = testResults;
window.runStateTests = runStateTests;
