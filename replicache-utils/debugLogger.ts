/// <reference lib="dom" />

type LogType = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
    type: LogType;
    message: string;
    args?: any[];
    timestamp: string;
}

function debugLogger() {
    if (typeof window === "undefined") {
        return;
    }

    let logPanel: HTMLElement | null = null;
    let logContent: HTMLElement | null = null;
    let isExpanded = false;
    let autoScroll = true;
    let isPinned = false;

    // Load JSON formatter from CDN
    const loadJsonFormatter = () => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/json-formatter-js@2.3.4/dist/json-formatter.umd.min.js';
        script.async = true;
        document.head.appendChild(script);
        return new Promise((resolve) => {
            script.onload = resolve;
        });
    };

    function createLogPanel() {
        if (logPanel) return;

        // Create the main panel
        logPanel = document.createElement('div');
        logPanel.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            width: 200px;
            height: 30px;
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            border-radius: 4px;
            overflow: hidden;
            transition: all 0.3s ease;
            z-index: 9999;
            font-family: monospace;
            font-size: 12px;
        `;

        // Create header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 5px;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
        `;

        const title = document.createElement('span');
        title.textContent = 'Debug Logs';
        header.appendChild(title);

        const pinButton = document.createElement('button');
        pinButton.textContent = '📌';
        pinButton.style.cssText = `
            background: none;
            border: none;
            color: #fff;
            cursor: pointer;
            padding: 2px 5px;
        `;
        pinButton.onclick = (e: MouseEvent) => {
            e.stopPropagation();
            isPinned = !isPinned;
            pinButton.style.color = isPinned ? '#4CAF50' : '#fff';
            
            if (isPinned) {
                isExpanded = true;
                logPanel!.style.width = '400px';
                logPanel!.style.height = '75vh';
            } else {
                isExpanded = false;
                logPanel!.style.width = '200px';
                logPanel!.style.height = '30px';
            }
        };
        header.appendChild(pinButton);

        // Create content area
        logContent = document.createElement('div');
        logContent.style.cssText = `
            padding: 5px;
            height: calc(75vh - 30px);
            overflow-y: auto;
            scroll-behavior: smooth;
        `;

        logPanel.appendChild(header);
        logPanel.appendChild(logContent);
        document.body.appendChild(logPanel);

        // Add hover handlers
        logPanel.addEventListener('mouseenter', () => {
            if (!isPinned) {
                isExpanded = true;
                logPanel!.style.width = '400px';
                logPanel!.style.height = '75vh';
            }
        });

        logPanel.addEventListener('mouseleave', () => {
            if (!isPinned) {
                isExpanded = false;
                logPanel!.style.width = '200px';
                logPanel!.style.height = '30px';
            }
        });
    }

    function getTypeColor(type: LogType): string {
        switch (type) {
            case 'info': return '#4CAF50';
            case 'warn': return '#FFC107';
            case 'error': return '#F44336';
            case 'debug': return '#2196F3';
            default: return '#fff';
        }
    }

    function formatArgs(args: any[]): HTMLElement {
        const container = document.createElement('div');
        container.style.marginTop = '4px';
        
        args.forEach(arg => {
            const argContainer = document.createElement('div');
            argContainer.style.marginLeft = '8px';
            
            if (typeof arg === 'object' && arg !== null) {
                // @ts-ignore - json-formatter-js will be loaded from CDN
                const formatter = new JSONFormatter(arg, 1, {
                    hoverPreviewEnabled: true,
                    hoverPreviewArrayCount: 100,
                    hoverPreviewFieldCount: 5,
                    theme: 'dark',
                    animateOpen: true,
                    animateClose: true
                });
                argContainer.appendChild(formatter.render());
            } else {
                argContainer.textContent = String(arg);
            }
            
            container.appendChild(argContainer);
        });
        
        return container;
    }

    async function log(type: LogType, message: string, ...args: any[]) {
        if (!logPanel) {
            createLogPanel();
            await loadJsonFormatter();
        }

        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.style.cssText = `
            margin-bottom: 4px;
            padding: 2px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        `;

        const typeSpan = document.createElement('span');
        typeSpan.textContent = `[${type.toUpperCase()}]`;
        typeSpan.style.color = getTypeColor(type);
        typeSpan.style.marginRight = '4px';

        const timeSpan = document.createElement('span');
        timeSpan.textContent = `[${timestamp}]`;
        timeSpan.style.color = '#888';
        timeSpan.style.marginRight = '4px';

        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;

        logEntry.appendChild(typeSpan);
        logEntry.appendChild(timeSpan);
        logEntry.appendChild(messageSpan);

        if (args.length > 0) {
            logEntry.appendChild(formatArgs(args));
        }
        
        logContent!.appendChild(logEntry);

        if (autoScroll) {
            logContent!.scrollTop = logContent!.scrollHeight;
        }
    }

    return {
        info: (message: string, ...args: any[]) => log('info', message, ...args),
        warn: (message: string, ...args: any[]) => log('warn', message, ...args),
        error: (message: string, ...args: any[]) => log('error', message, ...args),
        debug: (message: string, ...args: any[]) => log('debug', message, ...args),
    };
}

export const logger = debugLogger();