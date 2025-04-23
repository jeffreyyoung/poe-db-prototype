const LogType = {
    INFO: 'info',
    ERROR: 'error',
    WARNING: 'warning',
    LOG: 'log'
};

const LogColors = {
    [LogType.INFO]: '#007bff',    // Blue
    [LogType.ERROR]: '#dc3545',   // Red
    [LogType.WARNING]: '#ffc107', // Yellow
    [LogType.LOG]: '#28a745'      // Green
};

class Logger {
    static log(type, message, ...args) {
        const color = LogColors[type];
        console.log(`%c[${type.toUpperCase()}]`, `color: ${color}; font-weight: bold;`, message, ...args);
    }

    static info(message, ...args) {
        this.log(LogType.INFO, message, ...args);
    }

    static error(message, ...args) {
        this.log(LogType.ERROR, message, ...args);
    }

    static warning(message, ...args) {
        this.log(LogType.WARNING, message, ...args);
    }

    static log(message, ...args) {
        this.log(LogType.LOG, message, ...args);
    }
}

export default Logger; 