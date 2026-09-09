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

export function runStateTests() {
  const results = createResults();

  const state = window.AppState.getState();
  assert(results, typeof state === 'object', 'getState returns object');
  assert(results, state.pdfDoc === null, 'initial pdfDoc is null');
  assert(results, state.originalPdfBytes === null, 'initial originalPdfBytes is null');
  assert(results, state.originalSourceBytes === null, 'initial originalSourceBytes is null');
  assert(results, Array.isArray(state.fabricCanvases), 'fabricCanvases is array');
  assert(results, state.fabricCanvases.length === 0, 'fabricCanvases is empty');
  assert(results, state.sealImageElement === null, 'initial sealImageElement is null');
  assert(results, state.sealOriginalImageSrc === '', 'initial original seal source is empty');
  assert(results, state.autoRemoveSealBackground === true, 'auto background removal defaults to enabled');
  assert(results, state.currentActivePage === 1, 'initial currentActivePage is 1');
  assert(results, state.totalPages === 0, 'initial totalPages is 0');
  assert(results, Array.isArray(state.pageFitScales), 'pageFitScales is array');
  assert(results, state.globalZoomMultiplier === 1.0, 'initial globalZoomMultiplier is 1.0');
  assert(results, state.sealRotation === 0, 'initial sealRotation is 0');
  assert(results, state.sealBrightness === 100, 'initial sealBrightness is 100');

  window.AppState.setState({ currentActivePage: 5 });
  const updatedState = window.AppState.getState();
  assert(results, updatedState.currentActivePage === 5, 'setState updates currentActivePage');
  assert(results, updatedState.totalPages === 0, 'setState preserves other values');

  window.AppState.setState({ totalPages: 10, currentActivePage: 3 });
  const multiState = window.AppState.getState();
  assert(results, multiState.totalPages === 10, 'setState updates totalPages');
  assert(results, multiState.currentActivePage === 3, 'setState updates currentActivePage correctly');

  let listenerCalled = false;
  const unsubscribe = window.AppState.subscribe(() => {
    listenerCalled = true;
  });
  window.AppState.setState({ sealRotation: 45 });
  assert(results, listenerCalled === true, 'subscribe listener is called on state change');
  unsubscribe();

  let secondListenerCalled = false;
  const unsubscribeSecond = window.AppState.subscribe(() => {
    secondListenerCalled = true;
  });
  unsubscribeSecond();
  window.AppState.setState({ sealBrightness: 50 });
  assert(results, secondListenerCalled === false, 'unsubscribe removes listener');

  return results;
}

window.runStateTests = runStateTests;
