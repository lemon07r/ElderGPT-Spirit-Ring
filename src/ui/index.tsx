import React from 'react';
import ReactDOM from 'react-dom';
import { ElderGPTApp } from './ElderGPTApp';

const ROOT_ID = 'eldergpt-spirit-ring-root';

type ReactDomRuntime = typeof ReactDOM & {
  createRoot?: (container: Element) => {
    render: (element: React.ReactElement) => void;
  };
  render?: (element: React.ReactElement, container: Element) => void;
};

type CreateRootReactDomRuntime = ReactDomRuntime & {
  createRoot: NonNullable<ReactDomRuntime['createRoot']>;
};

export function canUseCreateRoot(
  runtime: ReactDomRuntime,
): runtime is CreateRootReactDomRuntime {
  return typeof runtime.createRoot === 'function';
}

export function initUI() {
  console.log('[ElderGPT] Initializing UI injection...');

  if (document.getElementById(ROOT_ID)) {
    console.warn('[ElderGPT] UI already injected.');
    return;
  }

  const rootDiv = document.createElement('div');
  rootDiv.id = ROOT_ID;

  rootDiv.style.position = 'fixed';
  rootDiv.style.top = '0';
  rootDiv.style.left = '0';
  rootDiv.style.width = '100vw';
  rootDiv.style.height = '100vh';
  rootDiv.style.pointerEvents = 'none';
  rootDiv.style.zIndex = '2147483647';

  document.body.appendChild(rootDiv);

  const ISOLATED_EVENTS = [
    'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu',
    'pointerdown', 'pointerup',
    'keydown', 'keyup', 'keypress',
    'input', 'change',
    'focusin', 'focusout',
    'wheel',
  ] as const;

  for (const eventName of ISOLATED_EVENTS) {
    rootDiv.addEventListener(eventName, (event: Event) => {
      event.stopPropagation();
    }, false);
  }

  try {
    const ReactRuntime = window.React || React;
    // AFNM exposes the renderer on the page already. Using that surface directly
    // avoids the incompatible react-dom/client path that broke the installed build.
    const ReactDOMRuntime = (window.ReactDOM || ReactDOM) as ReactDomRuntime;

    if (canUseCreateRoot(ReactDOMRuntime)) {
      const root = ReactDOMRuntime.createRoot(rootDiv);
      root.render(ReactRuntime.createElement(ElderGPTApp));
    } else if (typeof ReactDOMRuntime.render === 'function') {
      ReactDOMRuntime.render(ReactRuntime.createElement(ElderGPTApp), rootDiv);
    } else {
      throw new Error('No compatible ReactDOM renderer found.');
    }
    console.log('[ElderGPT] UI injected successfully.');
  } catch (error) {
    rootDiv.remove();
    console.error('[ElderGPT] Failed to inject React tree:', error);
  }
}
