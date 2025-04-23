/// <reference lib="dom" />

function debugLogger() {
    if (typeof window === "undefined") {
        return;
    }

    let logPanel: HTMLElement | null = null;
    let logContent: HTMLElement | null = null;
    let isExpanded = false;
    let autoScroll = true;

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
            autoScroll = !autoScroll;
            pinButton.style.color = autoScroll ? '#fff' : '#888';
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
            isExpanded = true;
            logPanel!.style.width = '400px';
            logPanel!.style.height = '75vh';
        });

        logPanel.addEventListener('mouseleave', () => {
            isExpanded = false;
            logPanel!.style.width = '200px';
            logPanel!.style.height = '30px';
        });
    }

    function log(message: string) {
        if (!logPanel) {
            createLogPanel();
        }

        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.style.cssText = `
            margin-bottom: 4px;
            padding: 2px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        `;
        logEntry.innerHTML = `<span style="color: #888">[${timestamp}]</span> ${message}`;
        
        logContent!.appendChild(logEntry);

        if (autoScroll) {
            logContent!.scrollTop = logContent!.scrollHeight;
        }
    }

    return {
        log,
    };
}

export const logger = debugLogger();